-- =============================================================
-- GESTÃO ALIANÇA — estrutura multi-empresa
-- Um master (gestor de sua empresa) acompanha indicadores
-- agregados de outras empresas, sem ver dados individuais.
-- Rode no SQL Editor do Supabase.
-- =============================================================

-- ─── 1. Tabelas ────────────────────────────────────────────────

-- Gestão: agrupamento de empresas sob um master
create table if not exists public.gestoes (
  id          bigint generated always as identity primary key,
  nome        text not null,
  master_user_id uuid not null references auth.users(id),
  master_empresa_id text not null,   -- empresa_id do master (text como profiles.empresa_id)
  ativo       boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Empresas vinculadas a uma gestão
create table if not exists public.gestao_empresas (
  id          bigint generated always as identity primary key,
  gestao_id   bigint not null references public.gestoes(id) on delete cascade,
  empresa_id  text not null,         -- referência à empresa (text como profiles.empresa_id)
  created_at  timestamptz default now(),
  unique (gestao_id, empresa_id)
);

-- Índices para performance
create index if not exists idx_gestoes_master on public.gestoes(master_user_id);
create index if not exists idx_gestao_empresas_gestao on public.gestao_empresas(gestao_id);
create index if not exists idx_gestao_empresas_empresa on public.gestao_empresas(empresa_id);

-- RLS básico: apenas plataforma e o próprio master podem ver/editar
alter table public.gestoes enable row level security;
alter table public.gestao_empresas enable row level security;

-- Plataforma vê tudo
create policy gestoes_plataforma on public.gestoes for all to authenticated
  using (public.crm_plataforma())
  with check (public.crm_plataforma());

create policy gestao_empresas_plataforma on public.gestao_empresas for all to authenticated
  using (public.crm_plataforma())
  with check (public.crm_plataforma());

-- Master vê suas próprias gestões (somente select)
create policy gestoes_master_select on public.gestoes for select to authenticated
  using (master_user_id = auth.uid());

create policy gestao_empresas_master_select on public.gestao_empresas for select to authenticated
  using (gestao_id in (select g.id from public.gestoes g where g.master_user_id = auth.uid()));


-- ─── 2. Funções RPC ────────────────────────────────────────────

-- 2a. Atualizar crm_meu_acesso para incluir info de gestão
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
    'etapas_labels', e.etapas_labels,
    -- NOVO: gestão (null se não é master de nenhuma)
    'gestao', (
      select jsonb_build_object('gestao_id', g.id, 'gestao_nome', g.nome)
        from public.gestoes g
       where g.master_user_id = p.id and g.ativo = true
       limit 1
    )
  )
  from public.profiles p
  left join public.empresas e on e.id::text = p.empresa_id::text
  where p.id = auth.uid()
$$;


-- 2b. Métricas agregadas das empresas de uma gestão
-- Retorna por empresa: total leads, leads no mês, vendas no mês, crédito no mês
-- NÃO retorna nenhum dado individual (sem nomes, telefones, etc.)
create or replace function public.crm_gestao_metricas(
  p_gestao_id bigint,
  p_de date default null,
  p_ate date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_master uuid;
  v_de date := coalesce(p_de, date_trunc('month', now())::date);
  v_ate date := coalesce(p_ate, now()::date);
  v_result jsonb := '[]'::jsonb;
  r record;
begin
  -- Verificar se o usuário é master desta gestão OU plataforma
  select master_user_id into v_master from public.gestoes
   where id = p_gestao_id and ativo = true;

  if v_master is null then
    raise exception 'Gestão não encontrada ou inativa.';
  end if;

  if v_master <> auth.uid() and not public.crm_plataforma() then
    raise exception 'Sem permissão para acessar esta gestão.';
  end if;

  -- Coletar métricas de cada empresa vinculada
  for r in
    select
      ge.empresa_id,
      e.nome as empresa_nome,
      -- total de leads da empresa
      (select count(*) from public.leads l where l.empresa_id::text = ge.empresa_id) as total_leads,
      -- leads criados no período
      (select count(*) from public.leads l
        where l.empresa_id::text = ge.empresa_id
          and (l.created_at at time zone 'America/Sao_Paulo')::date between v_de and v_ate
      ) as leads_periodo,
      -- vendas no período
      (select count(*) from public.vendas v
        where v.empresa_id::text = ge.empresa_id
          and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate
      ) as vendas_periodo,
      -- crédito total no período
      (select coalesce(sum(v.valor_credito), 0) from public.vendas v
        where v.empresa_id::text = ge.empresa_id
          and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate
      ) as credito_periodo,
      -- total de membros ativos
      (select count(*) from public.profiles pr
        where pr.empresa_id::text = ge.empresa_id and coalesce(pr.ativo, true) = true
      ) as membros_ativos
    from public.gestao_empresas ge
    join public.empresas e on e.id::text = ge.empresa_id
    where ge.gestao_id = p_gestao_id
    order by e.nome
  loop
    v_result := v_result || jsonb_build_object(
      'empresa_id', r.empresa_id,
      'empresa_nome', r.empresa_nome,
      'total_leads', r.total_leads,
      'leads_periodo', r.leads_periodo,
      'vendas_periodo', r.vendas_periodo,
      'credito_periodo', r.credito_periodo,
      'membros_ativos', r.membros_ativos
    );
  end loop;

  -- Incluir a empresa do próprio master
  select
    jsonb_build_object(
      'empresa_id', ge_m.empresa_id,
      'empresa_nome', e_m.nome,
      'total_leads', (select count(*) from public.leads where empresa_id::text = ge_m.empresa_id),
      'leads_periodo', (select count(*) from public.leads where empresa_id::text = ge_m.empresa_id
          and (created_at at time zone 'America/Sao_Paulo')::date between v_de and v_ate),
      'vendas_periodo', (select count(*) from public.vendas where empresa_id::text = ge_m.empresa_id
          and coalesce(data_fechamento, (created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate),
      'credito_periodo', (select coalesce(sum(valor_credito), 0) from public.vendas where empresa_id::text = ge_m.empresa_id
          and coalesce(data_fechamento, (created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate),
      'membros_ativos', (select count(*) from public.profiles where empresa_id::text = ge_m.empresa_id and coalesce(ativo, true) = true),
      'is_master', true
    ) into r
  from (select master_empresa_id as empresa_id from public.gestoes where id = p_gestao_id) ge_m
  join public.empresas e_m on e_m.id::text = ge_m.empresa_id;

  -- Verificar se a empresa do master já não está na lista
  if r is not null and not exists (
    select 1 from jsonb_array_elements(v_result) elem
     where elem->>'empresa_id' = (select master_empresa_id from public.gestoes where id = p_gestao_id)
  ) then
    v_result := jsonb_build_array(r) || v_result;
  end if;

  return v_result;
end $$;


-- 2c. Ranking geral entre empresas da gestão
-- Retorna: empresa_nome, user_nome, vendas, credito (agregado por usuario, sem PII de leads)
create or replace function public.crm_gestao_ranking(
  p_gestao_id bigint,
  p_de date default null,
  p_ate date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_master uuid;
  v_de date := coalesce(p_de, date_trunc('month', now())::date);
  v_ate date := coalesce(p_ate, now()::date);
  v_result jsonb := '[]'::jsonb;
  v_master_emp text;
begin
  -- Verificar permissão
  select master_user_id, master_empresa_id into v_master, v_master_emp
    from public.gestoes where id = p_gestao_id and ativo = true;

  if v_master is null then
    raise exception 'Gestão não encontrada ou inativa.';
  end if;

  if v_master <> auth.uid() and not public.crm_plataforma() then
    raise exception 'Sem permissão para acessar esta gestão.';
  end if;

  -- Ranking unificado: todas empresas da gestão + empresa do master
  select jsonb_agg(row_data order by vendas desc, credito desc) into v_result
  from (
    select jsonb_build_object(
      'empresa_nome', e.nome,
      'user_nome', p.nome,
      'user_role', lower(coalesce(p.role, 'vendedor')),
      'vendas', count(v.id),
      'credito', coalesce(sum(v.valor_credito), 0)
    ) as row_data,
    count(v.id) as vendas,
    coalesce(sum(v.valor_credito), 0) as credito
    from public.profiles p
    join public.empresas e on e.id::text = p.empresa_id::text
    left join public.vendas v on v.user_id::text = p.id::text
      and v.empresa_id::text = p.empresa_id::text
      and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate
    where coalesce(p.ativo, true) = true
      and (
        p.empresa_id::text in (select ge.empresa_id from public.gestao_empresas ge where ge.gestao_id = p_gestao_id)
        or p.empresa_id::text = v_master_emp
      )
    group by e.nome, p.nome, p.role
  ) sub;

  return coalesce(v_result, '[]'::jsonb);
end $$;


-- ─── 3. Funções de administração (para plataforma) ─────────────

-- Criar nova gestão
create or replace function public.crm_admin_criar_gestao(
  p_nome text,
  p_master_email text,
  p_empresas_ids text[]  -- lista de empresa_ids para vincular
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_master_uid uuid;
  v_master_emp text;
  v_gestao_id bigint;
  v_emp text;
begin
  if not public.crm_plataforma() then
    raise exception 'Somente o administrador da plataforma pode criar gestões.';
  end if;

  -- Encontrar o master
  select u.id into v_master_uid from auth.users u where lower(u.email) = lower(p_master_email);
  if v_master_uid is null then
    raise exception 'Usuário master com email % não encontrado.', p_master_email;
  end if;

  select empresa_id into v_master_emp from public.profiles where id = v_master_uid;
  if v_master_emp is null then
    raise exception 'Usuário master não está vinculado a nenhuma empresa.';
  end if;

  -- Verificar se já não é master de outra gestão
  if exists (select 1 from public.gestoes where master_user_id = v_master_uid and ativo = true) then
    raise exception 'Este usuário já é master de outra gestão ativa.';
  end if;

  -- Criar a gestão
  insert into public.gestoes (nome, master_user_id, master_empresa_id)
  values (p_nome, v_master_uid, v_master_emp)
  returning id into v_gestao_id;

  -- Vincular empresas (excluindo a do master, que já é implícita)
  if p_empresas_ids is not null then
    foreach v_emp in array p_empresas_ids loop
      if v_emp <> v_master_emp then
        if exists (select 1 from public.empresas where id::text = v_emp) then
          insert into public.gestao_empresas (gestao_id, empresa_id)
          values (v_gestao_id, v_emp)
          on conflict do nothing;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object('gestao_id', v_gestao_id, 'nome', p_nome, 'master', p_master_email);
end $$;


-- Adicionar empresa a uma gestão
create or replace function public.crm_admin_gestao_add_empresa(
  p_gestao_id bigint,
  p_empresa_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then
    raise exception 'Somente o administrador da plataforma pode gerenciar gestões.';
  end if;
  if not exists (select 1 from public.gestoes where id = p_gestao_id) then
    raise exception 'Gestão não encontrada.';
  end if;
  if not exists (select 1 from public.empresas where id::text = p_empresa_id) then
    raise exception 'Empresa não encontrada.';
  end if;
  insert into public.gestao_empresas (gestao_id, empresa_id) values (p_gestao_id, p_empresa_id)
  on conflict do nothing;
end $$;


-- Remover empresa de uma gestão
create or replace function public.crm_admin_gestao_remove_empresa(
  p_gestao_id bigint,
  p_empresa_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then
    raise exception 'Somente o administrador da plataforma pode gerenciar gestões.';
  end if;
  delete from public.gestao_empresas where gestao_id = p_gestao_id and empresa_id = p_empresa_id;
end $$;


-- Desativar/ativar gestão
create or replace function public.crm_admin_toggle_gestao(p_gestao_id bigint, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then
    raise exception 'Somente o administrador da plataforma pode gerenciar gestões.';
  end if;
  update public.gestoes set ativo = p_ativo, updated_at = now() where id = p_gestao_id;
end $$;


-- Listar gestões (para plataforma)
create or replace function public.crm_admin_listar_gestoes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then
    raise exception 'Sem permissão.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id,
      'nome', g.nome,
      'ativo', g.ativo,
      'master_nome', p.nome,
      'master_email', u.email,
      'master_empresa_nome', e.nome,
      'empresas', coalesce((
        select jsonb_agg(jsonb_build_object('empresa_id', ge.empresa_id, 'empresa_nome', e2.nome)
          order by e2.nome)
        from public.gestao_empresas ge
        join public.empresas e2 on e2.id::text = ge.empresa_id
        where ge.gestao_id = g.id
      ), '[]'::jsonb)
    ) order by g.nome)
    from public.gestoes g
    join auth.users u on u.id = g.master_user_id
    left join public.profiles p on p.id = g.master_user_id
    left join public.empresas e on e.id::text = g.master_empresa_id
  ), '[]'::jsonb);
end $$;
