-- =============================================================
-- GESTÃO — seleção da empresa master e das empresas da gestão
-- Complementa 2026-11-14-gestao-alianca.sql (rode depois dele).
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================================

-- 1. Quem pode ser master: os gestores ativos de cada empresa
create or replace function public.crm_admin_listar_gestores() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then raise exception 'Sem permissão.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', p.id, 'nome', p.nome, 'email', p.email,
             'empresa_id', p.empresa_id::text, 'empresa_nome', e.nome)
           order by e.nome, p.nome)
      from public.profiles p
      join public.empresas e on e.id::text = p.empresa_id::text
     where coalesce(p.ativo, true) = true
       and lower(coalesce(p.role, '')) in ('gestor', 'master', 'superadmin')
  ), '[]'::jsonb);
end $$;

-- 2. Criar ou editar uma gestão (p_id nulo = criar)
create or replace function public.crm_admin_salvar_gestao(
  p_id bigint, p_nome text, p_master_user uuid, p_empresas text[]
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_emp text;
  v_id  bigint := p_id;
  v_e   text;
begin
  if not public.crm_plataforma() then
    raise exception 'Somente o administrador da plataforma gerencia gestões.';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da gestão.'; end if;

  select empresa_id::text into v_emp from public.profiles where id = p_master_user;
  if v_emp is null then raise exception 'O master escolhido não está vinculado a nenhuma empresa.'; end if;

  if exists (select 1 from public.gestoes
              where master_user_id = p_master_user and ativo = true
                and (v_id is null or id <> v_id)) then
    raise exception 'Este usuário já é master de outra gestão ativa.';
  end if;

  if v_id is null then
    insert into public.gestoes (nome, master_user_id, master_empresa_id)
    values (trim(p_nome), p_master_user, v_emp) returning id into v_id;
  else
    update public.gestoes
       set nome = trim(p_nome), master_user_id = p_master_user,
           master_empresa_id = v_emp, updated_at = now()
     where id = v_id;
    if not found then raise exception 'Gestão não encontrada.'; end if;
  end if;

  delete from public.gestao_empresas where gestao_id = v_id;
  if p_empresas is not null then
    foreach v_e in array p_empresas loop
      if v_e <> v_emp and exists (select 1 from public.empresas where id::text = v_e) then
        insert into public.gestao_empresas (gestao_id, empresa_id) values (v_id, v_e)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return v_id;
end $$;

-- 3. Listagem (agora devolve também os ids, usados na tela de edição)
create or replace function public.crm_admin_listar_gestoes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_plataforma() then raise exception 'Sem permissão.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'nome', g.nome, 'ativo', g.ativo,
      'master_user_id', g.master_user_id,
      'master_empresa_id', g.master_empresa_id,
      'master_nome', p.nome, 'master_email', p.email,
      'master_empresa_nome', e.nome,
      'empresas', coalesce((
        select jsonb_agg(jsonb_build_object('empresa_id', ge.empresa_id, 'empresa_nome', e2.nome) order by e2.nome)
          from public.gestao_empresas ge
          join public.empresas e2 on e2.id::text = ge.empresa_id
         where ge.gestao_id = g.id), '[]'::jsonb)
    ) order by g.nome)
    from public.gestoes g
    left join public.profiles p on p.id = g.master_user_id
    left join public.empresas e on e.id::text = g.master_empresa_id
  ), '[]'::jsonb);
end $$;

-- 4. Indicadores por empresa (corrige o cartão da empresa master)
create or replace function public.crm_gestao_metricas(
  p_gestao_id bigint, p_de date default null, p_ate date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_master uuid;
  v_master_emp text;
  v_de  date := coalesce(p_de, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);
  v_ate date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date);
begin
  select master_user_id, master_empresa_id into v_master, v_master_emp
    from public.gestoes where id = p_gestao_id and ativo = true;
  if v_master is null then raise exception 'Gestão não encontrada ou inativa.'; end if;
  if v_master <> auth.uid() and not public.crm_plataforma() then
    raise exception 'Sem permissão para acessar esta gestão.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'empresa_id', x.empresa_id,
      'empresa_nome', e.nome,
      'is_master', x.empresa_id = v_master_emp,
      'total_leads', (select count(*) from public.leads l where l.empresa_id::text = x.empresa_id),
      'leads_periodo', (select count(*) from public.leads l
                         where l.empresa_id::text = x.empresa_id
                           and (l.created_at at time zone 'America/Sao_Paulo')::date between v_de and v_ate),
      'vendas_periodo', (select count(*) from public.vendas v
                          where v.empresa_id::text = x.empresa_id
                            and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate),
      'credito_periodo', (select coalesce(sum(v.valor_credito), 0) from public.vendas v
                           where v.empresa_id::text = x.empresa_id
                             and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date) between v_de and v_ate),
      'membros_ativos', (select count(*) from public.profiles pr
                          where pr.empresa_id::text = x.empresa_id and coalesce(pr.ativo, true) = true)
    ) order by (x.empresa_id = v_master_emp) desc, e.nome)
    from (select v_master_emp as empresa_id
          union
          select ge.empresa_id from public.gestao_empresas ge where ge.gestao_id = p_gestao_id) x
    join public.empresas e on e.id::text = x.empresa_id
  ), '[]'::jsonb);
end $$;
