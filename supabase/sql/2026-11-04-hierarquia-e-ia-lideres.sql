-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — Hierarquia e IA para os líderes (04/11/2026)
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez sem problema.
--
-- Ordem dos cargos: Gestor > Representante > Supervisor > Vendedor.
--
-- 1. Representante passa a ter o mesmo poder do supervisor sobre a própria
--    equipe: vê a aba Usuários, cadastra, edita e remove SÓ quem é da equipe dele.
-- 2. O representante enxerga também o SUPERVISOR das equipes que representa
--    (antes só via quem estava marcado como membro).
-- 3. Quem cadastra alguém sem escolher equipe (supervisor/representante) coloca a
--    pessoa automaticamente na própria equipe — assim ela não "some" da visão.
-- 4. IA (plano Master): os líderes (gestor, representante e supervisor) editam,
--    ligam, testam a IA e veem as entrevistas. O vendedor só vê a aba IA.
-- 5. Mudança de plano da empresa (ex.: virar Master) chega na hora para todos.
-- 6. Cargo personalizado sem nome conhecido: ordem 2 = representante,
--    ordem 3 = supervisor (estava invertido).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 6. Cargo a partir da hierarquia (ordem 2 e 3 estavam invertidas) ────────
create or replace function public.crm_role_da_hierarquia(p_slug text, p_ordem integer) returns text
language sql immutable as $$
  select case
    when s like '%gestor%' or s like '%diretor%' or s like '%master%' then 'gestor'
    when s like '%supervisor%' or s like '%coordenador%' then 'supervisor'
    when s like '%representante%' or s like '%consultor%' then 'representante'
    when coalesce(p_ordem, 99) = 1 then 'gestor'
    when p_ordem = 2 then 'representante'
    when p_ordem = 3 then 'supervisor'
    else 'vendedor' end
  from (select lower(coalesce(p_slug, '')) as s) a
$$;

-- ─── 1 e 4. Permissões padrão dos líderes ───────────────────────────────────
-- Valem quando o cargo ainda não tem a chave gravada.
create or replace function public.crm_perms_padrao(p_role text) returns jsonb
language sql immutable as $$
  select case
    when lower(coalesce(p_role, '')) in ('supervisor', 'representante') then
      '{"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"leads_import":true,
        "leads_transfer":true,"funil_view":true,"funil_move":true,"simulador_view":true,"lances_view":true,
        "lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,
        "vendas_view":true,"vendas_create":true,"notif_view":true,"notif_team":true,"whatsapp_view":true,
        "agenda_view":true,"config_view":true,"equipe_view":true,"equipe_view_sellers":true,"equipe_add":true,
        "equipe_edit":true,"equipe_remove":true,"ia_view":true,"ia_manage":true}'::jsonb
    else
      '{"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"funil_view":true,
        "funil_move":true,"simulador_view":true,"lances_view":true,"lances_create":true,"lances_edit":true,
        "ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,
        "notif_view":true,"ia_view":true}'::jsonb
  end
$$;

-- Empresas novas já nascem com os cargos certos
create or replace function public.crm_garantir_hierarquias_empresa(p_emp text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vend text := '{"_v":2,"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"funil_view":true,"funil_move":true,"simulador_view":true,"lances_view":true,"lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,"notif_view":true,"ia_view":true,"ia_manage":false}';
  v_lider text := '"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"leads_import":true,"leads_transfer":true,"funil_view":true,"funil_move":true,"simulador_view":true,"lances_view":true,"lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,"notif_view":true,"notif_team":true,"whatsapp_view":true,"agenda_view":true,"config_view":true,"equipe_view":true,"equipe_view_sellers":true,"equipe_add":true,"equipe_edit":true,"equipe_remove":true,"ia_view":true,"ia_manage":true';
  v_sup text;
  v_rep text;
  v_all text := '{"_v":2}';
begin
  if p_emp is null or exists (select 1 from public.hierarquias where empresa_id::text = p_emp) then return; end if;
  v_rep := '{"_v":2,' || v_lider || '}';
  v_sup := '{"_v":2,' || v_lider || ',"simulador_models":true}';
  perform set_config('crm.trusted', 'on', true);
  execute format('insert into public.hierarquias (empresa_id, slug, nome, descricao, ordem, status, perms) values
    (%L, %L, %L, %L, 1, %L, %L), (%L, %L, %L, %L, 2, %L, %L), (%L, %L, %L, %L, 3, %L, %L), (%L, %L, %L, %L, 4, %L, %L)',
    p_emp, 'gestor', 'Gestor', 'Acesso total à empresa', 'ativa', v_all,
    p_emp, 'representante', 'Representante', 'Responsável pela operação comercial', 'ativa', v_rep,
    p_emp, 'supervisor', 'Supervisor', 'Gerencia equipe e leads', 'ativa', v_sup,
    p_emp, 'vendedor', 'Vendedor', 'Acesso básico ao funil', 'ativa', v_vend);
  perform set_config('crm.trusted', '', true);
end $$;

-- Empresas que já existem: libera nos cargos de representante e supervisor
-- (o gestor pode desligar depois em Configurações → Hierarquia)
do $$
declare
  v_tipo text;
  v_add text := '{"config_view":true,"equipe_view":true,"equipe_view_sellers":true,"equipe_add":true,"equipe_edit":true,"equipe_remove":true,"ia_view":true,"ia_manage":true}';
  v_vend text := '{"ia_view":true,"ia_manage":false}';
begin
  select data_type into v_tipo from information_schema.columns
   where table_schema = 'public' and table_name = 'hierarquias' and column_name = 'perms';
  if v_tipo is null then return; end if;
  perform set_config('crm.trusted', 'on', true);
  if v_tipo in ('json', 'jsonb') then
    execute format('update public.hierarquias h set perms = (coalesce(public.crm_jsonb(h.perms::text), ''{}''::jsonb) || %L::jsonb)::%s
                     where public.crm_role_da_hierarquia(h.slug, h.ordem) in (''representante'', ''supervisor'')', v_add, v_tipo);
    execute format('update public.hierarquias h set perms = (coalesce(public.crm_jsonb(h.perms::text), ''{}''::jsonb) || %L::jsonb)::%s
                     where public.crm_role_da_hierarquia(h.slug, h.ordem) = ''vendedor''', v_vend, v_tipo);
  else
    execute format('update public.hierarquias h set perms = (coalesce(public.crm_jsonb(h.perms::text), ''{}''::jsonb) || %L::jsonb)::text
                     where public.crm_role_da_hierarquia(h.slug, h.ordem) in (''representante'', ''supervisor'')', v_add);
    execute format('update public.hierarquias h set perms = (coalesce(public.crm_jsonb(h.perms::text), ''{}''::jsonb) || %L::jsonb)::text
                     where public.crm_role_da_hierarquia(h.slug, h.ordem) = ''vendedor''', v_vend);
  end if;
  perform set_config('crm.trusted', '', true);
end $$;

-- ─── 2. Quem cada pessoa enxerga ────────────────────────────────────────────
-- gestor → todos; representante → membros e supervisores das equipes que
-- representa (ou de que participa); supervisor → membros das equipes que
-- supervisiona; vendedor → só ele.
create or replace function public.crm_visiveis_de(p_user uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa_de(p_user);
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
    select v_ids || coalesce(array_agg(distinct e.supervisor_sb_id::text), array[]::text[]) into v_ids
      from public.equipes e
      where e.empresa_id::text = v_emp and e.representante_sb_id::text = v_me
        and e.supervisor_sb_id is not null and e.supervisor_sb_id::text <> '';
  elsif v_role = 'supervisor' then
    select v_ids || coalesce(array_agg(distinct m.v), array[]::text[]) into v_ids
      from public.equipes e
      cross join lateral jsonb_array_elements_text(public.crm_lista(e.membros_sb_ids)) as m(v)
      where e.empresa_id::text = v_emp and e.supervisor_sb_id::text = v_me;
  end if;
  return v_ids;
end $$;

-- ─── 3. Cadastro: sem equipe escolhida, entra na equipe de quem cadastrou ────
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
       and (e.supervisor_sb_id::text = p_caller::text or e.representante_sb_id::text = p_caller::text)
     order by (e.supervisor_sb_id::text = p_caller::text) desc, e.nome
     limit 1;
    if v_equipe is null then
      raise exception 'Você ainda não tem uma equipe. Peça ao gestor para criar a sua equipe (Configurações → Equipes) antes de cadastrar pessoas.';
    end if;
  end if;
  return public.crm_aplicar_membro(p_caller, p_user, true, p_email, p_nome, p_hierarquia,
                                   v_equipe, v_equipe is not null, p_meta, p_validar_apenas);
end $$;
revoke all on function public.crm_srv_criar_membro(uuid, uuid, text, text, text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.crm_srv_criar_membro(uuid, uuid, text, text, text, text, numeric, boolean) to service_role;

-- ─── 4. IA: líderes gerenciam, vendedor só vê ───────────────────────────────
create or replace function public.integ_tem_perm_de(p_user uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
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
    from public.profiles p join public.hierarquias h on h.id::text = p.hierarquia_id::text
   where p.id = p_user;
  if v_perms is not null and v_perms ? p_perm then
    return coalesce(v_perms ->> p_perm = 'true', false);
  end if;
  if p_perm = 'ia_view' then return true; end if; -- todos da empresa Master veem a aba IA
  if p_perm = 'ia_manage' then
    v_role := public.crm_role_de(p_user);
    return v_role in ('representante', 'supervisor');  -- líderes gerenciam a IA
  end if;
  return false;
end $$;

-- ─── 5. Plano da empresa no tempo real ──────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'empresas') then
    begin
      execute 'alter publication supabase_realtime add table public.empresas';
    exception when others then null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Conferência (opcional): cargos e as permissões novas
-- select nome, slug, ordem, public.crm_jsonb(perms::text) ->> 'equipe_add' as cadastra,
--        public.crm_jsonb(perms::text) ->> 'equipe_remove' as remove,
--        public.crm_jsonb(perms::text) ->> 'ia_manage' as gerencia_ia
--   from public.hierarquias order by empresa_id, ordem;
