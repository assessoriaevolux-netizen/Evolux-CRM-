-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — Permissões do cargo valem para todo mundo (12/11/2026)
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez sem problema.
--
-- O que muda: toda permissão que o gestor marca num cargo (Configurações →
-- Hierarquia) passa a valer de verdade para quem está nesse cargo.
--
-- 1. Pessoa sem cargo válido no cadastro (cadastro antigo, cargo apagado) passa
--    a seguir o cargo da empresa que corresponde à função dela. Antes ela ficava
--    presa nas permissões "de fábrica" e nada que o gestor marcava chegava nela.
-- 2. Quem cuida de uma equipe enxerga a equipe, seja qual for o cargo: vale o
--    lugar da pessoa na equipe (supervisor ou representante da equipe).
-- 3. "Gerenciar todos os usuários": edita e remove qualquer pessoa abaixo do
--    seu cargo, de qualquer equipe.
-- 4. "Cadastrar usuários" para quem não lidera equipe: cadastra na equipe de
--    que participa.
-- 5. "Ver notificações da equipe" para quem não lidera: vê as dos colegas.
-- 6. "Alterar permissões dos cargos" funciona sozinha (sem precisar de
--    "Gerenciar cargos") e não desliga mais, sem querer, o que o cargo já tinha.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Cargo que vale para a pessoa ────────────────────────────────────────
-- O cargo do cadastro; se não existir nesta empresa, o cargo que corresponde à
-- função dela (o de nome igual vem primeiro).
create or replace function public.crm_hierarquia_de(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.id::text
       from public.profiles p
       join public.hierarquias h on h.id::text = p.hierarquia_id::text and h.empresa_id::text = p.empresa_id::text
      where p.id = p_user
      limit 1),
    (select h.id::text
       from public.profiles p
       join public.hierarquias h on h.empresa_id::text = p.empresa_id::text
      cross join lateral (select case when lower(coalesce(p.role, 'vendedor')) in ('admin', 'administrador') then 'gestor'
                                      else lower(coalesce(p.role, 'vendedor')) end as r) x
      where p.id = p_user
        and public.crm_role_da_hierarquia(h.slug, h.ordem) = x.r
      order by (lower(coalesce(h.slug, '')) = x.r) desc,
               (coalesce(h.status, 'ativa') <> 'inativa') desc,
               coalesce(h.ordem, 99)
      limit 1))
$$;

create or replace function public.crm_nivel_de(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when public.crm_nivel_role(p.role) <= 1 then public.crm_nivel_role(p.role)
    else greatest(coalesce(h.ordem, public.crm_nivel_role(p.role)), public.crm_nivel_role(p.role)) end
  from public.profiles p
  left join public.hierarquias h on h.id::text = public.crm_hierarquia_de(p.id)
  where p.id = p_user
$$;

create or replace function public.crm_tem_perm_de(p_user uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_perms jsonb; v_role text;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user and coalesce(p.ativo, true) and p.empresa_id is not null)
     and not public.crm_plataforma_de(p_user) then return false; end if;
  if public.crm_gestor_de(p_user) then return true; end if;
  v_role := public.crm_role_de(p_user);
  select public.crm_jsonb(h.perms::text) into v_perms
    from public.hierarquias h where h.id::text = public.crm_hierarquia_de(p_user);
  if v_perms is not null and v_perms ? p_perm then
    return coalesce(v_perms ->> p_perm = 'true', false);
  end if;
  return coalesce(public.crm_perms_padrao(v_role) ->> p_perm = 'true', false);
end $$;

-- Permissões das integrações (WhatsApp, IA, Anúncios) — mesma regra do cargo
do $$
begin
  if to_regprocedure('public.integ_ia_liberada(text)') is null then return; end if;
  execute $f$
    create or replace function public.integ_tem_perm_de(p_user uuid, p_perm text) returns boolean
    language plpgsql stable security definer set search_path = public as $b$
    declare v_perms jsonb; v_emp text; v_role text;
    begin
      if p_user is null then return false; end if;
      v_emp := public.crm_empresa_de(p_user);
      -- IA: só no plano Master (vale até para o gestor)
      if p_perm in ('ia_view', 'ia_manage') and not public.integ_ia_liberada(v_emp) then return false; end if;
      -- WhatsApp: liberado para todo mundo da empresa
      if p_perm in ('whatsapp_view', 'whatsapp_send', 'whatsapp_bulk') then return v_emp is not null; end if;
      if public.crm_gestor_de(p_user) then return true; end if;
      if p_perm not in ('anuncios_view', 'ia_view', 'ia_manage') then
        return coalesce(public.crm_tem_perm_de(p_user, p_perm), false);
      end if;
      if v_emp is null then return false; end if;
      select public.crm_jsonb(h.perms::text) into v_perms
        from public.hierarquias h where h.id::text = public.crm_hierarquia_de(p_user);
      if v_perms is not null and v_perms ? p_perm then
        return coalesce(v_perms ->> p_perm = 'true', false);
      end if;
      if p_perm = 'ia_view' then return true; end if; -- todos da empresa Master veem a aba IA
      if p_perm = 'ia_manage' then
        v_role := public.crm_role_de(p_user);
        return v_role in ('representante', 'supervisor');  -- líderes gerenciam a IA
      end if;
      return false;
    end $b$
  $f$;
end $$;

-- A pessoa logada tem a permissão? (qualquer permissão, inclusive as das integrações)
create or replace function public.crm_pode(p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regprocedure('public.integ_tem_perm_de(uuid,text)') is not null
     and to_regprocedure('public.integ_ia_liberada(text)') is not null then
    return coalesce(public.integ_tem_perm_de(auth.uid(), p_perm), false);
  end if;
  return coalesce(public.crm_tem_perm_de(auth.uid(), p_perm), false);
end $$;
revoke all on function public.crm_pode(text) from public, anon;
grant execute on function public.crm_pode(text) to authenticated, service_role;

-- Acerta os cadastros que estão sem cargo válido (para aparecer certo na tela)
do $$
declare r record; v_h text;
begin
  perform set_config('crm.trusted', 'on', true);
  for r in
    select p.id from public.profiles p
     where p.empresa_id is not null
       and not exists (select 1 from public.hierarquias h
                        where h.id::text = p.hierarquia_id::text and h.empresa_id::text = p.empresa_id::text)
  loop
    v_h := public.crm_hierarquia_de(r.id);
    if v_h is null then continue; end if;
    begin
      execute format('update public.profiles set hierarquia_id = %L where id = %L', v_h, r.id);
    exception when others then
      raise notice 'Cadastro % ficou sem cargo gravado (%), mas segue o cargo da função.', r.id, sqlerrm;
    end;
  end loop;
  perform set_config('crm.trusted', '', true);
end $$;

-- ─── 2. Quem cada pessoa enxerga: vale o lugar na equipe, não o nome do cargo ─
-- gestor → todos; representante da equipe → membros e supervisor dela;
-- supervisor da equipe → membros dela; representante que participa de uma
-- equipe → os membros dela; demais → só os próprios.
create or replace function public.crm_visiveis_de(p_user uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp text;
  v_role text := public.crm_role_de(p_user);
  v_me text := p_user::text;
  v_ids text[];
begin
  select p.empresa_id::text into v_emp from public.profiles p
   where p.id = p_user and coalesce(p.ativo, true) and p.empresa_id is not null;
  if v_emp is null then return array[]::text[]; end if;
  if v_role in ('master', 'superadmin', 'gestor', 'admin', 'administrador') then
    select coalesce(array_agg(p.id::text), array[]::text[]) into v_ids
      from public.profiles p where p.empresa_id::text = v_emp;
    return v_ids;
  end if;
  v_ids := array[v_me];
  select v_ids || coalesce(array_agg(distinct m.v), array[]::text[]) into v_ids
    from public.equipes e
    cross join lateral jsonb_array_elements_text(public.crm_lista(e.membros_sb_ids)) as m(v)
   where e.empresa_id::text = v_emp
     and (e.representante_sb_id::text = v_me
          or e.supervisor_sb_id::text = v_me
          or (v_role = 'representante' and public.crm_lista(e.membros_sb_ids) ? v_me));
  select v_ids || coalesce(array_agg(distinct e.supervisor_sb_id::text), array[]::text[]) into v_ids
    from public.equipes e
   where e.empresa_id::text = v_emp and e.representante_sb_id::text = v_me
     and e.supervisor_sb_id is not null and e.supervisor_sb_id::text <> '';
  return v_ids;
end $$;

-- Pessoas das equipes de que a pessoa participa ou cuida
create or replace function public.crm_colegas_de(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x.v), array[]::text[])
    from public.profiles p
    join public.equipes e on e.empresa_id::text = p.empresa_id::text
    cross join lateral (
      select jsonb_array_elements_text(public.crm_lista(e.membros_sb_ids)) as v
      union all select e.supervisor_sb_id::text
      union all select e.representante_sb_id::text) x
   where p.id = p_user and coalesce(p.ativo, true)
     and x.v is not null and x.v <> ''
     and (public.crm_lista(e.membros_sb_ids) ? p_user::text
          or e.supervisor_sb_id::text = p_user::text
          or e.representante_sb_id::text = p_user::text)
$$;
create or replace function public.crm_colegas() returns text[]
language sql stable security definer set search_path = public as $$ select public.crm_colegas_de(auth.uid()) $$;

-- ─── 5. Notificações da equipe ──────────────────────────────────────────────
drop policy if exists crm_atividades_ver on public.atividades;
create policy crm_atividades_ver on public.atividades for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id::text = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or user_id is null
                  or user_id::text = any ((select public.crm_visiveis())::text[])
                  or ((select public.crm_tem_perm('notif_team'))
                      and user_id::text = any ((select public.crm_colegas())::text[])))));

-- ─── 6. Cargos: "Alterar permissões dos cargos" funciona sozinha ────────────
drop policy if exists crm_hierarquias_editar on public.hierarquias;
create policy crm_hierarquias_editar on public.hierarquias for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_hierarchy'))
              or (select public.crm_tem_perm('config_permissions'))))
  with check (empresa_id::text = (select public.crm_empresa()));

-- Quem não é gestor só mexe em cargos abaixo do seu e só liga/desliga as
-- permissões que ele mesmo tem (as outras ficam como estavam).
create or replace function public.crm_guarda_hierarquias() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nivel integer; v_novo jsonb; v_old jsonb; v_reg jsonb; k text;
begin
  if public.crm_confiavel() or public.crm_gestor() then return coalesce(new, old); end if;
  v_nivel := coalesce(public.crm_nivel_de(auth.uid()), 99);
  if tg_op in ('UPDATE', 'DELETE') then
    if coalesce(old.ordem, 99) <= v_nivel or public.crm_role_da_hierarquia(old.slug, old.ordem) = 'gestor' then
      raise exception 'Você só pode alterar cargos abaixo do seu.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- só com "Alterar permissões": nome, ordem e o resto do cargo ficam como estavam
  if tg_op = 'UPDATE' and not public.crm_tem_perm('config_hierarchy') then
    v_reg := to_jsonb(old) || jsonb_build_object('perms', to_jsonb(new) -> 'perms');
    new := jsonb_populate_record(new, v_reg);
  end if;
  if coalesce(new.ordem, 99) <= v_nivel or public.crm_role_da_hierarquia(new.slug, new.ordem) = 'gestor' then
    raise exception 'Você só pode criar ou alterar cargos abaixo do seu.';
  end if;
  if tg_op = 'UPDATE' and new.perms::text is not distinct from old.perms::text then return new; end if;
  v_novo := coalesce(public.crm_jsonb(new.perms::text), '{}'::jsonb);
  v_old := case when tg_op = 'UPDATE' then coalesce(public.crm_jsonb(old.perms::text), '{}'::jsonb) else '{}'::jsonb end;
  if not public.crm_tem_perm('config_permissions') then
    v_novo := v_old;  -- sem permissão para mexer em permissões
  else
    for k in select jsonb_object_keys(v_novo || v_old) loop
      if k like '\_%' then continue; end if;
      if (v_novo -> k) is distinct from (v_old -> k) and not public.crm_pode(k) then
        -- permissão que quem está salvando não tem: fica como estava
        if v_old ? k then v_novo := jsonb_set(v_novo, array[k], v_old -> k);
        else v_novo := v_novo - k; end if;
      end if;
    end loop;
  end if;
  if pg_typeof(new.perms)::text in ('json', 'jsonb') then
    new := jsonb_populate_record(new, jsonb_build_object('perms', v_novo));
  else
    new := jsonb_populate_record(new, jsonb_build_object('perms', v_novo::text));
  end if;
  return new;
end $$;

-- ─── 3 e 4. Cadastrar, editar e remover usuários ────────────────────────────
create or replace function public.crm_aplicar_membro(
  p_caller uuid, p_alvo uuid, p_novo boolean, p_email text, p_nome text, p_hierarquia text,
  p_equipe text, p_mudar_equipe boolean, p_meta numeric, p_validar_apenas boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa_de(p_caller);
  v_gestor boolean := public.crm_gestor_de(p_caller);
  v_plat boolean := public.crm_plataforma_de(p_caller);
  v_todos boolean := coalesce(public.crm_tem_perm_de(p_caller, 'config_users'), false);
  v_nivel integer := coalesce(public.crm_nivel_de(p_caller), 99);
  v_alvo public.profiles;
  v_h record;
  v_role text;
  v_set text := '';
  v_equipe_ok boolean;
begin
  if v_emp is null then raise exception 'Seu acesso não está ativo.'; end if;
  select * into v_alvo from public.profiles where id = p_alvo;

  if p_novo then
    if not (v_gestor or v_todos or public.crm_tem_perm_de(p_caller, 'equipe_add')) then
      raise exception 'Você não tem permissão para cadastrar usuários.';
    end if;
    if p_alvo is not null and v_alvo.id is not null and v_alvo.empresa_id is not null
       and v_alvo.empresa_id::text <> v_emp and coalesce(v_alvo.ativo, true) then
      raise exception 'Este e-mail já pertence a outra empresa.';
    end if;
    if p_hierarquia is null then raise exception 'Selecione a hierarquia do usuário.'; end if;
  else
    if v_alvo.id is null or coalesce(v_alvo.empresa_id::text, '') <> v_emp then
      raise exception 'Usuário não encontrado na sua empresa.';
    end if;
    if p_alvo = p_caller then
      if not v_gestor and (p_hierarquia is not null or p_mudar_equipe or p_meta is not null) then
        raise exception 'Você não pode alterar o próprio cargo, equipe ou meta.';
      end if;
    elsif not v_gestor then
      if not (v_todos or public.crm_tem_perm_de(p_caller, 'equipe_edit')) then
        raise exception 'Você não tem permissão para editar usuários.';
      end if;
      if coalesce(public.crm_nivel_de(p_alvo), 99) <= v_nivel or public.crm_gestor_de(p_alvo) then
        raise exception 'Você só pode editar pessoas abaixo do seu cargo.';
      end if;
      -- "Gerenciar todos os usuários" vale para a empresa inteira; senão, só a própria equipe
      if not v_todos and not (p_alvo::text = any (public.crm_visiveis_de(p_caller))) then
        raise exception 'Você só pode editar pessoas da sua equipe.';
      end if;
    end if;
    if lower(coalesce(v_alvo.role, '')) in ('master', 'superadmin') and not v_plat then
      raise exception 'Este usuário não pode ser alterado por aqui.';
    end if;
  end if;

  if p_hierarquia is not null then
    select h.id::text as id, h.slug, h.ordem into v_h
      from public.hierarquias h where h.id::text = p_hierarquia and h.empresa_id::text = v_emp;
    if v_h.id is null then raise exception 'Hierarquia inválida.'; end if;
    v_role := public.crm_role_da_hierarquia(v_h.slug, v_h.ordem);
    if not v_gestor and (coalesce(v_h.ordem, 99) <= v_nivel or public.crm_nivel_role(v_role) <= 1) then
      raise exception 'Você só pode atribuir cargos abaixo do seu.';
    end if;
  end if;

  if p_mudar_equipe and p_equipe is not null then
    select exists (select 1 from public.equipes e where e.id::text = p_equipe and e.empresa_id::text = v_emp
                     and (v_gestor or v_todos or public.crm_tem_perm_de(p_caller, 'config_teams')
                          or e.supervisor_sb_id::text = p_caller::text or e.representante_sb_id::text = p_caller::text
                          -- cadastro novo por quem participa da equipe e tem "Cadastrar usuários"
                          or (p_novo and public.crm_lista(e.membros_sb_ids) ? p_caller::text
                              and public.crm_tem_perm_de(p_caller, 'equipe_add'))))
      into v_equipe_ok;
    if not v_equipe_ok then raise exception 'Equipe inválida ou fora da sua gestão.'; end if;
  end if;

  if p_validar_apenas then return jsonb_build_object('ok', true, 'role', v_role); end if;

  perform set_config('crm.trusted', 'on', true);
  if p_novo and v_alvo.id is null then
    execute format('insert into public.profiles (id, email, nome, role, empresa_id, hierarquia_id, meta, vendas, credito, ativo, updated_at)
                    values (%L, %L, %L, %L, %L, %L, %L, 0, 0, true, now())',
                   p_alvo, p_email, p_nome, coalesce(v_role, 'vendedor'), v_emp, p_hierarquia, coalesce(p_meta, 0));
  else
    v_set := format('updated_at = now(), ativo = true, desativado_em = null, empresa_id = %L', v_emp);
    if p_nome is not null and btrim(p_nome) <> '' then v_set := v_set || format(', nome = %L', btrim(p_nome)); end if;
    if p_email is not null and p_novo then v_set := v_set || format(', email = %L', p_email); end if;
    if p_meta is not null then v_set := v_set || format(', meta = %L', p_meta); end if;
    if p_hierarquia is not null then v_set := v_set || format(', hierarquia_id = %L, role = %L', p_hierarquia, v_role); end if;
    if p_mudar_equipe then v_set := v_set || format(', equipe_id = %L', p_equipe); end if;
    execute format('update public.profiles set %s where id = %L', v_set, p_alvo);
  end if;
  if p_mudar_equipe then
    perform public.crm_definir_equipe(p_alvo::text, p_equipe, v_emp);
  end if;
  perform set_config('crm.trusted', '', true);
  return jsonb_build_object('ok', true, 'role', coalesce(v_role, v_alvo.role));
end $$;

-- Cadastro: sem equipe escolhida, entra na equipe de quem cadastrou
-- (a que ele cuida; se não cuida de nenhuma, a de que participa)
create or replace function public.crm_srv_criar_membro(
  p_caller uuid, p_user uuid, p_email text, p_nome text, p_hierarquia text, p_equipe text, p_meta numeric,
  p_validar_apenas boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa_de(p_caller);
  v_equipe text := nullif(btrim(coalesce(p_equipe, '')), '');
begin
  if v_equipe is null and v_emp is not null
     and not public.crm_gestor_de(p_caller)
     and not public.crm_tem_perm_de(p_caller, 'config_users') then
    select e.id::text into v_equipe
      from public.equipes e
     where e.empresa_id::text = v_emp
       and (e.supervisor_sb_id::text = p_caller::text or e.representante_sb_id::text = p_caller::text
            or public.crm_lista(e.membros_sb_ids) ? p_caller::text)
     order by (e.supervisor_sb_id::text = p_caller::text) desc,
              (e.representante_sb_id::text = p_caller::text) desc, e.nome
     limit 1;
    if v_equipe is null then
      raise exception 'Você ainda não tem uma equipe. Peça ao gestor para colocar você em uma equipe (Configurações → Equipes) antes de cadastrar pessoas.';
    end if;
  end if;
  return public.crm_aplicar_membro(p_caller, p_user, true, p_email, p_nome, p_hierarquia,
                                   v_equipe, v_equipe is not null, p_meta, p_validar_apenas);
end $$;
revoke all on function public.crm_srv_criar_membro(uuid, uuid, text, text, text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.crm_srv_criar_membro(uuid, uuid, text, text, text, text, numeric, boolean) to service_role;

-- Remover membro: passa os leads para outra pessoa, tira das equipes,
-- desativa o perfil e bloqueia o login (histórico de vendas é mantido).
create or replace function public.crm_remover_membro(p_alvo uuid, p_transferir_para uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_emp text := public.crm_empresa();
  v_gestor boolean := public.crm_gestor();
  v_todos boolean := coalesce(public.crm_tem_perm('config_users'), false);
  v_alvo public.profiles;
  v_dest uuid := coalesce(p_transferir_para, auth.uid());
  v_leads integer := 0;
  v_aviso text := null;
  v_ok boolean;
begin
  if v_emp is null then raise exception 'Seu acesso não está ativo.'; end if;
  if p_alvo = v_me then raise exception 'Você não pode remover a si mesmo.'; end if;
  select * into v_alvo from public.profiles where id = p_alvo;
  if v_alvo.id is null or coalesce(v_alvo.empresa_id::text, '') <> v_emp then raise exception 'Usuário não encontrado na sua empresa.'; end if;
  if lower(coalesce(v_alvo.role, '')) in ('master', 'superadmin') then raise exception 'Este usuário não pode ser removido por aqui.'; end if;
  if not v_gestor then
    if coalesce(public.crm_nivel_de(p_alvo), 99) <= coalesce(public.crm_nivel_de(v_me), 99) or public.crm_gestor_de(p_alvo) then
      raise exception 'Você só pode remover pessoas abaixo do seu cargo.';
    end if;
    -- "Gerenciar todos os usuários" vale para a empresa inteira; senão, só a própria equipe
    v_ok := v_todos
            or ((public.crm_tem_perm('equipe_remove')
                 or (public.crm_role() = 'supervisor' and lower(coalesce(v_alvo.role, '')) = 'vendedor'))
                and p_alvo::text = any (public.crm_visiveis()));
    if not v_ok then raise exception 'Você só pode remover pessoas da sua equipe.'; end if;
  end if;
  if v_dest = p_alvo or not public.crm_membro_ativo(v_dest::text, v_emp) then
    raise exception 'Escolha uma pessoa ativa da empresa para receber os leads.';
  end if;
  if not v_gestor and not v_todos and not (v_dest::text = any (public.crm_visiveis())) then
    raise exception 'Os leads só podem ir para alguém da sua equipe.';
  end if;

  perform set_config('crm.trusted', 'on', true);
  execute format('update public.leads set responsavel_id = %L, updated_at = now() where empresa_id::text = %L and responsavel_id::text = %L',
                 v_dest, v_emp, p_alvo::text);
  get diagnostics v_leads = row_count;
  execute format('update public.lances set user_id = %L where empresa_id::text = %L and user_id::text = %L', v_dest, v_emp, p_alvo::text);
  execute format('update public.eventos_calendario set user_id = %L where empresa_id::text = %L and user_id::text = %L', v_dest, v_emp, p_alvo::text);
  perform public.crm_definir_equipe(p_alvo::text, null, v_emp);
  update public.equipes set supervisor_sb_id = null where empresa_id::text = v_emp and supervisor_sb_id::text = p_alvo::text;
  update public.equipes set representante_sb_id = null where empresa_id::text = v_emp and representante_sb_id::text = p_alvo::text;
  update public.equipes set gestor_sb_id = null where empresa_id::text = v_emp and gestor_sb_id::text = p_alvo::text;
  update public.profiles set ativo = false, desativado_em = now(), updated_at = now() where id = p_alvo;
  begin
    update auth.users set banned_until = '2999-12-31'::timestamptz where id = p_alvo;
  exception when others then
    v_aviso := 'O perfil foi desativado, mas não foi possível bloquear o login no Auth.';
  end;
  perform set_config('crm.trusted', '', true);
  return jsonb_build_object('ok', true, 'leads_transferidos', v_leads, 'aviso', v_aviso);
end $$;

notify pgrst, 'reload schema';

-- Conferência: cada pessoa, o cargo que vale para ela e algumas permissões
select e.nome as empresa, p.nome as pessoa, p.role as funcao, h.nome as cargo_que_vale,
       public.crm_tem_perm_de(p.id, 'leads_delete')   as exclui_leads,
       public.crm_tem_perm_de(p.id, 'leads_transfer') as transfere_leads,
       public.crm_tem_perm_de(p.id, 'relatorios_view') as ve_relatorios
  from public.profiles p
  join public.empresas e on e.id::text = p.empresa_id::text
  left join public.hierarquias h on h.id::text = public.crm_hierarquia_de(p.id)
 where coalesce(p.ativo, true)
 order by e.nome, public.crm_nivel_de(p.id), p.nome;
