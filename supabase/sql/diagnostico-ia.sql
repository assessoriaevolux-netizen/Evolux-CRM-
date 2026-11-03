-- ============================================================================
-- DIAGNÓSTICO DA IA / WHATSAPP / META — somente leitura (não altera nada)
-- Cole tudo no SQL Editor do Supabase e rode. Mostra uma tabela única:
-- cada linha é um item da instalação, com OK / FALTA / ATENÇÃO.
-- ============================================================================

with
tabelas as (
  select count(*) n from pg_tables where schemaname = 'public'
   and tablename in ('integ_meta','integ_meta_paginas','integ_wa_numeros','wa_mensagens','wa_disparos',
                     'ia_roteiros','ia_conversas','ia_fila','integ_eventos','integ_cron','integ_rodizio','integ_instalacao')
),
funcoes as (
  select count(*) n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'integ\_%'
),
cron_ok as (
  select case when exists (select 1 from pg_extension where extname = 'pg_cron')
              then (xpath('/row/n/text()', query_to_xml('select count(*) as n from cron.job where jobname = ''evolux-integracoes-fila''', false, true, '')))[1]::text::int
              else -1 end n
),
emp as (
  select id::text id, nome, lower(coalesce(plano,'')) plano, coalesce(ativo,true) ativo from public.empresas
),
itens as (
  select 10 o, '1. SQL das integrações (tabelas)' item,
         case when (select n from tabelas) = 12 then 'OK' else 'FALTA' end st,
         (select n from tabelas)::text || ' de 12 tabelas' det
  union all
  select 11, '1. SQL das integrações (funções)',
         case when (select n from funcoes) >= 15 then 'OK' else 'FALTA' end,
         (select n from funcoes)::text || ' funções integ_*'
  union all
  select 12, '1. SQL da IA só no Master (integ_ia_liberada)',
         case when exists (select 1 from pg_proc where proname = 'integ_ia_liberada') then 'OK' else 'FALTA' end,
         'arquivo 2026-10-24-whatsapp-livre-ia-master.sql'
  union all
  select 13, '1. SQL da coexistência (colunas pin/status_api)',
         case when exists (select 1 from information_schema.columns
                            where table_name = 'integ_wa_numeros' and column_name = 'status_api') then 'OK' else 'FALTA' end,
         'arquivo 2026-10-24-whatsapp-registro-coexistencia.sql'
  union all
  select 14, '1. Fila automática do pós-venda (pg_cron)',
         case when (select n from cron_ok) > 0 then 'OK'
              when (select n from cron_ok) = 0 then 'ATENÇÃO' else 'ATENÇÃO' end,
         case when (select n from cron_ok) > 0 then 'agendada a cada 10 min'
              else 'não agendada — o pós-venda só anda quando chega mensagem/lead (ative pg_cron e pg_net em Database → Extensions)' end
  union all
  select 20, '2. Meta conectada (empresas)',
         case when (select count(*) from public.integ_meta) > 0 then 'OK' else 'FALTA' end,
         coalesce((select string_agg(coalesce(e.nome, m.empresa_id) || ' [' || coalesce(m.token_tipo,'?') || ', expira '
                    || coalesce(to_char(m.expira_em, 'DD/MM/YYYY'), 'nunca') || coalesce(', ERRO: ' || m.ultimo_erro, '') || ']', ' | ')
                    from public.integ_meta m left join emp e on e.id = m.empresa_id), 'nenhuma empresa conectou a Meta ainda')
  union all
  select 21, '3. Número de WhatsApp cadastrado',
         case when (select count(*) from public.integ_wa_numeros where ativo) > 0 then 'OK' else 'FALTA' end,
         coalesce((select string_agg(coalesce(n.numero,'?') || ' (qualidade ' || coalesce(n.qualidade,'?') || ', api '
                    || coalesce(n.status_api,'?') || case when n.registro_erro is not null then ', ERRO: ' || n.registro_erro else '' end || ')', ' | ')
                    from public.integ_wa_numeros n where n.ativo), 'nenhum número — é o passo pendente (cadastrar na Cloud API)')
  union all
  select 22, '3. Número sem token próprio e sem Meta conectada',
         case when exists (select 1 from public.integ_wa_numeros n
                            where n.token is null and not exists (select 1 from public.integ_meta m where m.empresa_id = n.empresa_id))
              then 'ATENÇÃO' else 'OK' end,
         'número precisa de token permanente OU da conexão Meta da empresa'
  union all
  select 30, '4. Empresas com a IA liberada (plano Master)',
         case when exists (select 1 from emp where plano = 'master' and ativo) then 'OK' else 'FALTA' end,
         coalesce((select string_agg(nome, ', ') from emp where plano = 'master' and ativo),
                  'nenhuma — sem plano Master a IA não responde (painel Empresas → plano)')
  union all
  select 31, '4. Roteiros da IA ligados',
         case when exists (select 1 from public.ia_roteiros where ativo) then 'OK' else 'FALTA' end,
         coalesce((select string_agg(coalesce(e.nome, r.empresa_id) || ': ' || r.tipo || ' (' || r.modelo || ')'
                    || coalesce(' ERRO: ' || r.ultimo_erro, ''), ' | ')
                    from public.ia_roteiros r left join emp e on e.id = r.empresa_id where r.ativo), 'nenhum roteiro ligado — ligue na aba IA')
  union all
  select 32, '4. Modelo inicial escolhido (para leads de formulário/pós-venda)',
         case when not exists (select 1 from public.ia_roteiros where ativo) then 'FALTA'
              when exists (select 1 from public.ia_roteiros where ativo and coalesce(config->>'modelo_inicial','') = '') then 'ATENÇÃO'
              else 'OK' end,
         'a Meta só deixa puxar conversa com modelo aprovado (opcional se a IA só responde quem escreve primeiro)'
  union all
  select 40, '5. Avisos recebidos da Meta (últimos 7 dias)',
         case when (select count(*) from public.integ_eventos where recebido_em > now() - interval '7 days') > 0 then 'OK' else 'ATENÇÃO' end,
         (select count(*) from public.integ_eventos where recebido_em > now() - interval '7 days')::text
           || ' recebidos, ' || (select count(*) from public.integ_eventos where recebido_em > now() - interval '7 days' and erro is not null)::text || ' com erro'
  union all
  select 41, '5. Mensagens de WhatsApp registradas',
         case when (select count(*) from public.wa_mensagens) > 0 then 'OK' else 'ATENÇÃO' end,
         (select count(*) from public.wa_mensagens where direcao = 'entrada')::text || ' recebidas, '
           || (select count(*) from public.wa_mensagens where direcao = 'saida')::text || ' enviadas ('
           || (select count(*) from public.wa_mensagens where ia)::text || ' pela IA, '
           || (select count(*) from public.wa_mensagens where status = 'falhou')::text || ' falharam)'
  union all
  select 42, '5. Últimas falhas de envio',
         case when exists (select 1 from public.wa_mensagens where status = 'falhou') then 'ATENÇÃO' else 'OK' end,
         coalesce((select string_agg(x.erro, ' | ') from (select distinct left(erro, 120) erro from public.wa_mensagens
                    where status = 'falhou' and erro is not null order by 1 limit 3) x), 'sem falhas')
)
select item as "Item", st as "Situação", det as "Detalhe" from itens order by o;
