-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Projeto Indicador liberado também no plano Pro (17/11/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema.
--
-- Planos:
--   Master → tudo liberado (IA de atendimento + Projeto Indicador + WhatsApp)
--   Pro    → WhatsApp + Projeto Indicador; IA não
--   Básico → WhatsApp; IA e Indicador não
-- Só muda a regra de plano do Indicador. A IA continua só no Master.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.ind_plano_ok(p_emp text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select lower(coalesce(e.plano, '')) in ('master', 'pro') from public.empresas e where e.id::text = p_emp limit 1), false)
$$;
revoke all on function public.ind_plano_ok(text) from public, anon, authenticated;

create or replace function public.ind_guarda_plano() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_emp text;
begin
  if public.crm_eh_servico() or session_user in ('postgres', 'supabase_admin') or public.crm_plataforma() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_emp := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  if tg_op <> 'DELETE' and not public.ind_plano_ok(v_emp) then
    raise exception 'O Projeto Indicador é exclusivo dos planos Pro e Master. Fale com a Evolux para liberar.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.ind_guarda_plano() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

select 'Indicador liberado no Pro e no Master' as resultado,
       coalesce(string_agg(nome || ' (' || coalesce(plano, 'basico') || ')', ', ') filter (where lower(coalesce(plano,'')) in ('master','pro')), 'nenhuma') as empresas_com_indicador,
       coalesce(string_agg(nome || ' (' || coalesce(plano, 'basico') || ')', ', ') filter (where lower(coalesce(plano,'')) not in ('master','pro')), 'nenhuma') as empresas_sem_indicador
  from public.empresas;
