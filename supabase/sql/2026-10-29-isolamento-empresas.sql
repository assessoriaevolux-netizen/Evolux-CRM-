-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Isolamento total entre empresas (29/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo sem problema.
--
-- Problema: a conta master da plataforma conseguia LER os dados de todas as
-- empresas (leads, vendas, indicadores, conversas…). A aba Indicador mostrou
-- indicadores de clientes da Evolux por causa disso.
--
-- Correção: uma trava "restritiva" em cada tabela de dados. Ela vale junto com
-- as regras que já existem e exige SEMPRE que a linha seja da empresa de quem
-- está logado — inclusive para o master. O master continua gerenciando as
-- empresas (aba Empresas, convites, ativar/desativar) normalmente, porque isso
-- usa só a tabela "empresas" e funções próprias.
-- As funções do servidor (WhatsApp, Meta, IA, página /indicar) não são afetadas.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  t text;
  v_tipo text;
  v_cond text;
begin
  foreach t in array array[
    'leads', 'vendas', 'lances', 'eventos_calendario', 'atividades', 'equipes', 'hierarquias',
    'administradoras', 'ind_indicadores', 'ind_indicacoes', 'wa_mensagens', 'wa_disparos',
    'ia_conversas', 'ia_roteiros', 'ia_fila', 'integ_meta', 'integ_meta_paginas', 'integ_wa_numeros',
    'integ_eventos', 'integ_rodizio', 'integ_cron'
  ] loop
    -- só tabelas que existem e têm empresa_id
    select c.data_type into v_tipo from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t and c.column_name = 'empresa_id';
    if v_tipo is null then continue; end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists crm_isolamento_empresa on public.%I', t);
    execute format(
      'create policy crm_isolamento_empresa on public.%I as restrictive for all to authenticated
         using (empresa_id::text = (select public.crm_empresa()))
         with check (empresa_id::text = (select public.crm_empresa()))', t);
  end loop;

  -- Perfis: cada um vê o próprio perfil e os colegas da mesma empresa
  drop policy if exists crm_isolamento_empresa on public.profiles;
  create policy crm_isolamento_empresa on public.profiles as restrictive for all to authenticated
    using (id = auth.uid() or empresa_id::text = (select public.crm_empresa()))
    with check (id = auth.uid() or empresa_id::text = (select public.crm_empresa()));
end $$;

notify pgrst, 'reload schema';

commit;

-- Conferência: lista as tabelas travadas
select tablename as tabela_travada
  from pg_policies
 where schemaname = 'public' and policyname = 'crm_isolamento_empresa'
 order by tablename;
