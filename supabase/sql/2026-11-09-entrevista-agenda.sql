-- IA de Entrevista: agenda das próximas etapas + rodada a cada minuto
-- Rodar no Supabase → SQL Editor (pode rodar mais de uma vez sem problema)

-- Colunas de agendamento/confirmação (caso o SQL de 07/11 ainda não tenha sido rodado)
alter table public.ia_entrevistas add column if not exists data_agendada timestamptz;
alter table public.ia_entrevistas add column if not exists followup_enviado timestamptz;
create index if not exists idx_entrevistas_agendada on public.ia_entrevistas (data_agendada) where data_agendada is not null;

-- Próximas etapas da conversa (análise do currículo ~3 min depois, mensagem após [PAUSA n])
create table if not exists public.ia_entrevista_agenda (
  id            uuid primary key default gen_random_uuid(),
  entrevista_id text not null,
  tipo          text not null,                 -- 'analise' | 'resto'
  dados         jsonb not null default '{}'::jsonb,
  executar_em   timestamptz not null,
  status        text not null default 'pendente', -- pendente | processando | feito | erro
  criado_em     timestamptz not null default now(),
  feito_em      timestamptz
);
create index if not exists idx_ent_agenda_quando on public.ia_entrevista_agenda (status, executar_em);
create index if not exists idx_ent_agenda_entrevista on public.ia_entrevista_agenda (entrevista_id, status);
alter table public.ia_entrevista_agenda enable row level security; -- só o servidor (service role) acessa

-- Relógio: a cada minuto o banco chama a função, que manda as etapas devidas,
-- retoma conversas paradas e envia a confirmação da manhã das entrevistas
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('evolux-entrevistas-1min')
 where exists (select 1 from cron.job where jobname = 'evolux-entrevistas-1min');

select cron.schedule('evolux-entrevistas-1min', '* * * * *',
  $cron$ select net.http_post(
           url := 'https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/crm-integracoes?tarefa=entrevistas',
           headers := '{"Content-Type": "application/json"}'::jsonb,
           body := '{}'::jsonb) $cron$);

-- Confere: deve aparecer o job evolux-entrevistas-1min
select jobname, schedule, active from cron.job where jobname like 'evolux-%';
