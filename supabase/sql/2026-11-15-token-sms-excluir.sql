-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Token SMS: excluir tokens da lista "Tokens recentes" (15/11/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema.
--
-- O que faz:
--  • Cada token da lista ganha um botão de excluir (lixeira) e a lista ganha
--    o botão "Limpar lista".
--  • O token excluído some da tela, mas o registro continua guardado no banco:
--    é ele que segura os limites de envio (30 por hora por usuário e 5 por dia
--    por celular) e a prova de que o cliente confirmou a proposta.
--  • Token que ainda vai sair (agendado/enviando) não é excluído: cancele antes.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.sim_tokens add column if not exists oculto_em timestamptz;

-- Lista: igual à anterior, só deixa de fora os excluídos
create or replace function public.sim_token_lista() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.criado_em desc), '[]'::jsonb) from (
    select t.id, t.nome, t.telefone, t.valor, t.status, t.enviar_em, t.enviado_em, t.confirmado_em, t.erro,
           t.lead_id, t.criado_em, t.criado_por, p.nome as criado_por_nome,
           replace(t.mensagem, '{codigo}', '••••••') as mensagem,
           greatest(5 - t.tentativas_confirmar, 0) as tentativas_restantes,
           t.enviado_em + interval '24 hours' as expira_em
      from public.sim_tokens t
      left join public.profiles p on p.id = t.criado_por
     where t.empresa_id = public.crm_empresa()
       and (t.criado_por = auth.uid() or public.crm_gestor())
       and t.criado_em > now() - interval '7 days'
       and t.oculto_em is null
     order by t.criado_em desc
     limit 40) x
$$;

-- Excluir um token da lista (quem criou, ou o gestor da empresa)
create or replace function public.sim_token_excluir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.sim_tokens;
begin
  select * into t from public.sim_tokens where id = p_id for update;
  if t.id is null or t.empresa_id <> public.crm_empresa() or not (t.criado_por = auth.uid() or public.crm_gestor()) then
    raise exception 'Token não encontrado.';
  end if;
  if t.status in ('agendado', 'enviando') then
    raise exception 'Este SMS ainda vai sair. Cancele o envio antes de excluir.';
  end if;
  update public.sim_tokens set oculto_em = now() where id = t.id and oculto_em is null;
end $$;

-- Limpar lista: exclui de uma vez os tokens da própria pessoa que já terminaram
create or replace function public.sim_token_limpar() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if public.crm_empresa() is null or auth.uid() is null then raise exception 'Sem acesso.'; end if;
  update public.sim_tokens set oculto_em = now()
   where empresa_id = public.crm_empresa()
     and criado_por = auth.uid()
     and oculto_em is null
     and status not in ('agendado', 'enviando');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.sim_token_lista() from public, anon;
revoke all on function public.sim_token_excluir(uuid) from public, anon;
revoke all on function public.sim_token_limpar() from public, anon;
grant execute on function public.sim_token_lista() to authenticated;
grant execute on function public.sim_token_excluir(uuid) to authenticated;
grant execute on function public.sim_token_limpar() to authenticated;

notify pgrst, 'reload schema';

commit;

select 'Excluir tokens da lista: instalado' as resultado;
