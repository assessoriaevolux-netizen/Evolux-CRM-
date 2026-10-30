-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Projeto Indicador só no plano Master (30/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema.
--
-- Planos:
--   Master → tudo liberado (IA de atendimento + Projeto Indicador + WhatsApp)
--   Pro    → WhatsApp sim; IA e Indicador não
--   Básico → WhatsApp sim; IA e Indicador não
-- A IA já era só do Master. Aqui o Indicador passa a ser também: empresa fora
-- do Master não cadastra indicadores e os links já enviados param de funcionar
-- (voltam a funcionar se a empresa subir para o Master). Nada é apagado.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.ind_plano_ok(p_emp text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select lower(coalesce(e.plano, '')) = 'master' from public.empresas e where e.id::text = p_emp limit 1), false)
$$;
revoke all on function public.ind_plano_ok(text) from public, anon, authenticated;

-- Gravação no Indicador só para empresa Master (vale para o CRM e para o link público)
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
    raise exception 'O Projeto Indicador é exclusivo do plano Master. Fale com a Evolux para liberar.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.ind_guarda_plano() from public, anon, authenticated;

drop trigger if exists ind_plano on public.ind_indicadores;
create trigger ind_plano before insert or update on public.ind_indicadores
  for each row execute function public.ind_guarda_plano();
drop trigger if exists ind_plano on public.ind_indicacoes;
create trigger ind_plano before insert or update on public.ind_indicacoes
  for each row execute function public.ind_guarda_plano();

-- Página pública /indicar: link de empresa fora do Master aparece como indisponível
create or replace function public.ind_publico_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.ind_indicadores; v_emp_nome text; v_logo text; v_emp_ativo boolean; v_usados integer;
begin
  if p_token is null or p_token !~ '^[a-z0-9]{8,24}$' then return jsonb_build_object('ok', false); end if;
  select * into r from public.ind_indicadores where token = p_token;
  if not found or not r.ativo then return jsonb_build_object('ok', false); end if;
  if not public.ind_plano_ok(r.empresa_id) then return jsonb_build_object('ok', false); end if;
  execute format('select nome, logo_url, coalesce(ativo, true) from public.empresas where id::text = %L', r.empresa_id)
    into v_emp_nome, v_logo, v_emp_ativo;
  if not coalesce(v_emp_ativo, false) then return jsonb_build_object('ok', false); end if;
  select count(*) into v_usados from public.ind_indicacoes where indicador_id = r.id;
  return jsonb_build_object('ok', true,
    'nome', split_part(btrim(r.nome), ' ', 1),
    'empresa', coalesce(v_emp_nome, ''),
    'logo', v_logo,
    'restantes', greatest(r.limite - v_usados, 0));
end $$;
revoke all on function public.ind_publico_info(text) from public;
grant execute on function public.ind_publico_info(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select 'Indicador liberado só no Master' as resultado,
       coalesce(string_agg(nome || ' (' || coalesce(plano, 'basico') || ')', ', ') filter (where lower(coalesce(plano,'')) = 'master'), 'nenhuma') as empresas_com_indicador,
       coalesce(string_agg(nome || ' (' || coalesce(plano, 'basico') || ')', ', ') filter (where lower(coalesce(plano,'')) <> 'master'), 'nenhuma') as empresas_sem_indicador
  from public.empresas;
