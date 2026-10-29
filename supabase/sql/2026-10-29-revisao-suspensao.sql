-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Revisão geral: plano suspenso, isolamento e desempenho (29/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Precisa dos arquivos anteriores já instalados (segurança 22/10, integrações,
-- Projeto Indicador). Roda numa transação única e pode ser rodado de novo.
--
-- O que faz:
--  1. PLANO SUSPENSO: quando a Evolux suspende uma empresa, todo mundo dela
--     continua entrando e VENDO os dados, mas nada pode ser criado, alterado ou
--     apagado (o banco recusa qualquer gravação com a mensagem "plano suspenso").
--     WhatsApp, IA e Anúncios também param para essa empresa.
--  2. ISOLAMENTO: cada empresa só enxerga os próprios dados — vale também para a
--     conta master da Evolux (mesma trava do arquivo isolamento-empresas).
--  3. DESEMPENHO: regras de acesso de lances, agenda e conversas reescritas
--     (testado com 60 mil leads: lances do vendedor caíram de 3,5 s para 0,03 s)
--     e índices para empresas grandes (muitos leads, vendas e lances).
--
-- A conta master continua gerenciando as empresas (criar, suspender, reativar,
-- convites) normalmente. As funções do servidor (WhatsApp/Meta) não são afetadas.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Empresa da pessoa, mesmo com o plano suspenso (para LER os dados) ────
-- crm_empresa_de continua devolvendo só empresa ATIVA (usado pelas integrações e
-- pelas funções que gravam). Para as regras de leitura usamos o vínculo.
create or replace function public.crm_empresa_vinculo_de(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.empresa_id::text
    from public.profiles p
   where p.id = p_user and coalesce(p.ativo, true) and p.empresa_id is not null
$$;

create or replace function public.crm_empresa_suspensa(p_emp text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not coalesce(e.ativo, true) from public.empresas e where e.id::text = p_emp limit 1), false)
$$;

-- Empresa do usuário logado (regras de acesso): ativa ou suspensa
create or replace function public.crm_empresa() returns text
language sql stable security definer set search_path = public as $$
  select public.crm_empresa_vinculo_de(auth.uid())
$$;

create or replace function public.crm_gestor_de(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.crm_plataforma_de(p_user)
      or (public.crm_empresa_vinculo_de(p_user) is not null
          and coalesce(public.crm_role_de(p_user) in ('gestor', 'admin', 'administrador'), false))
$$;

create or replace function public.crm_visiveis_de(p_user uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa_vinculo_de(p_user);
  v_role text := public.crm_role_de(p_user);
  v_me text := p_user::text;
  v_ids text[];
begin
  if v_emp is null then return array[]::text[]; end if;
  if v_role in ('master', 'superadmin', 'gestor', 'admin', 'administrador') then
    select coalesce(array_agg(p.id::text), array[]::text[]) into v_ids
      from public.profiles p where p.empresa_id::text = v_emp;
    return v_ids;
  end if;
  v_ids := array[v_me];
  if v_role = 'representante' then
    select v_ids || coalesce(array_agg(distinct m.v), array[]::text[]) into v_ids
      from public.equipes e
      cross join lateral jsonb_array_elements_text(public.crm_lista(e.membros_sb_ids)) as m(v)
      where e.empresa_id::text = v_emp
        and (e.representante_sb_id::text = v_me or public.crm_lista(e.membros_sb_ids) ? v_me);
  elsif v_role = 'supervisor' then
    select v_ids || coalesce(array_agg(distinct m.v), array[]::text[]) into v_ids
      from public.equipes e
      cross join lateral jsonb_array_elements_text(public.crm_lista(e.membros_sb_ids)) as m(v)
      where e.empresa_id::text = v_emp and e.supervisor_sb_id::text = v_me;
  end if;
  return v_ids;
end $$;

create or replace function public.crm_tem_perm_de(p_user uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_perms jsonb; v_role text;
begin
  if public.crm_empresa_vinculo_de(p_user) is null and not public.crm_plataforma_de(p_user) then return false; end if;
  if public.crm_gestor_de(p_user) then return true; end if;
  v_role := public.crm_role_de(p_user);
  select public.crm_jsonb(h.perms::text) into v_perms
    from public.profiles p join public.hierarquias h on h.id::text = p.hierarquia_id::text
    where p.id = p_user;
  if v_perms is not null and v_perms ? p_perm then
    return coalesce(v_perms ->> p_perm = 'true', false);
  end if;
  return coalesce(public.crm_perms_padrao(v_role) ->> p_perm = 'true', false);
end $$;

-- ─── 2. Trava de gravação para empresa suspensa ─────────────────────────────
-- Vale para o CRM e para as funções chamadas pelo CRM. Só passam: a conta master,
-- as funções do servidor (chave de serviço) e o SQL Editor.
create or replace function public.crm_guarda_suspensa() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_novo text; v_velho text;
begin
  if public.crm_eh_servico() or session_user in ('postgres', 'supabase_admin') or public.crm_plataforma() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op <> 'DELETE' then v_novo := to_jsonb(new) ->> 'empresa_id'; end if;
  if tg_op <> 'INSERT' then v_velho := to_jsonb(old) ->> 'empresa_id'; end if;
  if (v_novo is not null and public.crm_empresa_suspensa(v_novo))
     or (v_velho is not null and v_velho is distinct from v_novo and public.crm_empresa_suspensa(v_velho)) then
    raise exception 'PLANO SUSPENSO: o plano desta empresa está suspenso. Fale com a Evolux para reativar.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'leads', 'vendas', 'lances', 'eventos_calendario', 'atividades', 'equipes', 'hierarquias',
    'administradoras', 'convites', 'ind_indicadores', 'ind_indicacoes', 'ia_roteiros', 'ia_conversas',
    'wa_mensagens', 'wa_disparos', 'ia_fila', 'integ_meta', 'integ_meta_paginas', 'integ_wa_numeros', 'integ_rodizio'
  ] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'empresa_id') then
      continue;
    end if;
    execute format('drop trigger if exists crm_bloqueio_suspensa on public.%I', t);
    execute format('create trigger crm_bloqueio_suspensa before insert or update or delete on public.%I
                      for each row execute function public.crm_guarda_suspensa()', t);
  end loop;
end $$;

-- A própria empresa suspensa não muda nada no cadastro dela (nome, logo, funil)
create or replace function public.crm_guarda_empresa_suspensa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.crm_eh_servico() or session_user in ('postgres', 'supabase_admin') or public.crm_plataforma() then
    return new;
  end if;
  if not coalesce(old.ativo, true) then
    raise exception 'PLANO SUSPENSO: o plano desta empresa está suspenso. Fale com a Evolux para reativar.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists crm_bloqueio_suspensa on public.empresas;
create trigger crm_bloqueio_suspensa before update on public.empresas
  for each row execute function public.crm_guarda_empresa_suspensa();

-- Convite de empresa suspensa não vale
create or replace function public.crm_info_convite(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('valido', c.expira_em > now() and c.usos < c.max_usos and coalesce(e.ativo, true),
                              'empresa_nome', e.nome, 'role', c.role)
      from public.convites c join public.empresas e on e.id::text = c.empresa_id
     where c.token = p_token), jsonb_build_object('valido', false))
$$;

-- ─── 3. Isolamento entre empresas (inclusive para a conta master) ───────────
do $$
declare t text;
begin
  foreach t in array array[
    'leads', 'vendas', 'lances', 'eventos_calendario', 'atividades', 'equipes', 'hierarquias',
    'administradoras', 'ind_indicadores', 'ind_indicacoes', 'wa_mensagens', 'wa_disparos',
    'ia_conversas', 'ia_roteiros', 'ia_fila', 'integ_meta', 'integ_meta_paginas', 'integ_wa_numeros',
    'integ_eventos', 'integ_rodizio', 'integ_cron'
  ] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'empresa_id') then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists crm_isolamento_empresa on public.%I', t);
    execute format(
      'create policy crm_isolamento_empresa on public.%I as restrictive for all to authenticated
         using (empresa_id::text = (select public.crm_empresa()))
         with check (empresa_id::text = (select public.crm_empresa()))', t);
  end loop;
  drop policy if exists crm_isolamento_empresa on public.profiles;
  create policy crm_isolamento_empresa on public.profiles as restrictive for all to authenticated
    using (id = auth.uid() or empresa_id::text = (select public.crm_empresa()))
    with check (id = auth.uid() or empresa_id::text = (select public.crm_empresa()));
end $$;

-- ─── 4. Regras mais rápidas para lances, agenda e conversas ─────────────────
-- Antes: "o lead deste lance é visível?" refazia a conta de quem a pessoa enxerga
-- para CADA linha (com 60 mil leads, 3,5 s só para abrir os lances). Agora busca o
-- responsável do lead direto pelo índice e compara com a lista calculada uma vez.
create or replace function public.crm_resp_do_lead(p_lead text) returns text
language sql stable security definer set search_path = public as $$
  select l.responsavel_id::text from public.leads l where l.id::text = p_lead limit 1
$$;
revoke all on function public.crm_resp_do_lead(text) from public, anon;
grant execute on function public.crm_resp_do_lead(text) to authenticated;

drop policy if exists crm_lances_ver on public.lances;
create policy crm_lances_ver on public.lances for select to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor())
              or (lead_id is not null and public.crm_resp_do_lead(lead_id::text) = any ((select public.crm_visiveis())::text[]))
              or (lead_id is null and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[])))));
drop policy if exists crm_lances_criar on public.lances;
create policy crm_lances_criar on public.lances for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or (select public.crm_tem_perm('lances_create')))
              and (lead_id is null or (select public.crm_gestor())
                   or public.crm_resp_do_lead(lead_id::text) = any ((select public.crm_visiveis())::text[])));
drop policy if exists crm_lances_editar on public.lances;
create policy crm_lances_editar on public.lances for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('lances_edit')))
         and ((select public.crm_gestor())
              or (lead_id is not null and public.crm_resp_do_lead(lead_id::text) = any ((select public.crm_visiveis())::text[]))
              or (lead_id is null and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[])))))
  with check (empresa_id::text = (select public.crm_empresa()));
drop policy if exists crm_lances_excluir on public.lances;
create policy crm_lances_excluir on public.lances for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('lances_edit')))
         and ((select public.crm_gestor())
              or (lead_id is not null and public.crm_resp_do_lead(lead_id::text) = any ((select public.crm_visiveis())::text[]))
              or (lead_id is null and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[])))));

drop policy if exists crm_eventos_ver on public.eventos_calendario;
create policy crm_eventos_ver on public.eventos_calendario for select to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor())
              or user_id::text = any ((select public.crm_visiveis())::text[])
              or (lead_id is not null and public.crm_resp_do_lead(lead_id::text) = any ((select public.crm_visiveis())::text[]))));

do $$
begin
  if to_regclass('public.wa_mensagens') is not null then
    drop policy if exists integ_wa_msg_ver on public.wa_mensagens;
    create policy integ_wa_msg_ver on public.wa_mensagens for select to authenticated
      using (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or (lead_id is not null and public.crm_resp_do_lead(lead_id) = any ((select public.crm_visiveis())::text[]))));
  end if;
  if to_regclass('public.ia_conversas') is not null then
    drop policy if exists integ_ia_conv_ver on public.ia_conversas;
    create policy integ_ia_conv_ver on public.ia_conversas for select to authenticated
      using (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or (lead_id is not null and public.crm_resp_do_lead(lead_id) = any ((select public.crm_visiveis())::text[]))));
  end if;
end $$;

-- ─── 5. Índices para empresas grandes ───────────────────────────────────────
do $$
declare s text;
begin
  foreach s in array array[
    'create index if not exists crm_idx_leads_emp_criado on public.leads (empresa_id, created_at desc)',
    'create index if not exists crm_idx_leads_emp_txt on public.leads ((empresa_id::text))',
    'create index if not exists crm_idx_leads_resp_txt on public.leads ((responsavel_id::text))',
    'create index if not exists crm_idx_lances_emp on public.lances (empresa_id)',
    'create index if not exists crm_idx_lances_lead_txt on public.lances ((lead_id::text))',
    'create index if not exists crm_idx_vendas_lead_txt on public.vendas ((lead_id::text))',
    'create index if not exists crm_idx_vendas_user_txt on public.vendas ((user_id::text))',
    'create index if not exists crm_idx_vendas_emp_txt on public.vendas ((empresa_id::text), data_fechamento)',
    'create index if not exists crm_idx_eventos_emp on public.eventos_calendario (empresa_id, data)',
    'create index if not exists crm_idx_eventos_lead_txt on public.eventos_calendario ((lead_id::text))',
    'create index if not exists crm_idx_atividades_emp_txt on public.atividades ((empresa_id::text), created_at desc)',
    'create index if not exists crm_idx_profiles_id_txt on public.profiles ((id::text))',
    'create index if not exists crm_idx_profiles_emp_txt on public.profiles ((empresa_id::text))',
    'create index if not exists crm_idx_hier_emp on public.hierarquias (empresa_id)',
    'create index if not exists crm_idx_hier_id_txt on public.hierarquias ((id::text))',
    'create index if not exists crm_idx_admins_emp on public.administradoras (empresa_id)',
    'create index if not exists crm_idx_empresas_id_txt on public.empresas ((id::text))'
  ] loop
    begin
      execute s;
    exception when others then
      raise notice 'Índice não criado (%): %', s, sqlerrm;
    end;
  end loop;
end $$;

-- ─── 6. Permissões das funções novas ────────────────────────────────────────
revoke all on function public.crm_empresa_vinculo_de(uuid) from public, anon, authenticated;
revoke all on function public.crm_empresa_suspensa(text) from public, anon, authenticated;
revoke all on function public.crm_guarda_suspensa() from public, anon, authenticated;
revoke all on function public.crm_guarda_empresa_suspensa() from public, anon, authenticated;
grant execute on function public.crm_empresa() to authenticated;

notify pgrst, 'reload schema';

commit;

-- Conferência
select 'Revisão instalada' as resultado,
       (select count(*) from pg_trigger where tgname = 'crm_bloqueio_suspensa') as tabelas_com_trava_de_suspensao,
       (select count(*) from pg_policies where schemaname = 'public' and policyname = 'crm_isolamento_empresa') as tabelas_isoladas,
       (select count(*) from public.empresas where not coalesce(ativo, true)) as empresas_suspensas_agora;
