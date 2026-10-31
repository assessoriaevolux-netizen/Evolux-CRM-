-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Token da proposta por SMS (30/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Precisa dos arquivos anteriores (segurança 22/10 e revisão 29/10).
-- Pode rodar de novo sem problema.
--
-- Como funciona:
--  1. No simulador, o consultor agenda o SMS (agora, 1, 3, 5 ou 10 minutos).
--  2. O CRM gera um token de 6 dígitos. O texto é fixo (ninguém troca por
--     "aprovado"):
--       Ola Joao, sua proposta de carta de credito de R$ 300 mil foi registrada
--       no seu nome. Token para dar continuidade a sua proposta: 482913
--  3. A função crm-sms manda o SMS na hora marcada (o banco chama a cada minuto
--     e o CRM aberto chama na hora exata).
--  4. O cliente lê o token, o consultor digita no CRM e a proposta fica
--     confirmada (data, hora e celular registrados); o lead vai para Negociação.
-- O token nunca aparece para o consultor: fica guardado só até o envio e depois
-- sobra só a "impressão digital" (hash) para conferir.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.sim_tokens (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           text not null,
  criado_por           uuid not null,
  lead_id              text,
  nome                 text not null,
  telefone             text not null,
  valor                numeric not null,
  mensagem             text not null,                -- com {codigo} no lugar do token
  codigo               text,                         -- só até o SMS sair
  codigo_hash          text not null,
  status               text not null default 'agendado'
                       check (status in ('agendado', 'enviando', 'enviado', 'erro', 'confirmado', 'cancelado')),
  enviar_em            timestamptz not null,
  tentativas           integer not null default 0,
  tentativas_confirmar integer not null default 0,
  erro                 text,
  provedor_id          text,
  enviado_em           timestamptz,
  confirmado_em        timestamptz,
  criado_em            timestamptz not null default now()
);
create index if not exists sim_tokens_fila on public.sim_tokens (enviar_em) where status in ('agendado', 'enviando');
create index if not exists sim_tokens_emp on public.sim_tokens (empresa_id, criado_em desc);
create index if not exists sim_tokens_user on public.sim_tokens (criado_por, criado_em desc);

-- Sem acesso direto pela API: tudo passa pelas funções abaixo
alter table public.sim_tokens enable row level security;
revoke all on public.sim_tokens from anon, authenticated;

-- Empresa com plano suspenso não agenda token
drop trigger if exists crm_bloqueio_suspensa on public.sim_tokens;
create trigger crm_bloqueio_suspensa before insert or update or delete on public.sim_tokens
  for each row execute function public.crm_guarda_suspensa();

-- ─── Auxiliares ─────────────────────────────────────────────────────────────
-- "R$ 300 mil", "R$ 312.500", "R$ 1,5 milhão", "R$ 2 milhões"
create or replace function public.sms_valor_txt(p numeric) returns text
language plpgsql immutable as $$
declare v numeric := round(coalesce(p, 0)); m numeric;
begin
  if v >= 1000000 then
    m := round(v / 1000000, 1);
    return 'R$ ' || case when m = trunc(m) then trunc(m)::bigint::text else replace(m::text, '.', ',') end
           || case when m >= 2 then ' milhões' else ' milhão' end;
  end if;
  if v >= 1000 and v % 1000 = 0 then return 'R$ ' || (v / 1000)::bigint || ' mil'; end if;
  return 'R$ ' || regexp_replace(v::bigint::text, '(\d)(?=(\d{3})+$)', '\1.', 'g');
end $$;

-- SMS sem acento cabe em 1 mensagem (160 letras) — com acento seriam 2 ou 3
create or replace function public.sms_sem_acento(p text) returns text
language sql immutable as $$
  select translate(coalesce(p, ''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                                    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')
$$;

create or replace function public.sms_hash(p_id uuid, p_codigo text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_id::text || ':' || coalesce(p_codigo, ''), 'UTF8')), 'hex')
$$;

-- ─── Funções do CRM (pessoa logada) ─────────────────────────────────────────
create or replace function public.sim_token_criar(p_nome text, p_telefone text, p_valor numeric,
                                                  p_lead_id text default null, p_atraso_seg integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp text := public.crm_empresa();
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_primeiro text;
  v_id uuid := gen_random_uuid();
  v_b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_cod text;
  v_quando timestamptz;
  v_msg text;
begin
  if v_emp is null or auth.uid() is null then raise exception 'Sem acesso.'; end if;
  if length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
  if length(v_tel) not in (12, 13) or left(v_tel, 2) <> '55' then
    raise exception 'Celular inválido. Use DDD + número (ex.: 11 98765-4321).';
  end if;
  if length(v_tel) = 12 or substr(v_tel, 5, 1) <> '9' then
    raise exception 'O token vai por SMS: informe um número de CELULAR (com o 9 na frente).';
  end if;
  if length(v_nome) < 2 then raise exception 'Informe o nome do cliente.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor da carta de crédito.'; end if;
  if p_lead_id is not null and p_lead_id <> '' then
    if not exists (select 1 from public.leads l where l.id::text = p_lead_id and l.empresa_id::text = v_emp) then
      raise exception 'Lead não encontrado.';
    end if;
    if not public.crm_gestor() and not coalesce(public.crm_resp_do_lead(p_lead_id) = any (public.crm_visiveis()), false) then
      raise exception 'Você não atende este lead.';
    end if;
  else
    p_lead_id := null;
  end if;
  -- limites contra uso indevido (cada SMS tem custo)
  if (select count(*) from public.sim_tokens where criado_por = auth.uid() and criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'Limite de 30 tokens por hora atingido. Tente mais tarde.';
  end if;
  if (select count(*) from public.sim_tokens where empresa_id = v_emp and telefone = v_tel
        and criado_em > now() - interval '24 hours' and status <> 'cancelado') >= 5 then
    raise exception 'Este celular já recebeu 5 tokens nas últimas 24 horas.';
  end if;

  v_cod := lpad((((get_byte(v_b, 0)::bigint << 16) | (get_byte(v_b, 1)::bigint << 8) | get_byte(v_b, 2)) % 1000000)::text, 6, '0');
  v_primeiro := split_part(v_nome, ' ', 1);
  v_primeiro := upper(left(v_primeiro, 1)) || lower(substr(v_primeiro, 2));
  v_msg := 'Olá ' || v_primeiro || ', sua proposta de carta de crédito de ' || public.sms_valor_txt(p_valor)
           || ' foi registrada no seu nome. Token para dar continuidade à sua proposta: {codigo}';
  v_quando := now() + make_interval(secs => least(greatest(coalesce(p_atraso_seg, 0), 0), 1800));

  insert into public.sim_tokens (id, empresa_id, criado_por, lead_id, nome, telefone, valor, mensagem, codigo, codigo_hash, enviar_em)
  values (v_id, v_emp, auth.uid(), p_lead_id, left(v_nome, 120), v_tel, p_valor, v_msg, v_cod, public.sms_hash(v_id, v_cod), v_quando);

  return jsonb_build_object('id', v_id, 'enviar_em', v_quando, 'status', 'agendado',
                            'mensagem', replace(v_msg, '{codigo}', '••••••'));
end $$;

-- Tokens recentes (o próprio consultor; o gestor vê os da empresa). Nunca devolve o código.
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
     order by t.criado_em desc
     limit 40) x
$$;

create or replace function public.sim_token_confirmar(p_id uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.sim_tokens; v_etapa text; v_movido boolean := false; v_cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
begin
  select * into t from public.sim_tokens where id = p_id for update;
  if t.id is null or t.empresa_id <> public.crm_empresa() or not (t.criado_por = auth.uid() or public.crm_gestor()) then
    raise exception 'Token não encontrado.';
  end if;
  if t.status = 'confirmado' then return jsonb_build_object('ok', true, 'ja_confirmado', true); end if;
  if t.status <> 'enviado' then raise exception 'Este token ainda não foi enviado ao cliente.'; end if;
  if t.enviado_em < now() - interval '24 hours' then raise exception 'Token vencido (vale 24 horas). Gere um novo.'; end if;
  if t.tentativas_confirmar >= 5 then raise exception 'Muitas tentativas erradas. Gere um novo token.'; end if;
  if public.sms_hash(t.id, v_cod) <> t.codigo_hash then
    update public.sim_tokens set tentativas_confirmar = tentativas_confirmar + 1 where id = t.id;
    return jsonb_build_object('ok', false, 'restantes', greatest(4 - t.tentativas_confirmar, 0));
  end if;
  update public.sim_tokens set status = 'confirmado', confirmado_em = now() where id = t.id;
  -- Lead da proposta vai para Negociação (se ainda estava antes dela)
  if t.lead_id is not null then
    select l.etapa into v_etapa from public.leads l where l.id::text = t.lead_id;
    if v_etapa in ('Novo lead', 'Primeiro contato', 'Aguardando resposta', 'Proposta enviada') then
      execute format('update public.leads set etapa = %L, updated_at = now() where id::text = %L', 'Negociação', t.lead_id);
      select l.etapa = 'Negociação' into v_movido from public.leads l where l.id::text = t.lead_id;
    end if;
  end if;
  execute format('insert into public.atividades (empresa_id, user_id, icon, text) values (%L, %L, %L, %L)',
    t.empresa_id, t.criado_por, 'ti-shield-check',
    left(t.nome || ' confirmou o token da proposta de ' || public.sms_valor_txt(t.valor), 500));
  return jsonb_build_object('ok', true, 'lead_movido', coalesce(v_movido, false));
end $$;

create or replace function public.sim_token_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.sim_tokens;
begin
  select * into t from public.sim_tokens where id = p_id for update;
  if t.id is null or t.empresa_id <> public.crm_empresa() or not (t.criado_por = auth.uid() or public.crm_gestor()) then
    raise exception 'Token não encontrado.';
  end if;
  if t.status <> 'agendado' then raise exception 'Só dá para cancelar um token que ainda não saiu.'; end if;
  update public.sim_tokens set status = 'cancelado', codigo = null where id = t.id;
end $$;

-- ─── Funções do servidor de envio (função crm-sms, chave de serviço) ────────
-- Pega os SMS da vez (sem pegar o mesmo duas vezes) e já devolve o texto pronto
create or replace function public.sms_srv_pegar(p_limite integer default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  -- envio que travou no meio volta para a fila
  update public.sim_tokens set status = 'agendado'
   where status = 'enviando' and enviar_em < now() - interval '3 minutes' and tentativas < 3;
  -- empresa suspensa: não envia
  update public.sim_tokens t set status = 'cancelado', codigo = null, erro = 'Plano da empresa suspenso'
   where t.status = 'agendado' and t.enviar_em <= now() and public.crm_empresa_suspensa(t.empresa_id);
  with fila as (
    select id from public.sim_tokens
     where status = 'agendado' and enviar_em <= now()
     order by enviar_em
     limit least(greatest(coalesce(p_limite, 20), 1), 100)
     for update skip locked),
  marcados as (
    update public.sim_tokens t set status = 'enviando', tentativas = t.tentativas + 1
      from fila where t.id = fila.id
    returning t.id, t.telefone, t.empresa_id, public.sms_sem_acento(replace(t.mensagem, '{codigo}', coalesce(t.codigo, ''))) as texto)
  select coalesce(jsonb_agg(to_jsonb(marcados)), '[]'::jsonb) into v from marcados;
  return v;
end $$;

create or replace function public.sms_srv_resultado(p_id uuid, p_ok boolean, p_erro text default null, p_provedor_id text default null, p_definitivo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare t public.sim_tokens;
begin
  select * into t from public.sim_tokens where id = p_id for update;
  if t.id is null then return; end if;
  if p_ok then
    update public.sim_tokens set status = 'enviado', enviado_em = now(), codigo = null, erro = null,
           provedor_id = left(p_provedor_id, 200) where id = p_id;
  elsif not p_definitivo and t.tentativas < 3 then
    update public.sim_tokens set status = 'agendado', enviar_em = now() + interval '30 seconds',
           erro = left(p_erro, 300) where id = p_id;
  else
    update public.sim_tokens set status = 'erro', codigo = null, erro = left(p_erro, 300) where id = p_id;
  end if;
end $$;

-- ─── Permissões ─────────────────────────────────────────────────────────────
revoke all on function public.sms_valor_txt(numeric) from public, anon;
revoke all on function public.sms_sem_acento(text) from public, anon;
revoke all on function public.sms_hash(uuid, text) from public, anon, authenticated;
revoke all on function public.sim_token_criar(text, text, numeric, text, integer) from public, anon;
revoke all on function public.sim_token_lista() from public, anon;
revoke all on function public.sim_token_confirmar(uuid, text) from public, anon;
revoke all on function public.sim_token_cancelar(uuid) from public, anon;
revoke all on function public.sms_srv_pegar(integer) from public, anon, authenticated;
revoke all on function public.sms_srv_resultado(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.sim_token_criar(text, text, numeric, text, integer) to authenticated;
grant execute on function public.sim_token_lista() to authenticated;
grant execute on function public.sim_token_confirmar(uuid, text) to authenticated;
grant execute on function public.sim_token_cancelar(uuid) to authenticated;
grant execute on function public.sms_srv_pegar(integer) to service_role;
grant execute on function public.sms_srv_resultado(uuid, boolean, text, text, boolean) to service_role;
grant all on public.sim_tokens to service_role;

-- ─── Envio automático a cada minuto (pg_cron + pg_net) ──────────────────────
-- Se não der para ativar, o SMS ainda sai na hora certa enquanto o CRM do
-- consultor estiver aberto (o próprio CRM chama o envio).
do $$
declare v_ok text := 'ativado (a cada minuto)';
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute 'create extension if not exists pg_net with schema extensions';
    perform cron.schedule('evolux-sms-token', '* * * * *',
      $cron$ select net.http_post(
               url := 'https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/crm-sms',
               headers := '{"Content-Type": "application/json"}'::jsonb,
               body := '{}'::jsonb) $cron$);
  exception when others then
    v_ok := 'não ativado (' || sqlerrm || '). Ative pg_cron e pg_net em Database → Extensions e rode de novo.';
  end;
  raise notice 'Envio automático do SMS: %', v_ok;
end $$;

notify pgrst, 'reload schema';

commit;

select 'Token por SMS instalado' as resultado;
