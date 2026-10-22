-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Segurança e consistência dos dados (22/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Roda numa transação única: se der qualquer erro, nada é alterado.
-- Pode ser rodado de novo sem problema (é idempotente).
--
-- O que faz:
--  1. Regras de acesso (RLS) em todas as tabelas: cada empresa só vê os próprios
--     dados e cada pessoa só vê os leads que a hierarquia permite.
--  2. Ninguém consegue mudar o próprio cargo/empresa pelo navegador.
--  3. Funções do servidor para: convidar, editar, transferir leads e remover
--     usuários com as regras de hierarquia.
--  4. Convites com código secreto, validade e limite de uso.
--  5. Empresa desativada fica bloqueada.
--  6. Vendas sempre coerentes com o funil (sem duplicar), contadores do ranking
--     recalculados pelo banco e lances automáticos criados pelo banco.
--  7. Leads: cadastrar/importar, editar, mover no funil e transferir seguem as
--     permissões do cargo; leads de quem já saiu da empresa vão para o gestor.
--
-- No final aparece um relatório. Confira a linha "Contas com acesso de
-- plataforma": ali só devem aparecer as contas da Evolux.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create temp table if not exists crm_relatorio (ordem serial, item text, valor text);
truncate crm_relatorio;

-- ─── 1. Colunas necessárias ─────────────────────────────────────────────────
alter table public.profiles add column if not exists ativo boolean not null default true;
alter table public.profiles add column if not exists desativado_em timestamptz;
alter table public.profiles add column if not exists whatsapp text;
alter table public.profiles add column if not exists instagram text;
alter table public.profiles add column if not exists perms text;
alter table public.profiles add column if not exists hperms text;
alter table public.profiles add column if not exists equipe_id uuid;
alter table public.profiles add column if not exists meta numeric;
alter table public.profiles add column if not exists vendas integer default 0;
alter table public.profiles add column if not exists credito numeric default 0;
alter table public.profiles add column if not exists updated_at timestamptz;

alter table public.empresas add column if not exists ativo boolean default true;
alter table public.empresas add column if not exists plano text;
alter table public.empresas add column if not exists obs text;
alter table public.empresas add column if not exists etapas_labels jsonb;
alter table public.empresas add column if not exists logo_url text;
alter table public.empresas add column if not exists whatsapp text;
alter table public.empresas add column if not exists email text;
alter table public.empresas add column if not exists updated_at timestamptz;

alter table public.equipes add column if not exists gestor_sb_id uuid;
alter table public.equipes add column if not exists representante_sb_id uuid;
alter table public.equipes add column if not exists supervisor_sb_id uuid;
alter table public.equipes add column if not exists meta numeric default 0;
alter table public.equipes add column if not exists periodo text default 'mensal';
alter table public.equipes add column if not exists status text default 'ativa';

alter table public.leads add column if not exists meta_id text;
alter table public.leads add column if not exists administradora text;
alter table public.leads add column if not exists data_criacao date;
alter table public.leads add column if not exists atendimento text;
alter table public.leads add column if not exists origem text;
alter table public.leads add column if not exists obs text;
alter table public.leads add column if not exists updated_at timestamptz;

alter table public.lances add column if not exists auto boolean not null default false;
alter table public.lances add column if not exists removido boolean default false;
alter table public.lances add column if not exists removido_manual boolean not null default false;
alter table public.lances add column if not exists user_id uuid;
alter table public.lances add column if not exists updated_at timestamptz;
alter table public.lances add column if not exists created_at timestamptz default now();

alter table public.vendas add column if not exists cliente_nome text;
alter table public.vendas add column if not exists data_fechamento date;
alter table public.vendas add column if not exists created_at timestamptz default now();

alter table public.eventos_calendario add column if not exists updated_at timestamptz;
alter table public.hierarquias add column if not exists updated_at timestamptz;
alter table public.administradoras add column if not exists cnpj text;
alter table public.administradoras add column if not exists tipo text;
alter table public.administradoras add column if not exists updated_at timestamptz;

create table if not exists public.convites (
  token       text primary key,
  empresa_id  text not null,
  role        text not null default 'vendedor',
  criado_por  uuid,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  max_usos    integer not null default 1,
  usos        integer not null default 0
);

-- Índices (desempenho das regras de acesso)
create index if not exists crm_idx_leads_empresa on public.leads (empresa_id);
create index if not exists crm_idx_leads_resp on public.leads (responsavel_id);
create index if not exists crm_idx_vendas_empresa on public.vendas (empresa_id);
create index if not exists crm_idx_vendas_user on public.vendas (user_id);
create index if not exists crm_idx_lances_lead on public.lances (lead_id);
create index if not exists crm_idx_profiles_empresa on public.profiles (empresa_id);
create index if not exists crm_idx_equipes_empresa on public.equipes (empresa_id);
create index if not exists crm_idx_atividades_empresa on public.atividades (empresa_id, created_at);

-- ─── 2. Funções auxiliares ──────────────────────────────────────────────────
create or replace function public.crm_jsonb(p text) returns jsonb
language plpgsql immutable as $$
begin
  if p is null or btrim(p) in ('', 'null') then return null; end if;
  return p::jsonb;
exception when others then return null;
end $$;

-- Lista (uuid[], text[], json, jsonb) → jsonb array
create or replace function public.crm_lista(p anyelement) returns jsonb
language plpgsql immutable as $$
declare j jsonb;
begin
  if p is null then return '[]'::jsonb; end if;
  if pg_typeof(p) in ('text'::regtype, 'character varying'::regtype) then
    j := public.crm_jsonb(p::text);
  else
    j := to_jsonb(p);
  end if;
  if jsonb_typeof(j) = 'array' then return j; end if;
  return '[]'::jsonb;
end $$;

create or replace function public.crm_hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Chave de telefone para achar duplicados: DDD + 8 últimos dígitos
create or replace function public.crm_chave_tel(p text) returns text
language sql immutable as $$
  select case when length(d) >= 10 then substr(d, 1, 2) || right(d, 8) else null end
  from (select case when length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as d
        from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a) b
$$;

-- Telefone padronizado: 55 + DDD + número (só dígitos)
create or replace function public.crm_tel_normalizado(p text) returns text
language sql immutable as $$
  select case
    when length(x) in (10, 11) then '55' || x
    when length(x) in (12, 13) and left(x, 2) = '55' then x
    else p end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a
$$;

-- Nível do cargo: 0 plataforma, 1 gestor, 2 representante, 3 supervisor, 4 vendedor
create or replace function public.crm_nivel_role(p_role text) returns integer
language sql immutable as $$
  select case lower(coalesce(p_role, ''))
    when 'master' then 0 when 'superadmin' then 0
    when 'gestor' then 1 when 'admin' then 1 when 'administrador' then 1
    when 'representante' then 2 when 'supervisor' then 3 else 4 end
$$;

-- Mesmo mapeamento do CRM (slugToRole)
create or replace function public.crm_role_da_hierarquia(p_slug text, p_ordem integer) returns text
language sql immutable as $$
  select case
    when s like '%gestor%' or s like '%diretor%' or s like '%master%' then 'gestor'
    when s like '%supervisor%' or s like '%coordenador%' then 'supervisor'
    when s like '%representante%' or s like '%consultor%' then 'representante'
    when coalesce(p_ordem, 99) = 1 then 'gestor'
    when p_ordem = 2 then 'supervisor'
    when p_ordem = 3 then 'representante'
    else 'vendedor' end
  from (select lower(coalesce(p_slug, '')) as s) a
$$;

create or replace function public.crm_perfil_de(p_user uuid) returns public.profiles
language sql stable security definer set search_path = public as $$
  select p.* from public.profiles p where p.id = p_user
$$;

-- Empresa ativa do usuário (null = sem acesso)
create or replace function public.crm_empresa_de(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.empresa_id::text
  from public.profiles p
  left join public.empresas e on e.id::text = p.empresa_id::text
  where p.id = p_user
    and coalesce(p.ativo, true)
    and p.empresa_id is not null
    and (coalesce(e.ativo, true) or lower(coalesce(p.role, '')) in ('master', 'superadmin'))
$$;

create or replace function public.crm_role_de(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select lower(coalesce(p.role, 'vendedor')) from public.profiles p
  where p.id = p_user and coalesce(p.ativo, true)
$$;

create or replace function public.crm_plataforma_de(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.crm_role_de(p_user) in ('master', 'superadmin'), false)
$$;

create or replace function public.crm_gestor_de(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.crm_plataforma_de(p_user)
      or (public.crm_empresa_de(p_user) is not null
          and coalesce(public.crm_role_de(p_user) in ('gestor', 'admin', 'administrador'), false))
$$;

create or replace function public.crm_nivel_de(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when public.crm_nivel_role(p.role) <= 1 then public.crm_nivel_role(p.role)
    else greatest(coalesce(h.ordem, public.crm_nivel_role(p.role)), public.crm_nivel_role(p.role)) end
  from public.profiles p
  left join public.hierarquias h on h.id::text = p.hierarquia_id::text
  where p.id = p_user
$$;

-- IDs de usuários cujos leads a pessoa enxerga
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
  elsif v_role = 'supervisor' then
    select v_ids || coalesce(array_agg(distinct m.v), array[]::text[]) into v_ids
      from public.equipes e
      cross join lateral jsonb_array_elements_text(public.crm_lista(e.membros_sb_ids)) as m(v)
      where e.empresa_id::text = v_emp and e.supervisor_sb_id::text = v_me;
  end if;
  return v_ids;
end $$;

-- Permissões que valem quando a chave não existe na hierarquia
create or replace function public.crm_perms_padrao(p_role text) returns jsonb
language sql immutable as $$
  select case
    when lower(coalesce(p_role, '')) in ('supervisor', 'representante') then
      '{"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"leads_import":true,
        "leads_transfer":true,"funil_view":true,"funil_move":true,"simulador_view":true,"lances_view":true,
        "lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,
        "vendas_view":true,"vendas_create":true,"notif_view":true,"notif_team":true,"whatsapp_view":true,
        "agenda_view":true,"config_view":true}'::jsonb
    else
      '{"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"funil_view":true,
        "funil_move":true,"simulador_view":true,"lances_view":true,"lances_create":true,"lances_edit":true,
        "ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,
        "notif_view":true}'::jsonb
  end
$$;

create or replace function public.crm_tem_perm_de(p_user uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_perms jsonb; v_role text;
begin
  if public.crm_empresa_de(p_user) is null and not public.crm_plataforma_de(p_user) then return false; end if;
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

-- Versões para o usuário logado (usadas nas regras de acesso)
create or replace function public.crm_empresa() returns text language sql stable security definer set search_path = public as $$ select public.crm_empresa_de(auth.uid()) $$;
create or replace function public.crm_role() returns text language sql stable security definer set search_path = public as $$ select public.crm_role_de(auth.uid()) $$;
create or replace function public.crm_plataforma() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.crm_plataforma_de(auth.uid()), false) $$;
create or replace function public.crm_gestor() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.crm_gestor_de(auth.uid()), false) $$;
create or replace function public.crm_visiveis() returns text[] language sql stable security definer set search_path = public as $$ select public.crm_visiveis_de(auth.uid()) $$;
create or replace function public.crm_tem_perm(p_perm text) returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.crm_tem_perm_de(auth.uid(), p_perm), false) $$;
create or replace function public.crm_membro_ativo(p_user text, p_emp text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id::text = p_user and p.empresa_id::text = p_emp and coalesce(p.ativo, true))
$$;

-- Chamada feita com a chave de serviço (funções do Supabase/Edge Functions)
create or replace function public.crm_eh_servico() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or coalesce(current_setting('role', true), '') = 'service_role'
$$;

-- Escrita confiável (só funções do servidor ligam esta chave)
create or replace function public.crm_confiavel() returns boolean
language sql stable as $$
  select coalesce(current_setting('crm.trusted', true), '') = 'on'
      or session_user in ('postgres', 'supabase_admin')
$$;

-- ─── 3. Guardas: cargo/empresa/contadores só mudam pelo servidor ────────────
create or replace function public.crm_guarda_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.crm_confiavel() then return new; end if;
  if public.crm_eh_servico() then
    if tg_op = 'INSERT'
       or new.role is distinct from old.role
       or new.empresa_id is distinct from old.empresa_id
       or new.hierarquia_id is distinct from old.hierarquia_id
       or new.ativo is distinct from old.ativo then
      raise exception 'Função desatualizada: cargo e empresa só podem ser definidos pelas funções novas do CRM (atualize a função create-user).';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'vendedor';
    new.empresa_id := null;
    new.hierarquia_id := null;
    new.equipe_id := null;
    new.vendas := 0;
    new.credito := 0;
    new.hperms := null;
    new.perms := null;
    new.ativo := true;
    new.desativado_em := null;
  else
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.empresa_id := old.empresa_id;
    new.hierarquia_id := old.hierarquia_id;
    new.equipe_id := old.equipe_id;
    new.vendas := old.vendas;
    new.credito := old.credito;
    new.hperms := old.hperms;
    new.perms := old.perms;
    new.meta := old.meta;
    new.ativo := old.ativo;
    new.desativado_em := old.desativado_em;
  end if;
  return new;
end $$;

drop trigger if exists crm_guarda_profiles on public.profiles;
create trigger crm_guarda_profiles before insert or update on public.profiles
  for each row execute function public.crm_guarda_profiles();

create or replace function public.crm_guarda_empresas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.crm_confiavel() or public.crm_plataforma() then return new; end if;
  if tg_op = 'INSERT' or public.crm_eh_servico() then
    raise exception 'Somente o administrador da plataforma altera empresas por aqui.';
  end if;
  new.id := old.id;
  new.ativo := old.ativo;
  new.plano := old.plano;
  new.obs := old.obs;
  return new;
end $$;

drop trigger if exists crm_guarda_empresas on public.empresas;
create trigger crm_guarda_empresas before insert or update on public.empresas
  for each row execute function public.crm_guarda_empresas();

-- Hierarquias: quem não é gestor só mexe em cargos abaixo do seu e não dá
-- permissões que ele mesmo não tem.
create or replace function public.crm_guarda_hierarquias() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nivel integer; v_novo jsonb; v_old jsonb; k text;
begin
  if public.crm_confiavel() or public.crm_gestor() then return coalesce(new, old); end if;
  v_nivel := coalesce(public.crm_nivel_de(auth.uid()), 99);
  if tg_op in ('UPDATE', 'DELETE') then
    if coalesce(old.ordem, 99) <= v_nivel or public.crm_role_da_hierarquia(old.slug, old.ordem) = 'gestor' then
      raise exception 'Você só pode alterar cargos abaixo do seu.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if coalesce(new.ordem, 99) <= v_nivel or public.crm_role_da_hierarquia(new.slug, new.ordem) = 'gestor' then
    raise exception 'Você só pode criar ou alterar cargos abaixo do seu.';
  end if;
  if tg_op = 'UPDATE' and new.perms::text is not distinct from old.perms::text then return new; end if;
  v_novo := coalesce(public.crm_jsonb(new.perms::text), '{}'::jsonb);
  v_old := case when tg_op = 'UPDATE' then coalesce(public.crm_jsonb(old.perms::text), '{}'::jsonb) else '{}'::jsonb end;
  if not public.crm_tem_perm('config_permissions') then
    v_novo := v_old;  -- sem permissão para mexer em permissões
  else
    for k in select jsonb_object_keys(v_novo) loop
      if v_novo ->> k = 'true' and k not like '\_%' and not public.crm_tem_perm(k) then
        v_novo := jsonb_set(v_novo, array[k], 'false'::jsonb);
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

drop trigger if exists crm_guarda_hierarquias on public.hierarquias;
create trigger crm_guarda_hierarquias before insert or update or delete on public.hierarquias
  for each row execute function public.crm_guarda_hierarquias();

-- Equipes: quem cuida só da própria equipe não troca os responsáveis dela e só
-- adiciona pessoas abaixo do seu cargo que ainda não estão em outra equipe
-- (senão bastaria "puxar" alguém para a equipe para ver os leads dela).
create or replace function public.crm_guarda_equipes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nivel integer; v_emp text; m text;
begin
  if public.crm_confiavel() or public.crm_gestor() or public.crm_tem_perm('config_teams') then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then raise exception 'Somente o gestor cria equipes.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  new.supervisor_sb_id := old.supervisor_sb_id;
  new.representante_sb_id := old.representante_sb_id;
  new.gestor_sb_id := old.gestor_sb_id;
  new.empresa_id := old.empresa_id;
  v_nivel := coalesce(public.crm_nivel_de(auth.uid()), 99);
  v_emp := old.empresa_id::text;
  for m in select jsonb_array_elements_text(public.crm_lista(new.membros_sb_ids))
           except select jsonb_array_elements_text(public.crm_lista(old.membros_sb_ids)) loop
    if m <> auth.uid()::text and (
         not public.crm_membro_ativo(m, v_emp)
         or coalesce((select public.crm_nivel_de(p.id) from public.profiles p where p.id::text = m), 0) <= v_nivel
         or exists (select 1 from public.equipes e where e.empresa_id::text = v_emp and e.id::text <> old.id::text
                      and public.crm_lista(e.membros_sb_ids) ? m)) then
      raise exception 'Você só pode adicionar à sua equipe pessoas abaixo do seu cargo que não estejam em outra equipe.';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists crm_guarda_equipes on public.equipes;
create trigger crm_guarda_equipes before insert or update or delete on public.equipes
  for each row execute function public.crm_guarda_equipes();

-- Leads: cada alteração segue a permissão do cargo (cadastrar/importar, editar
-- dados, mover no funil, transferir). Sem a permissão, o campo fica como estava.
create or replace function public.crm_guarda_leads() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_novo jsonb; v_old jsonb; c text;
begin
  if public.crm_confiavel() or public.crm_eh_servico() or public.crm_gestor() then return new; end if;
  if tg_op = 'INSERT' then
    if not (public.crm_tem_perm('leads_create') or public.crm_tem_perm('leads_import')) then
      raise exception 'Você não tem permissão para cadastrar leads.';
    end if;
    return new;
  end if;
  v_novo := to_jsonb(new);
  v_old := to_jsonb(old);
  v_novo := jsonb_set(v_novo, '{empresa_id}', coalesce(v_old -> 'empresa_id', 'null'::jsonb));
  if not public.crm_tem_perm('leads_transfer') then
    v_novo := jsonb_set(v_novo, '{responsavel_id}', coalesce(v_old -> 'responsavel_id', 'null'::jsonb));
  end if;
  if not public.crm_tem_perm('funil_move') then
    v_novo := jsonb_set(v_novo, '{etapa}', coalesce(v_old -> 'etapa', 'null'::jsonb));
  end if;
  if not public.crm_tem_perm('leads_edit') then
    foreach c in array array['nome','telefone','tipo','credito','origem','atendimento','obs','administradora','meta_id','data_criacao'] loop
      if v_old ? c then v_novo := jsonb_set(v_novo, array[c], coalesce(v_old -> c, 'null'::jsonb)); end if;
    end loop;
  end if;
  new := jsonb_populate_record(new, v_novo);
  return new;
end $$;

drop trigger if exists crm_guarda_leads on public.leads;
create trigger crm_guarda_leads before insert or update on public.leads
  for each row execute function public.crm_guarda_leads();

-- ─── 4. Consistência: funil ⇄ vendas ⇄ contadores ⇄ lances ─────────────────
create or replace function public.crm_recalcular_contadores(p_user text) returns void
language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('crm.trusted', true);
begin
  if p_user is null then return; end if;
  perform set_config('crm.trusted', 'on', true);
  update public.profiles p
     set vendas = s.qtd, credito = s.total
    from (select count(*)::integer as qtd, coalesce(sum(v.valor_credito), 0) as total
            from public.vendas v where v.user_id::text = p_user) s
   where p.id::text = p_user
     and (p.vendas is distinct from s.qtd or p.credito is distinct from s.total);
  perform set_config('crm.trusted', coalesce(v_prev, ''), true);
end $$;

create or replace function public.crm_mes_label(d date) returns text
language sql immutable as $$
  select (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[extract(month from d)::int]
         || ' ' || extract(year from d)::int
$$;

create or replace function public.crm_tg_leads_vendas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c_fech constant text := 'Fechado / Convertido';
  v_prev text := current_setting('crm.trusted', true);
  v_lance text;
begin
  perform set_config('crm.trusted', 'on', true);
  if new.etapa = c_fech then
    if tg_op = 'INSERT' or old.etapa is distinct from c_fech then
      execute format(
        'insert into public.vendas (empresa_id, user_id, lead_id, cliente_nome, valor_credito, data_fechamento)
         values (%L, %L, %L, %L, %L, %L) on conflict (lead_id) where lead_id is not null do nothing',
        new.empresa_id, new.responsavel_id, new.id, new.nome, coalesce(new.credito, 0), public.crm_hoje());
      -- lance automático (se não houver lance ativo nem removido à mão)
      if not exists (select 1 from public.lances l where l.lead_id::text = new.id::text
                       and (not coalesce(l.removido, false) or coalesce(l.removido_manual, false))) then
        select l.id::text into v_lance from public.lances l
         where l.lead_id::text = new.id::text and l.auto order by l.created_at desc nulls last limit 1;
        if v_lance is not null then
          update public.lances set removido = false, updated_at = now() where id::text = v_lance;
        else
          execute format(
            'insert into public.lances (empresa_id, lead_id, cliente_nome, valor, pct, data_oferta, assembleia, obs, ofertado, removido, auto, user_id)
             values (%L, %L, %L, %L, 0, %L, %L, %L, false, false, true, %L)',
            new.empresa_id, new.id, new.nome, coalesce(new.credito, 0), public.crm_hoje(),
            public.crm_mes_label(public.crm_hoje()), '', new.responsavel_id);
        end if;
      end if;
    else
      execute format(
        'update public.vendas set valor_credito = %L, user_id = %L, cliente_nome = %L
          where lead_id::text = %L and (valor_credito is distinct from %L or user_id::text is distinct from %L or cliente_nome is distinct from %L)',
        coalesce(new.credito, 0), new.responsavel_id, new.nome, new.id::text,
        coalesce(new.credito, 0), new.responsavel_id::text, new.nome);
    end if;
  elsif tg_op = 'UPDATE' and old.etapa = c_fech then
    delete from public.vendas where lead_id::text = new.id::text;
    update public.lances set removido = true, updated_at = now()
     where lead_id::text = new.id::text and auto and not coalesce(removido, false) and not coalesce(removido_manual, false);
  end if;
  perform set_config('crm.trusted', coalesce(v_prev, ''), true);
  return null;
end $$;

drop trigger if exists zz_crm_leads_vendas on public.leads;
create trigger zz_crm_leads_vendas after insert or update of etapa, credito, responsavel_id, nome on public.leads
  for each row execute function public.crm_tg_leads_vendas();

create or replace function public.crm_tg_leads_excluir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.vendas where lead_id::text = old.id::text;
  delete from public.lances where lead_id::text = old.id::text;
  update public.eventos_calendario set lead_id = null where lead_id::text = old.id::text;
  return old;
end $$;

drop trigger if exists crm_leads_excluir on public.leads;
create trigger crm_leads_excluir before delete on public.leads
  for each row execute function public.crm_tg_leads_excluir();

create or replace function public.crm_tg_vendas() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('crm.trusted', true);
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.crm_recalcular_contadores(old.user_id::text); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.user_id::text is distinct from old.user_id::text) then
    perform public.crm_recalcular_contadores(new.user_id::text);
  end if;
  -- Efeitos no lead só quando a venda foi mexida diretamente pelo CRM
  -- (operações internas do servidor já cuidam da coerência sozinhas)
  if pg_trigger_depth() = 1 and not public.crm_confiavel() then
    perform set_config('crm.trusted', 'on', true);
    -- venda excluída direto → lead volta para Negociação
    if tg_op = 'DELETE' and old.lead_id is not null then
      update public.leads set etapa = 'Negociação', updated_at = now()
       where id::text = old.lead_id::text and etapa = 'Fechado / Convertido';
    end if;
    -- valor da venda editado → crédito do lead acompanha
    if tg_op = 'UPDATE' and new.lead_id is not null and new.valor_credito is distinct from old.valor_credito then
      execute format('update public.leads set credito = %L, updated_at = now() where id::text = %L and credito is distinct from %L',
                     new.valor_credito, new.lead_id::text, new.valor_credito);
    end if;
    perform set_config('crm.trusted', coalesce(v_prev, ''), true);
  end if;
  return null;
end $$;

drop trigger if exists zz_crm_vendas on public.vendas;
create trigger zz_crm_vendas after insert or update or delete on public.vendas
  for each row execute function public.crm_tg_vendas();

-- ─── 5. Regras de acesso (RLS) ──────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('profiles','empresas','leads','lances','eventos_calendario','vendas',
                                'atividades','equipes','hierarquias','administradoras','convites') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.empresas enable row level security;
alter table public.leads enable row level security;
alter table public.lances enable row level security;
alter table public.eventos_calendario enable row level security;
alter table public.vendas enable row level security;
alter table public.atividades enable row level security;
alter table public.equipes enable row level security;
alter table public.hierarquias enable row level security;
alter table public.administradoras enable row level security;
alter table public.convites enable row level security;

-- profiles
create policy crm_profiles_ver on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.crm_plataforma()) or empresa_id::text = (select public.crm_empresa()));
create policy crm_profiles_criar on public.profiles for insert to authenticated with check (id = auth.uid());
create policy crm_profiles_editar on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- empresas
create policy crm_empresas_ver on public.empresas for select to authenticated
  using ((select public.crm_plataforma()) or id::text = (select public.crm_empresa()));
create policy crm_empresas_editar on public.empresas for update to authenticated
  using ((select public.crm_plataforma()) or (id::text = (select public.crm_empresa()) and (select public.crm_gestor())))
  with check ((select public.crm_plataforma()) or (id::text = (select public.crm_empresa()) and (select public.crm_gestor())));
create policy crm_empresas_criar on public.empresas for insert to authenticated with check ((select public.crm_plataforma()));
create policy crm_empresas_excluir on public.empresas for delete to authenticated using ((select public.crm_plataforma()));

-- leads
create policy crm_leads_ver on public.leads for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id::text = (select public.crm_empresa())
             and ((select public.crm_gestor()) or responsavel_id::text = any ((select public.crm_visiveis())::text[]))));
create policy crm_leads_criar on public.leads for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or responsavel_id::text = any ((select public.crm_visiveis())::text[]))
              and (responsavel_id is null or public.crm_membro_ativo(responsavel_id::text, empresa_id::text)));
create policy crm_leads_editar on public.leads for update to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id::text = (select public.crm_empresa())
             and ((select public.crm_gestor()) or responsavel_id::text = any ((select public.crm_visiveis())::text[]))))
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or responsavel_id::text = any ((select public.crm_visiveis())::text[]))
              and (responsavel_id is null or public.crm_membro_ativo(responsavel_id::text, empresa_id::text)));
create policy crm_leads_excluir on public.leads for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or responsavel_id::text = any ((select public.crm_visiveis())::text[]))
         and (select public.crm_tem_perm('leads_delete')));

-- vendas (o ranking é da empresa toda)
create policy crm_vendas_ver on public.vendas for select to authenticated
  using ((select public.crm_plataforma()) or empresa_id::text = (select public.crm_empresa()));
create policy crm_vendas_criar on public.vendas for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor())
                   or (user_id::text = any ((select public.crm_visiveis())::text[]) and (select public.crm_tem_perm('vendas_create')))));
create policy crm_vendas_editar on public.vendas for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor())
              or (user_id::text = any ((select public.crm_visiveis())::text[]) and (select public.crm_tem_perm('vendas_edit')))))
  with check (empresa_id::text = (select public.crm_empresa()));
create policy crm_vendas_excluir on public.vendas for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor())
              or (user_id::text = any ((select public.crm_visiveis())::text[]) and (select public.crm_tem_perm('vendas_delete')))));

-- lances
create policy crm_lances_ver on public.lances for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id::text = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or (lead_id is not null and exists (select 1 from public.leads l where l.id::text = lances.lead_id::text))
                  or (lead_id is null and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[]))))));
create policy crm_lances_criar on public.lances for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or (select public.crm_tem_perm('lances_create')))
              and (lead_id is null or exists (select 1 from public.leads l where l.id::text = lances.lead_id::text)));
create policy crm_lances_editar on public.lances for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('lances_edit')))
         and ((select public.crm_gestor())
              or (lead_id is not null and exists (select 1 from public.leads l where l.id::text = lances.lead_id::text))
              or (lead_id is null and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[])))))
  with check (empresa_id::text = (select public.crm_empresa()));
create policy crm_lances_excluir on public.lances for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('lances_edit')))
         and ((select public.crm_gestor())
              or (lead_id is not null and exists (select 1 from public.leads l where l.id::text = lances.lead_id::text))
              or (lead_id is null and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[])))));

-- agenda
create policy crm_eventos_ver on public.eventos_calendario for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id::text = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or user_id::text = any ((select public.crm_visiveis())::text[])
                  or (lead_id is not null and exists (select 1 from public.leads l where l.id::text = eventos_calendario.lead_id::text)))));
create policy crm_eventos_criar on public.eventos_calendario for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and (user_id is null or user_id::text = any ((select public.crm_visiveis())::text[])));
create policy crm_eventos_editar on public.eventos_calendario for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or user_id::text = any ((select public.crm_visiveis())::text[])))
  with check (empresa_id::text = (select public.crm_empresa()));
create policy crm_eventos_excluir on public.eventos_calendario for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or user_id::text = any ((select public.crm_visiveis())::text[])));

-- atividades
create policy crm_atividades_ver on public.atividades for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id::text = (select public.crm_empresa())
             and ((select public.crm_gestor()) or user_id is null or user_id::text = any ((select public.crm_visiveis())::text[]))));
create policy crm_atividades_criar on public.atividades for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and (user_id is null or public.crm_membro_ativo(user_id::text, empresa_id::text)));

-- equipes
create policy crm_equipes_ver on public.equipes for select to authenticated
  using ((select public.crm_plataforma()) or empresa_id::text = (select public.crm_empresa()));
create policy crm_equipes_criar on public.equipes for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_teams'))));
create policy crm_equipes_editar on public.equipes for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_teams'))
              or ((select public.crm_tem_perm('equipe_edit'))
                  and (supervisor_sb_id::text = auth.uid()::text or representante_sb_id::text = auth.uid()::text))))
  with check (empresa_id::text = (select public.crm_empresa()));
create policy crm_equipes_excluir on public.equipes for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_teams'))
              or ((select public.crm_tem_perm('equipe_edit'))
                  and (supervisor_sb_id::text = auth.uid()::text or representante_sb_id::text = auth.uid()::text))));

-- hierarquias
create policy crm_hierarquias_ver on public.hierarquias for select to authenticated
  using ((select public.crm_plataforma()) or empresa_id::text = (select public.crm_empresa()));
create policy crm_hierarquias_criar on public.hierarquias for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_hierarchy'))));
create policy crm_hierarquias_editar on public.hierarquias for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_hierarchy'))))
  with check (empresa_id::text = (select public.crm_empresa()));
create policy crm_hierarquias_excluir on public.hierarquias for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('config_hierarchy'))));

-- administradoras (tabelas do simulador)
create policy crm_admins_ver on public.administradoras for select to authenticated
  using ((select public.crm_plataforma()) or empresa_id::text = (select public.crm_empresa()));
create policy crm_admins_criar on public.administradoras for insert to authenticated
  with check (empresa_id::text = (select public.crm_empresa())
              and ((select public.crm_gestor()) or (select public.crm_tem_perm('simulador_models'))));
create policy crm_admins_editar on public.administradoras for update to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('simulador_models'))))
  with check (empresa_id::text = (select public.crm_empresa()));
create policy crm_admins_excluir on public.administradoras for delete to authenticated
  using (empresa_id::text = (select public.crm_empresa())
         and ((select public.crm_gestor()) or (select public.crm_tem_perm('simulador_models'))));

-- ─── 6. Funções chamadas pelo CRM ───────────────────────────────────────────
-- Situação de acesso do usuário logado (empresa ativa? usuário ativo?)
create or replace function public.crm_meu_acesso() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user_id', p.id, 'nome', p.nome, 'email', p.email,
    'role', lower(coalesce(p.role, 'vendedor')),
    'ativo', coalesce(p.ativo, true),
    'empresa_id', p.empresa_id, 'empresa_nome', e.nome,
    'empresa_ativa', coalesce(e.ativo, true),
    'plataforma', lower(coalesce(p.role, '')) in ('master', 'superadmin'),
    'nivel', public.crm_nivel_de(p.id),
    'etapas_labels', e.etapas_labels)
  from public.profiles p
  left join public.empresas e on e.id::text = p.empresa_id::text
  where p.id = auth.uid()
$$;

-- Hierarquias padrão para uma empresa que ainda não tem nenhuma
create or replace function public.crm_garantir_hierarquias_empresa(p_emp text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vend text := '{"_v":2,"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"funil_view":true,"funil_move":true,"simulador_view":true,"lances_view":true,"lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,"notif_view":true}';
  v_sup text := '{"_v":2,"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"leads_import":true,"leads_transfer":true,"funil_view":true,"funil_move":true,"simulador_view":true,"simulador_models":true,"lances_view":true,"lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,"notif_view":true,"notif_team":true,"whatsapp_view":true,"agenda_view":true,"config_view":true,"equipe_view":true,"equipe_view_sellers":true,"equipe_add":true,"equipe_edit":true,"equipe_remove":true}';
  v_rep text := '{"_v":2,"dashboard_view":true,"leads_view":true,"leads_create":true,"leads_edit":true,"leads_import":true,"leads_transfer":true,"funil_view":true,"funil_move":true,"simulador_view":true,"lances_view":true,"lances_create":true,"lances_edit":true,"ranking_view":true,"ranking_team":true,"ranking_all":true,"vendas_view":true,"vendas_create":true,"notif_view":true,"notif_team":true,"whatsapp_view":true,"agenda_view":true}';
  v_all text;
begin
  if p_emp is null or exists (select 1 from public.hierarquias where empresa_id::text = p_emp) then return; end if;
  v_all := '{"_v":2}';
  perform set_config('crm.trusted', 'on', true);
  execute format('insert into public.hierarquias (empresa_id, slug, nome, descricao, ordem, status, perms) values
    (%L, %L, %L, %L, 1, %L, %L), (%L, %L, %L, %L, 2, %L, %L), (%L, %L, %L, %L, 3, %L, %L), (%L, %L, %L, %L, 4, %L, %L)',
    p_emp, 'gestor', 'Gestor', 'Acesso total à empresa', 'ativa', v_all,
    p_emp, 'representante', 'Representante', 'Responsável pela operação comercial', 'ativa', v_rep,
    p_emp, 'supervisor', 'Supervisor', 'Gerencia equipe e leads', 'ativa', v_sup,
    p_emp, 'vendedor', 'Vendedor', 'Acesso básico ao funil', 'ativa', v_vend);
end $$;

create or replace function public.crm_garantir_hierarquias() returns void
language sql security definer set search_path = public as $$
  select public.crm_garantir_hierarquias_empresa(public.crm_empresa())
$$;

-- Adiciona/remove membro das equipes (funciona com qualquer tipo de coluna)
create or replace function public.crm_definir_equipe(p_user text, p_equipe text, p_emp text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  r record;
  v_lista jsonb;
begin
  select udt_name into v_tipo from information_schema.columns
   where table_schema = 'public' and table_name = 'equipes' and column_name = 'membros_sb_ids';
  for r in select e.id::text as id, public.crm_lista(e.membros_sb_ids) as membros
             from public.equipes e where e.empresa_id::text = p_emp loop
    v_lista := r.membros;
    if r.id = p_equipe then
      if not v_lista ? p_user then v_lista := v_lista || to_jsonb(p_user); end if;
    else
      if v_lista ? p_user then v_lista := v_lista - p_user; else continue; end if;
    end if;
    if r.membros is not distinct from v_lista then continue; end if;
    if v_tipo not like '\_%' then
      -- coluna json/jsonb/text com JSON
      execute format('update public.equipes set membros_sb_ids = %L where id::text = %L', v_lista::text, r.id);
    else
      execute format('update public.equipes set membros_sb_ids = %L where id::text = %L',
        '{' || coalesce((select string_agg(x, ',') from jsonb_array_elements_text(v_lista) x), '') || '}', r.id);
    end if;
  end loop;
end $$;

-- Valida e aplica cadastro/edição de membro (usado pelo CRM e pela função create-user)
create or replace function public.crm_aplicar_membro(
  p_caller uuid, p_alvo uuid, p_novo boolean, p_email text, p_nome text, p_hierarquia text,
  p_equipe text, p_mudar_equipe boolean, p_meta numeric, p_validar_apenas boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa_de(p_caller);
  v_gestor boolean := public.crm_gestor_de(p_caller);
  v_plat boolean := public.crm_plataforma_de(p_caller);
  v_nivel integer := coalesce(public.crm_nivel_de(p_caller), 99);
  v_role_caller text := public.crm_role_de(p_caller);
  v_alvo public.profiles;
  v_h record;
  v_role text;
  v_set text := '';
  v_equipe_ok boolean;
begin
  if v_emp is null then raise exception 'Seu acesso não está ativo.'; end if;
  select * into v_alvo from public.profiles where id = p_alvo;

  if p_novo then
    if not (v_gestor or public.crm_tem_perm_de(p_caller, 'config_users') or public.crm_tem_perm_de(p_caller, 'equipe_add')) then
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
      if not (public.crm_tem_perm_de(p_caller, 'config_users') or public.crm_tem_perm_de(p_caller, 'equipe_edit')) then
        raise exception 'Você não tem permissão para editar usuários.';
      end if;
      if coalesce(public.crm_nivel_de(p_alvo), 99) <= v_nivel or not (p_alvo::text = any (public.crm_visiveis_de(p_caller))) then
        raise exception 'Você só pode editar pessoas abaixo de você na sua equipe.';
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
                     and (v_gestor or public.crm_tem_perm_de(p_caller, 'config_teams')
                          or e.supervisor_sb_id::text = p_caller::text or e.representante_sb_id::text = p_caller::text))
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

-- Usado SOMENTE pela função create-user (service role)
create or replace function public.crm_srv_criar_membro(
  p_caller uuid, p_user uuid, p_email text, p_nome text, p_hierarquia text, p_equipe text, p_meta numeric,
  p_validar_apenas boolean default false
) returns jsonb
language sql security definer set search_path = public as $$
  select public.crm_aplicar_membro(p_caller, p_user, true, p_email, p_nome, p_hierarquia,
                                   p_equipe, p_equipe is not null, p_meta, p_validar_apenas)
$$;

-- Editar membro pelo CRM
create or replace function public.crm_atualizar_membro(
  p_alvo uuid, p_nome text default null, p_meta numeric default null, p_hierarquia text default null,
  p_equipe text default null, p_mudar_equipe boolean default false
) returns jsonb
language sql security definer set search_path = public as $$
  select public.crm_aplicar_membro(auth.uid(), p_alvo, false, null, p_nome, p_hierarquia,
                                   p_equipe, coalesce(p_mudar_equipe, false), p_meta, false)
$$;

-- Remover membro: passa os leads para outra pessoa, tira das equipes,
-- desativa o perfil e bloqueia o login (histórico de vendas é mantido).
create or replace function public.crm_remover_membro(p_alvo uuid, p_transferir_para uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_emp text := public.crm_empresa();
  v_gestor boolean := public.crm_gestor();
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
    v_ok := (public.crm_tem_perm('equipe_remove') or public.crm_tem_perm('config_users')
             or (public.crm_role() = 'supervisor' and lower(coalesce(v_alvo.role, '')) = 'vendedor'))
            and coalesce(public.crm_nivel_de(p_alvo), 99) > coalesce(public.crm_nivel_de(v_me), 99)
            and p_alvo::text = any (public.crm_visiveis());
    if not v_ok then raise exception 'Você só pode remover pessoas abaixo de você na sua equipe.'; end if;
  end if;
  if v_dest = p_alvo or not public.crm_membro_ativo(v_dest::text, v_emp) then
    raise exception 'Escolha uma pessoa ativa da empresa para receber os leads.';
  end if;
  if not v_gestor and not (v_dest::text = any (public.crm_visiveis())) then
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

-- Transferir/distribuir leads (inclusive para fora da sua equipe)
create or replace function public.crm_transferir_leads(p_ids text[], p_destino uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa();
  v_gestor boolean := public.crm_gestor();
  v_vis text[] := public.crm_visiveis();
  v_n integer;
begin
  if v_emp is null then raise exception 'Seu acesso não está ativo.'; end if;
  if not (v_gestor or public.crm_tem_perm('leads_transfer')) then
    raise exception 'Você não tem permissão para transferir leads.';
  end if;
  if not public.crm_membro_ativo(p_destino::text, v_emp) then raise exception 'Destino inválido.'; end if;
  perform set_config('crm.trusted', 'on', true);
  execute format('update public.leads set responsavel_id = %L, updated_at = now()
                   where empresa_id::text = %L and id::text = any (%L::text[]) and (%L or responsavel_id::text = any (%L::text[]))',
                 p_destino, v_emp, p_ids, v_gestor, v_vis);
  get diagnostics v_n = row_count;
  perform set_config('crm.trusted', '', true);
  return v_n;
end $$;

-- Quais leads da importação já existem na empresa (sem expor os dados)
create or replace function public.crm_leads_existentes(p_meta_ids text[], p_chaves text[])
returns table (meta_id text, chave_tel text)
language sql stable security definer set search_path = public as $$
  select l.meta_id, public.crm_chave_tel(l.telefone)
    from public.leads l
   where l.empresa_id::text = public.crm_empresa()
     and ((l.meta_id is not null and l.meta_id = any (coalesce(p_meta_ids, array[]::text[])))
          or public.crm_chave_tel(l.telefone) = any (coalesce(p_chaves, array[]::text[])))
$$;

-- Ranking por período (somado no servidor)
create or replace function public.crm_ranking_vendas(p_de date default null, p_ate date default null)
returns table (user_id text, vendas bigint, credito numeric)
language sql stable security definer set search_path = public as $$
  select v.user_id::text, count(*), coalesce(sum(v.valor_credito), 0)
    from public.vendas v
   where v.empresa_id::text = public.crm_empresa()
     and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date)
         between coalesce(p_de, date '1900-01-01') and coalesce(p_ate, date '2999-12-31')
   group by 1
$$;

-- Nomes das etapas do funil por empresa
create or replace function public.crm_salvar_etapas(p_labels jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp text := public.crm_empresa();
begin
  if v_emp is null then raise exception 'Seu acesso não está ativo.'; end if;
  if not (public.crm_gestor() or public.crm_tem_perm('funil_edit')) then
    raise exception 'Você não tem permissão para editar o funil.';
  end if;
  perform set_config('crm.trusted', 'on', true);
  update public.empresas set etapas_labels = p_labels, updated_at = now() where id::text = v_emp;
  perform set_config('crm.trusted', '', true);
end $$;

-- Convites
create or replace function public.crm_novo_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.crm_admin_criar_convite(p_empresa text, p_role text default 'gestor',
                                                          p_dias integer default 7, p_max_usos integer default 1)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text := public.crm_novo_token();
begin
  if not public.crm_plataforma() then raise exception 'Somente o administrador da plataforma gera convites.'; end if;
  if not exists (select 1 from public.empresas where id::text = p_empresa) then raise exception 'Empresa não encontrada.'; end if;
  if lower(coalesce(p_role, '')) not in ('gestor', 'representante', 'supervisor', 'vendedor') then raise exception 'Cargo inválido.'; end if;
  insert into public.convites (token, empresa_id, role, criado_por, expira_em, max_usos)
  values (v_token, p_empresa, lower(p_role), auth.uid(), now() + make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30))),
          greatest(1, least(coalesce(p_max_usos, 1), 50)));
  return v_token;
end $$;

create or replace function public.crm_info_convite(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('valido', c.expira_em > now() and c.usos < c.max_usos and coalesce(e.ativo, true),
                              'empresa_nome', e.nome, 'role', c.role)
      from public.convites c join public.empresas e on e.id::text = c.empresa_id
     where c.token = p_token), jsonb_build_object('valido', false))
$$;

create or replace function public.crm_aceitar_convite(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.convites;
  v_p public.profiles;
  v_h record;
  v_email text;
begin
  if v_uid is null then raise exception 'Faça login para aceitar o convite.'; end if;
  select * into v_c from public.convites where token = p_token for update;
  if v_c.token is null or v_c.expira_em <= now() or v_c.usos >= v_c.max_usos then
    raise exception 'Convite inválido ou expirado. Peça um novo link.';
  end if;
  select * into v_p from public.profiles where id = v_uid;
  if v_p.id is not null and v_p.empresa_id is not null and coalesce(v_p.ativo, true) then
    if v_p.empresa_id::text = v_c.empresa_id then
      return jsonb_build_object('ok', true, 'ja_vinculado', true);
    end if;
    raise exception 'Sua conta já pertence a outra empresa.';
  end if;
  perform public.crm_garantir_hierarquias_empresa(v_c.empresa_id);
  select h.id::text as id into v_h from public.hierarquias h
   where h.empresa_id::text = v_c.empresa_id
     and (lower(h.slug) = v_c.role or public.crm_role_da_hierarquia(h.slug, h.ordem) = v_c.role)
   order by (lower(h.slug) = v_c.role) desc, h.ordem limit 1;
  select email into v_email from auth.users where id = v_uid;
  perform set_config('crm.trusted', 'on', true);
  if v_p.id is null then
    execute format('insert into public.profiles (id, email, nome, role, empresa_id, hierarquia_id, ativo, vendas, credito, updated_at)
                    values (%L, %L, %L, %L, %L, %L, true, 0, 0, now())',
                   v_uid, v_email, split_part(coalesce(v_email, ''), '@', 1), v_c.role, v_c.empresa_id, v_h.id);
  else
    execute format('update public.profiles set role = %L, empresa_id = %L, hierarquia_id = %L, ativo = true, desativado_em = null, updated_at = now() where id = %L',
                   v_c.role, v_c.empresa_id, v_h.id, v_uid);
  end if;
  update public.convites set usos = usos + 1 where token = p_token;
  perform set_config('crm.trusted', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- Painel de empresas (administrador da plataforma)
create or replace function public.crm_admin_criar_empresa(p_nome text, p_plano text default 'basico') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text; v_token text;
begin
  if not public.crm_plataforma() then raise exception 'Somente o administrador da plataforma cria empresas.'; end if;
  if btrim(coalesce(p_nome, '')) = '' then raise exception 'Informe o nome da empresa.'; end if;
  perform set_config('crm.trusted', 'on', true);
  execute format('insert into public.empresas (nome, plano, ativo) values (%L, %L, true) returning id::text',
                 btrim(p_nome), coalesce(p_plano, 'basico')) into v_id;
  perform public.crm_garantir_hierarquias_empresa(v_id);
  v_token := public.crm_admin_criar_convite(v_id, 'gestor', 7, 1);
  perform set_config('crm.trusted', '', true);
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

create or replace function public.crm_admin_editar_empresa(p_id text, p_nome text, p_plano text, p_obs text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then raise exception 'Somente o administrador da plataforma edita empresas.'; end if;
  perform set_config('crm.trusted', 'on', true);
  update public.empresas set nome = coalesce(nullif(btrim(p_nome), ''), nome), plano = coalesce(p_plano, plano),
         obs = p_obs, updated_at = now() where id::text = p_id;
  perform set_config('crm.trusted', '', true);
end $$;

create or replace function public.crm_admin_ativar_empresa(p_id text, p_ativo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then raise exception 'Somente o administrador da plataforma ativa ou desativa empresas.'; end if;
  perform set_config('crm.trusted', 'on', true);
  update public.empresas set ativo = coalesce(p_ativo, true), updated_at = now() where id::text = p_id;
  perform set_config('crm.trusted', '', true);
end $$;

-- ─── 7. Quem pode executar o quê ────────────────────────────────────────────
-- Remove a função antiga que deixava qualquer um inflar o ranking
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname = 'increment_user_stats' loop
    execute 'drop function ' || r.f;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname like 'crm\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
    if r.proname in ('crm_meu_acesso', 'crm_garantir_hierarquias', 'crm_atualizar_membro', 'crm_remover_membro',
                     'crm_transferir_leads', 'crm_leads_existentes', 'crm_ranking_vendas', 'crm_salvar_etapas',
                     'crm_admin_criar_convite', 'crm_info_convite', 'crm_aceitar_convite', 'crm_admin_criar_empresa',
                     'crm_admin_editar_empresa', 'crm_admin_ativar_empresa',
                     -- usadas dentro das regras de acesso
                     'crm_empresa', 'crm_role', 'crm_plataforma', 'crm_gestor', 'crm_visiveis', 'crm_tem_perm',
                     'crm_membro_ativo', 'crm_chave_tel', 'crm_jsonb', 'crm_lista', 'crm_hoje', 'crm_confiavel') then
      execute format('grant execute on function %s to authenticated', r.f);
    end if;
    if r.proname = 'crm_info_convite' then
      execute format('grant execute on function %s to anon', r.f);
    end if;
    if r.proname = 'crm_srv_criar_membro' then
      execute format('grant execute on function %s to service_role', r.f);
    end if;
  end loop;
end $$;
revoke all on public.convites from anon, authenticated;

-- Tempo real nas tabelas que o CRM acompanha (inclusive equipes: a visibilidade
-- muda quando alguém troca de equipe). As regras de acesso valem também aqui.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['leads','lances','vendas','profiles','hierarquias','atividades','equipes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then null;
      end;
    end if;
  end loop;
end $$;

-- ─── 8. Acerto dos dados existentes ─────────────────────────────────────────
select set_config('crm.trusted', 'on', true);

-- 8.1 Vendas duplicadas para o mesmo lead (mantém a mais antiga)
create temp table crm_dup_antes as select count(*) as n from public.vendas;
with dup as (
  select v.id from (
    select id, row_number() over (partition by lead_id::text order by created_at nulls last, id::text) as rn
      from public.vendas where lead_id is not null) v
  where v.rn > 1)
delete from public.vendas where id in (select id from dup);

insert into crm_relatorio (item, valor)
select 'Vendas duplicadas removidas', ((select n from crm_dup_antes) - (select count(*) from public.vendas))::text;
drop table crm_dup_antes;
create unique index if not exists crm_vendas_lead_unico on public.vendas (lead_id) where lead_id is not null;

-- 8.2 Leads fechados sem venda registrada
do $$
declare n integer;
begin
  execute $q$
    insert into public.vendas (empresa_id, user_id, lead_id, cliente_nome, valor_credito, data_fechamento)
    select l.empresa_id, l.responsavel_id, l.id, l.nome, coalesce(l.credito, 0),
           coalesce((coalesce(l.updated_at, l.created_at) at time zone 'America/Sao_Paulo')::date, public.crm_hoje())
      from public.leads l
     where l.etapa = 'Fechado / Convertido'
       and not exists (select 1 from public.vendas v where v.lead_id::text = l.id::text)
    on conflict (lead_id) where lead_id is not null do nothing $q$;
  get diagnostics n = row_count;
  insert into crm_relatorio (item, valor) values ('Vendas criadas para leads fechados sem venda', n::text);
end $$;

-- 8.3 Lance automático para leads fechados sem nenhum lance
do $$
declare n integer;
begin
  insert into public.lances (empresa_id, lead_id, cliente_nome, valor, pct, data_oferta, assembleia, obs, ofertado, removido, auto, user_id)
  select l.empresa_id, l.id, l.nome, coalesce(l.credito, 0), 0, public.crm_hoje(), public.crm_mes_label(public.crm_hoje()), '', false, false, true,
         case when l.responsavel_id is null then null else l.responsavel_id::text::uuid end
    from public.leads l
   where l.etapa = 'Fechado / Convertido'
     and not exists (select 1 from public.lances x where x.lead_id::text = l.id::text);
  get diagnostics n = row_count;
  insert into crm_relatorio (item, valor) values ('Lances automáticos criados', n::text);
exception when others then
  insert into crm_relatorio (item, valor) values ('Lances automáticos', 'não criados: ' || sqlerrm);
end $$;

-- 8.4 Contadores do ranking recalculados a partir das vendas reais
do $$
declare n integer;
begin
  update public.profiles p
     set vendas = coalesce(s.qtd, 0), credito = coalesce(s.total, 0)
    from (select p2.id, count(v.*)::integer as qtd, coalesce(sum(v.valor_credito), 0) as total
            from public.profiles p2 left join public.vendas v on v.user_id::text = p2.id::text
           group by p2.id) s
   where p.id = s.id and (p.vendas is distinct from s.qtd or p.credito is distinct from s.total);
  get diagnostics n = row_count;
  insert into crm_relatorio (item, valor) values ('Contadores de vendas corrigidos (pessoas)', n::text);
end $$;

-- 8.5 Telefones padronizados (55 + DDD + número)
do $$
declare n integer;
begin
  update public.leads set telefone = public.crm_tel_normalizado(telefone)
   where telefone is not null and telefone is distinct from public.crm_tel_normalizado(telefone);
  get diagnostics n = row_count;
  insert into crm_relatorio (item, valor) values ('Telefones padronizados', n::text);
end $$;

-- 8.6 Permissões que antes não tinham efeito: mantém o que cada cargo já via,
--     para ninguém perder telas de uma hora para outra. (marca "_v":2)
do $$
declare
  r record;
  p jsonb;
  v_role text;
  sup_rep boolean;
  n integer := 0;
begin
  for r in select h.id::text as id, h.slug, h.ordem, h.perms::text as perms from public.hierarquias h loop
    v_role := public.crm_role_da_hierarquia(r.slug, r.ordem);
    p := coalesce(public.crm_jsonb(r.perms), '{}'::jsonb);
    if v_role = 'gestor' or coalesce((p ->> '_v')::int, 0) >= 2 then continue; end if;
    sup_rep := v_role in ('supervisor', 'representante');
    p := p || jsonb_build_object(
      '_v', 2,
      'dashboard_view', true,
      'vendas_view', true,
      'vendas_create', true,
      'notif_view', true,
      'notif_team', sup_rep or coalesce(p ->> 'notif_team' = 'true', false),
      'ranking_team', coalesce(p ->> 'ranking_view' = 'true', false),
      'ranking_all', coalesce(p ->> 'ranking_view' = 'true', false),
      'lances_create', coalesce(p ->> 'lances_view' = 'true', false),
      'lances_edit', coalesce(p ->> 'lances_view' = 'true', false),
      'relatorios_generate', coalesce(p ->> 'relatorios_view' = 'true', false),
      'relatorios_export', coalesce(p ->> 'relatorios_view' = 'true', false),
      'whatsapp_view', sup_rep,
      'agenda_view', sup_rep,
      'leads_import', sup_rep,
      'leads_transfer', sup_rep,
      'funil_edit', false,
      'equipe_view', (v_role = 'supervisor') or coalesce(p ->> 'equipe_view' = 'true', false),
      'equipe_view_sellers', (v_role = 'supervisor') or coalesce(p ->> 'equipe_view_sellers' = 'true', false),
      'equipe_remove', (v_role = 'supervisor') or coalesce(p ->> 'equipe_remove' = 'true', false),
      'simulador_models', (v_role = 'supervisor') or coalesce(p ->> 'simulador_models' = 'true', false));
    execute format('update public.hierarquias set perms = %L where id::text = %L', p::text, r.id);
    n := n + 1;
  end loop;
  insert into crm_relatorio (item, valor) values ('Cargos com permissões ajustadas', n::text);
end $$;

-- 8.7 Empresas sem hierarquia ganham as padrão
do $$
declare r record; n integer := 0;
begin
  for r in select e.id::text as id from public.empresas e
            where not exists (select 1 from public.hierarquias h where h.empresa_id::text = e.id::text) loop
    perform public.crm_garantir_hierarquias_empresa(r.id);
    n := n + 1;
  end loop;
  insert into crm_relatorio (item, valor) values ('Empresas que ganharam hierarquias padrão', n::text);
end $$;

-- 8.8 Leads de quem já saiu da empresa (responsável inexistente ou desativado)
--     passam para o gestor mais antigo da empresa. Leads sem responsável ficam como estão.
do $$
declare n integer;
begin
  execute $q$
    update public.leads l
       set responsavel_id = g.gestor, updated_at = now()
      from (select distinct on (p.empresa_id::text) p.empresa_id::text as emp, p.id as gestor
              from public.profiles p
             where lower(coalesce(p.role, '')) in ('gestor', 'admin', 'administrador') and coalesce(p.ativo, true)
               and p.empresa_id is not null
             order by p.empresa_id::text, (to_jsonb(p) ->> 'created_at') nulls last, p.id::text) g
     where g.emp = l.empresa_id::text
       and l.responsavel_id is not null
       and not exists (select 1 from public.profiles p2
                        where p2.id::text = l.responsavel_id::text and coalesce(p2.ativo, true)
                          and p2.empresa_id::text = l.empresa_id::text) $q$;
  get diagnostics n = row_count;
  insert into crm_relatorio (item, valor) values ('Leads de pessoas que saíram passados para o gestor', n::text);
end $$;

select set_config('crm.trusted', '', true);

-- Conferência
insert into crm_relatorio (item, valor)
select 'Contas com acesso de plataforma (confira se são só suas)',
       coalesce(string_agg(coalesce(email, id::text) || ' (' || role || ')', ', '), 'nenhuma')
  from public.profiles where lower(coalesce(role, '')) in ('master', 'superadmin');
insert into crm_relatorio (item, valor)
select 'Contas cadastradas sem empresa (ficam sem acesso até receberem convite)', count(*)::text
  from public.profiles where empresa_id is null and lower(coalesce(role, '')) not in ('master', 'superadmin');
insert into crm_relatorio (item, valor)
select 'Regras de acesso ativas', count(*)::text from pg_policies where schemaname = 'public' and policyname like 'crm\_%';

commit;

select item as "Resultado", valor as "Valor" from crm_relatorio order by ordem;
