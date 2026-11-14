-- =============================================================
-- GESTÃO — ranking do master por loja, equipes e vendedores
-- Complementa os scripts 2026-11-14 e 2026-11-14b (rode depois deles).
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Devolve só números de venda e nomes de vendedores/equipes das
-- lojas da gestão. Nenhum dado de lead ou cliente sai daqui.
-- =============================================================
create or replace function public.crm_gestao_ranking_lojas(
  p_gestao_id bigint, p_de date default null, p_ate date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_master uuid;
  v_master_emp text;
  v_de  date := coalesce(p_de, date '1900-01-01');
  v_ate date := coalesce(p_ate, date '2999-12-31');
begin
  select master_user_id, master_empresa_id into v_master, v_master_emp
    from public.gestoes where id = p_gestao_id and ativo = true;
  if v_master is null then raise exception 'Gestão não encontrada ou inativa.'; end if;
  if v_master <> auth.uid() and not public.crm_plataforma() then
    raise exception 'Sem permissão para acessar esta gestão.';
  end if;

  return (
    with emps as (
      select v_master_emp as empresa_id
      union
      select ge.empresa_id from public.gestao_empresas ge where ge.gestao_id = p_gestao_id
    ),
    vend as (
      select v.user_id::text as uid, v.empresa_id::text as emp,
             count(*) as n, coalesce(sum(v.valor_credito), 0) as c
        from public.vendas v
       where v.empresa_id::text in (select empresa_id from emps)
         and coalesce(v.data_fechamento, (v.created_at at time zone 'America/Sao_Paulo')::date)
             between v_de and v_ate
       group by 1, 2
    )
    select jsonb_build_object(
      'lojas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'empresa_id', x.empresa_id, 'nome', e.nome, 'logo', e.logo_url,
                 'is_master', x.empresa_id = v_master_emp,
                 'vendas', coalesce((select sum(n) from vend where emp = x.empresa_id), 0),
                 'credito', coalesce((select sum(c) from vend where emp = x.empresa_id), 0),
                 'vendedores', (select count(*) from public.profiles pr
                                 where pr.empresa_id::text = x.empresa_id and coalesce(pr.ativo, true))))
          from emps x join public.empresas e on e.id::text = x.empresa_id), '[]'::jsonb),
      'pessoas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'user_id', p.id, 'nome', p.nome, 'foto', p.foto_url,
                 'role', lower(coalesce(p.role, 'vendedor')),
                 'empresa_id', p.empresa_id::text,
                 'vendas', coalesce(vd.n, 0), 'credito', coalesce(vd.c, 0)))
          from public.profiles p
          left join vend vd on vd.uid = p.id::text and vd.emp = p.empresa_id::text
         where p.empresa_id::text in (select empresa_id from emps)
           and coalesce(p.ativo, true) and coalesce(trim(p.nome), '') <> ''), '[]'::jsonb),
      'equipes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', q.id::text, 'nome', q.nome, 'foto', q.foto_url,
                 'empresa_id', q.empresa_id::text,
                 'supervisor', (select s.nome from public.profiles s where s.id = q.supervisor_sb_id),
                 'membros', public.crm_lista(q.membros_sb_ids),
                 'meta', coalesce(q.meta, 0), 'periodo', coalesce(q.periodo, 'mensal')))
          from public.equipes q
         where q.empresa_id::text in (select empresa_id from emps)), '[]'::jsonb)
    )
  );
end $$;
