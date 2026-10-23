-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Integrações: Meta (Anúncios e Lead Ads), WhatsApp e IA (23/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Precisa do arquivo 2026-10-22-seguranca-e-consistencia.sql já rodado.
-- Roda numa transação única e pode ser rodado de novo sem problema.
--
-- O que faz:
--  1. Tabelas das integrações. Tokens da Meta e do WhatsApp ficam em tabelas que
--     o navegador NÃO consegue ler: só as funções do servidor usam.
--  2. Mensagens do WhatsApp, disparos, roteiros e conversas da IA, com as mesmas
--     regras de visibilidade dos leads (cada um só vê as conversas dos leads que
--     já pode ver; o gestor vê tudo da empresa).
--  3. Funções usadas pelas Edge Functions meta-callback e crm-integracoes.
--  4. Pós-venda automático: lead que vira "Fechado / Convertido" entra na fila da
--     IA de pós-venda (quando ela estiver ligada).
--  5. Agenda a fila para rodar a cada 10 minutos (se pg_cron/pg_net existirem).
--
-- No final aparece um relatório curto.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- Relatório da instalação (sem acesso pela API)
create table if not exists public.integ_instalacao (ordem serial, item text, valor text, em timestamptz default now());
alter table public.integ_instalacao enable row level security;
revoke all on public.integ_instalacao from anon, authenticated;
delete from public.integ_instalacao;

-- ─── 1. Tabelas ─────────────────────────────────────────────────────────────
-- Conexão da empresa com a Meta (uma por empresa). Guarda o token: só o servidor lê.
create table if not exists public.integ_meta (
  empresa_id      text primary key,
  conectado_por   uuid,
  conectado_nome  text,
  meta_user_id    text,
  meta_user_nome  text,
  token           text not null,
  token_tipo      text,
  expira_em       timestamptz,
  escopos         text[] not null default '{}',
  contas_anuncio  jsonb not null default '[]',
  conta_padrao    text,
  wabas           jsonb not null default '[]',
  descoberto_em   timestamptz,
  ultimo_erro     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Páginas do Facebook da empresa (Lead Ads). Guarda o token da página.
create table if not exists public.integ_meta_paginas (
  empresa_id          text not null,
  page_id             text not null,
  nome                text,
  page_token          text,
  leads_ativo         boolean not null default false,
  responsavel_id      uuid,                          -- vazio = rodízio
  rodizio_ids         uuid[] not null default '{}',  -- vazio = todos menos gestores
  etapa_inicial       text not null default 'Novo lead',
  tipo_padrao         text,
  ia_primeiro_contato boolean not null default false,
  atualizado_em       timestamptz not null default now(),
  primary key (empresa_id, page_id)
);

-- Números de WhatsApp (Cloud API). Guarda o token: só o servidor lê.
create table if not exists public.integ_wa_numeros (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      text not null,
  phone_number_id text not null unique,
  waba_id         text not null,
  numero          text,
  nome_verificado text,
  qualidade       text,
  token           text,            -- token permanente (usuário do sistema); vazio = usa a conexão Meta
  dono_id         uuid,            -- vendedor dono do número; vazio = número da empresa
  padrao          boolean not null default false,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists integ_idx_wa_numeros_emp on public.integ_wa_numeros (empresa_id);

-- Histórico de mensagens (enviadas e recebidas)
create table if not exists public.wa_mensagens (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      text not null,
  lead_id         text,
  phone_number_id text not null,
  contato         text not null,
  contato_nome    text,
  wa_id           text unique,
  direcao         text not null check (direcao in ('entrada', 'saida')),
  tipo            text not null default 'texto',
  conteudo        text,
  template_nome   text,
  midia_id        text,
  status          text not null default 'enviada'
                  check (status in ('pendente', 'enviada', 'entregue', 'lida', 'falhou', 'recebida')),
  erro            text,
  enviado_por     uuid,
  ia              boolean not null default false,
  disparo_id      uuid,
  criado_em       timestamptz not null default now()
);
create index if not exists integ_idx_wa_msg_lead on public.wa_mensagens (empresa_id, lead_id, criado_em desc);
create index if not exists integ_idx_wa_msg_contato on public.wa_mensagens (phone_number_id, contato, criado_em desc);
create index if not exists integ_idx_wa_msg_disparo on public.wa_mensagens (disparo_id) where disparo_id is not null;

-- Disparos em massa
create table if not exists public.wa_disparos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      text not null,
  criado_por      uuid,
  criado_por_nome text,
  phone_number_id text not null,
  template_nome   text not null,
  template_idioma text not null default 'pt_BR',
  variaveis       jsonb not null default '[]',
  total           integer not null default 0,
  enviados        integer not null default 0,
  falhas          integer not null default 0,
  status          text not null default 'enviando' check (status in ('enviando', 'concluido', 'erro')),
  erro            text,
  criado_em       timestamptz not null default now(),
  concluido_em    timestamptz
);
create index if not exists integ_idx_wa_disparos_emp on public.wa_disparos (empresa_id, criado_em desc);

-- Roteiros da IA (um de cada tipo por empresa)
create table if not exists public.ia_roteiros (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     text not null,
  tipo           text not null check (tipo in ('primeiro_atendimento', 'pos_venda')),
  ativo          boolean not null default false,
  roteiro        text not null default '',
  modelo         text not null default 'gpt-6-luna',
  config         jsonb not null default '{}',
  ultimo_erro    text,
  ultimo_erro_em timestamptz,
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  unique (empresa_id, tipo)
);

-- Conversas da IA com cada lead
create table if not exists public.ia_conversas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      text not null,
  lead_id         text not null,
  tipo            text not null check (tipo in ('primeiro_atendimento', 'pos_venda')),
  status          text not null default 'ativa' check (status in ('ativa', 'humano', 'encerrada')),
  phone_number_id text,
  mensagens_ia    integer not null default 0,
  tokens_entrada  integer not null default 0,
  tokens_saida    integer not null default 0,
  custo_usd       numeric(12, 6) not null default 0,
  motivo          text,
  assumido_por    uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (empresa_id, lead_id, tipo)
);
create index if not exists integ_idx_ia_conv_lead on public.ia_conversas (lead_id);

-- Fila de tarefas da IA (pós-venda)
create table if not exists public.ia_fila (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  text not null,
  lead_id     text not null,
  tipo        text not null default 'pos_venda',
  executar_em timestamptz not null,
  status      text not null default 'pendente'
              check (status in ('pendente', 'processando', 'feito', 'cancelado', 'erro')),
  tentativas  integer not null default 0,
  pego_em     timestamptz,
  erro        text,
  criado_em   timestamptz not null default now(),
  feito_em    timestamptz
);
create unique index if not exists integ_idx_fila_unica on public.ia_fila (lead_id, tipo) where status in ('pendente', 'processando');
create index if not exists integ_idx_fila_quando on public.ia_fila (status, executar_em);

-- Avisos recebidos da Meta (guardados antes de processar; apagados após 30 dias)
create table if not exists public.integ_eventos (
  id          uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  objeto      text,
  payload     jsonb,
  processado  boolean not null default false,
  erro        text
);
create index if not exists integ_idx_eventos_data on public.integ_eventos (recebido_em);

-- Controle de execução das tarefas periódicas e do rodízio de leads
create table if not exists public.integ_cron (chave text primary key, ultimo timestamptz);
create table if not exists public.integ_rodizio (chave text primary key, ultimo uuid, em timestamptz);

-- Índices nos leads: achar por telefone, por ID do Meta e pelo id em texto
create index if not exists integ_idx_leads_tel on public.leads ((empresa_id::text), (public.crm_chave_tel(telefone)));
create index if not exists integ_idx_leads_meta on public.leads ((empresa_id::text), meta_id) where meta_id is not null;
create index if not exists integ_idx_leads_idtxt on public.leads ((id::text));

-- ─── 2. Permissões novas ────────────────────────────────────────────────────
-- whatsapp_send  enviar mensagens pelo CRM      (padrão: igual a "Ver a aba WhatsApp")
-- whatsapp_bulk  disparo em massa               (padrão: só gestor)
-- anuncios_view  Gerenciador de Anúncios        (padrão: só gestor)
-- ia_view        ver conversas da IA / assumir  (padrão: igual a "Ver a aba WhatsApp")
-- ia_manage      editar roteiros da IA          (padrão: só gestor)
create or replace function public.integ_tem_perm_de(p_user uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_perms jsonb;
begin
  if p_user is null then return false; end if;
  if public.crm_gestor_de(p_user) then return true; end if;
  if p_perm not in ('whatsapp_send', 'whatsapp_bulk', 'anuncios_view', 'ia_view', 'ia_manage') then
    return coalesce(public.crm_tem_perm_de(p_user, p_perm), false);
  end if;
  if public.crm_empresa_de(p_user) is null then return false; end if;
  select public.crm_jsonb(h.perms::text) into v_perms
    from public.profiles p join public.hierarquias h on h.id::text = p.hierarquia_id::text
   where p.id = p_user;
  if v_perms is not null and v_perms ? p_perm then
    return coalesce(v_perms ->> p_perm = 'true', false);
  end if;
  if p_perm in ('whatsapp_send', 'ia_view') then
    return coalesce(public.crm_tem_perm_de(p_user, 'whatsapp_view'), false);
  end if;
  return false;
end $$;

create or replace function public.integ_tem_perm(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.integ_tem_perm_de(auth.uid(), p_perm), false)
$$;

-- ─── 3. Regras de acesso (RLS) ──────────────────────────────────────────────
alter table public.integ_meta enable row level security;
alter table public.integ_meta_paginas enable row level security;
alter table public.integ_wa_numeros enable row level security;
alter table public.integ_eventos enable row level security;
alter table public.integ_cron enable row level security;
alter table public.integ_rodizio enable row level security;
alter table public.ia_fila enable row level security;
alter table public.wa_mensagens enable row level security;
alter table public.wa_disparos enable row level security;
alter table public.ia_roteiros enable row level security;
alter table public.ia_conversas enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('integ_meta', 'integ_meta_paginas', 'integ_wa_numeros', 'integ_eventos', 'integ_cron',
                                'integ_rodizio', 'ia_fila', 'wa_mensagens', 'wa_disparos', 'ia_roteiros', 'ia_conversas') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Tabelas com tokens ou de uso interno: nenhum acesso pelo navegador
revoke all on public.integ_meta, public.integ_meta_paginas, public.integ_wa_numeros, public.integ_eventos,
              public.integ_cron, public.integ_rodizio, public.ia_fila from anon, authenticated;
-- Mensagens, disparos e conversas: o navegador só lê (quem grava é o servidor)
revoke all on public.wa_mensagens, public.wa_disparos, public.ia_conversas from anon, authenticated;
grant select on public.wa_mensagens, public.wa_disparos, public.ia_conversas to authenticated;
-- Roteiros: o gestor (ou quem tem "Editar os roteiros da IA") grava pelo CRM
revoke all on public.ia_roteiros from anon, authenticated;
grant select, insert, update on public.ia_roteiros to authenticated;
grant all on public.integ_meta, public.integ_meta_paginas, public.integ_wa_numeros, public.integ_eventos,
             public.integ_cron, public.integ_rodizio, public.ia_fila, public.wa_mensagens, public.wa_disparos, public.ia_roteiros,
             public.ia_conversas to service_role;

create policy integ_wa_msg_ver on public.wa_mensagens for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or ((select public.crm_tem_perm('whatsapp_view'))
                      and lead_id is not null
                      and exists (select 1 from public.leads l where l.id::text = wa_mensagens.lead_id)))));

create policy integ_wa_disparos_ver on public.wa_disparos for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor()) or criado_por = auth.uid())));

create policy integ_ia_conv_ver on public.ia_conversas for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or (((select public.integ_tem_perm('ia_view')) or (select public.crm_tem_perm('whatsapp_view')))
                      and exists (select 1 from public.leads l where l.id::text = ia_conversas.lead_id)))));

create policy integ_ia_rot_ver on public.ia_roteiros for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.integ_tem_perm('ia_view')) or (select public.integ_tem_perm('ia_manage')))));
create policy integ_ia_rot_criar on public.ia_roteiros for insert to authenticated
  with check (empresa_id = (select public.crm_empresa()) and (select public.integ_tem_perm('ia_manage')));
create policy integ_ia_rot_editar on public.ia_roteiros for update to authenticated
  using (empresa_id = (select public.crm_empresa()) and (select public.integ_tem_perm('ia_manage')))
  with check (empresa_id = (select public.crm_empresa()));

-- Roteiro: carimba quem alterou e limita o tamanho (o texto vai em toda resposta da IA)
create or replace function public.integ_tg_ia_roteiros() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if length(coalesce(new.roteiro, '')) > 12000 then
    raise exception 'O roteiro pode ter no máximo 12.000 caracteres.';
  end if;
  new.modelo := lower(btrim(coalesce(nullif(new.modelo, ''), 'gpt-6-luna')));
  if new.modelo !~ '^[a-z0-9][a-z0-9.-]{1,60}$' then
    raise exception 'Nome de modelo inválido.';
  end if;
  if new.config is null or jsonb_typeof(new.config) <> 'object' then new.config := '{}'::jsonb; end if;
  return new;
end $$;
drop trigger if exists integ_ia_roteiros on public.ia_roteiros;
create trigger integ_ia_roteiros before insert or update on public.ia_roteiros
  for each row execute function public.integ_tg_ia_roteiros();

-- ─── 4. Funções para o CRM (navegador) ──────────────────────────────────────
-- Situação das integrações da empresa, sem nenhum token
create or replace function public.integ_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp text := public.crm_empresa(); v_g boolean := public.crm_gestor(); r jsonb;
begin
  if v_emp is null then return jsonb_build_object('empresa', false); end if;
  select jsonb_build_object(
    'empresa', true,
    'gestor', v_g,
    'meta', (select jsonb_build_object(
                 'conectado', true, 'conectado_nome', m.conectado_nome, 'meta_user_nome', m.meta_user_nome,
                 'token_tipo', m.token_tipo, 'expira_em', m.expira_em, 'atualizado_em', m.atualizado_em,
                 'descoberto_em', m.descoberto_em, 'contas', m.contas_anuncio, 'conta_padrao', m.conta_padrao,
                 'escopos', to_jsonb(m.escopos), 'ultimo_erro', m.ultimo_erro,
                 'wabas', m.wabas)
               from public.integ_meta m where m.empresa_id = v_emp),
    'paginas', case when v_g then coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'page_id', p.page_id, 'nome', p.nome, 'leads_ativo', p.leads_ativo,
                          'responsavel_id', p.responsavel_id, 'rodizio_ids', to_jsonb(p.rodizio_ids),
                          'etapa_inicial', p.etapa_inicial, 'tipo_padrao', p.tipo_padrao,
                          'ia_primeiro_contato', p.ia_primeiro_contato, 'tem_token', p.page_token is not null)
                        order by p.nome)
                   from public.integ_meta_paginas p where p.empresa_id = v_emp), '[]'::jsonb)
               else '[]'::jsonb end,
    'numeros', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', n.id, 'phone_number_id', n.phone_number_id, 'waba_id', n.waba_id,
                          'numero', n.numero, 'nome_verificado', n.nome_verificado, 'qualidade', n.qualidade,
                          'dono_id', n.dono_id, 'padrao', n.padrao, 'ativo', n.ativo,
                          'token_proprio', n.token is not null)
                        order by n.padrao desc, n.numero)
                   from public.integ_wa_numeros n where n.empresa_id = v_emp), '[]'::jsonb),
    'ia', coalesce((
                 select jsonb_object_agg(i.tipo, jsonb_build_object('ativo', i.ativo, 'ultimo_erro', i.ultimo_erro,
                                                                    'ultimo_erro_em', i.ultimo_erro_em))
                   from public.ia_roteiros i where i.empresa_id = v_emp), '{}'::jsonb)
  ) into r;
  return r;
end $$;

-- Caixa de entrada: última mensagem de cada lead que a pessoa pode ver
create or replace function public.integ_wa_conversas(p_busca text default null, p_limite integer default 60)
returns table (lead_id text, nome text, telefone text, etapa text, responsavel_id text,
               ultima text, ultima_direcao text, ultima_em timestamptz, ultima_status text, ultima_ia boolean,
               nao_lidas integer, ia_status text, ia_tipo text, janela_ate timestamptz)
language sql stable security invoker set search_path = public as $$
  with ult as (
    select distinct on (m.lead_id) m.lead_id, m.conteudo, m.direcao, m.criado_em, m.status, m.ia, m.template_nome
      from public.wa_mensagens m
     where m.lead_id is not null and m.empresa_id = public.crm_empresa()
     order by m.lead_id, m.criado_em desc)
  select u.lead_id, l.nome, l.telefone, l.etapa, l.responsavel_id::text,
         coalesce(u.conteudo, case when u.template_nome is not null then 'Modelo: ' || u.template_nome end),
         u.direcao, u.criado_em, u.status, u.ia,
         (select count(*)::integer from public.wa_mensagens e
           where e.lead_id = u.lead_id and e.direcao = 'entrada'
             and e.criado_em > coalesce((select max(s.criado_em) from public.wa_mensagens s
                                          where s.lead_id = u.lead_id and s.direcao = 'saida'), '-infinity'::timestamptz)),
         c.status, c.tipo,
         (select max(e.criado_em) + interval '24 hours' from public.wa_mensagens e
           where e.lead_id = u.lead_id and e.direcao = 'entrada')
    from ult u
    join public.leads l on l.id::text = u.lead_id
    left join lateral (select ic.status, ic.tipo from public.ia_conversas ic
                        where ic.lead_id = u.lead_id order by ic.atualizado_em desc limit 1) c on true
   where coalesce(btrim(p_busca), '') = ''
      or l.nome ilike '%' || btrim(p_busca) || '%'
      -- busca por telefone só quando a pessoa digitou números (sem letras)
      or (p_busca !~ '[[:alpha:]]' and length(regexp_replace(p_busca, '\D', '', 'g')) >= 3
          and l.telefone like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%')
   order by u.criado_em desc
   limit least(greatest(coalesce(p_limite, 60), 1), 200)
$$;

-- ─── 5. Funções do servidor (Edge Functions, chave de serviço) ──────────────
-- Quem é a pessoa que chamou e o que ela pode fazer
create or replace function public.integ_srv_contexto(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp text := public.crm_empresa_de(p_user); v jsonb;
begin
  select jsonb_build_object(
    'user_id', p.id, 'nome', p.nome, 'email', p.email, 'role', lower(coalesce(p.role, 'vendedor')),
    'empresa_id', v_emp, 'empresa_nome', e.nome,
    'gestor', coalesce(public.crm_gestor_de(p.id), false),
    'plataforma', coalesce(public.crm_plataforma_de(p.id), false),
    'perms', jsonb_build_object(
      'whatsapp_view', public.integ_tem_perm_de(p.id, 'whatsapp_view'),
      'whatsapp_send', public.integ_tem_perm_de(p.id, 'whatsapp_send'),
      'whatsapp_bulk', public.integ_tem_perm_de(p.id, 'whatsapp_bulk'),
      'anuncios_view', public.integ_tem_perm_de(p.id, 'anuncios_view'),
      'ia_view', public.integ_tem_perm_de(p.id, 'ia_view'),
      'ia_manage', public.integ_tem_perm_de(p.id, 'ia_manage'),
      'config_view', public.integ_tem_perm_de(p.id, 'config_view')))
    into v
    from public.profiles p
    left join public.empresas e on e.id::text = v_emp
   where p.id = p_user and coalesce(p.ativo, true);
  return v;
end $$;

-- Um lead, se a pessoa pode vê-lo
create or replace function public.integ_srv_lead(p_user uuid, p_lead text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp text := public.crm_empresa_de(p_user); v jsonb;
begin
  if v_emp is null or p_lead is null then return null; end if;
  select jsonb_build_object('id', l.id::text, 'nome', l.nome, 'telefone', l.telefone, 'tipo', l.tipo,
                            'credito', l.credito, 'etapa', l.etapa, 'responsavel_id', l.responsavel_id::text,
                            'responsavel_nome', r.nome, 'empresa_id', l.empresa_id::text)
    into v
    from public.leads l
    left join public.profiles r on r.id::text = l.responsavel_id::text
   where l.id::text = p_lead and l.empresa_id::text = v_emp
     and (public.crm_gestor_de(p_user) or l.responsavel_id::text = any (public.crm_visiveis_de(p_user)));
  return v;
end $$;

-- Vários leads (disparo em massa), só os que a pessoa pode ver
create or replace function public.integ_srv_leads(p_user uuid, p_ids text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp text := public.crm_empresa_de(p_user); v jsonb; v_g boolean := public.crm_gestor_de(p_user);
        v_vis text[] := public.crm_visiveis_de(p_user);
begin
  if v_emp is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id::text, 'nome', l.nome, 'telefone', l.telefone,
                                               'tipo', l.tipo, 'credito', l.credito, 'etapa', l.etapa,
                                               'responsavel_id', l.responsavel_id::text, 'responsavel_nome', r.nome)), '[]'::jsonb)
    into v
    from public.leads l
    left join public.profiles r on r.id::text = l.responsavel_id::text
   where l.id::text = any (p_ids) and l.empresa_id::text = v_emp
     and (v_g or l.responsavel_id::text = any (v_vis));
  return v;
end $$;

-- Registra uma atividade (aparece no histórico e nas notificações)
create or replace function public.integ_srv_atividade(p_emp text, p_user text, p_icon text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  execute format('insert into public.atividades (empresa_id, user_id, icon, text) values (%L, %L, %L, %L)',
                 p_emp, p_user, coalesce(p_icon, 'ti-activity'), left(coalesce(p_texto, ''), 500));
end $$;

-- Escolhe o responsável: fixo (se ainda está ativo) ou rodízio — um para cada,
-- na ordem alfabética, continuando de onde parou (cada página/número tem o seu)
drop function if exists public.integ_srv_responsavel(text, uuid, uuid[]);
create or replace function public.integ_srv_responsavel(p_emp text, p_fixo uuid, p_rodizio uuid[], p_chave text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; v_lista uuid[]; v_ult uuid; v_pos integer; v_chave text := coalesce(p_chave, 'empresa:' || p_emp);
begin
  if p_fixo is not null and public.crm_membro_ativo(p_fixo::text, p_emp) then return p_fixo; end if;
  select array_agg(p.id order by lower(coalesce(p.nome, '')), p.id) into v_lista
    from public.profiles p
   where p.empresa_id::text = p_emp and coalesce(p.ativo, true)
     and case when coalesce(cardinality(p_rodizio), 0) > 0 then p.id = any (p_rodizio)
              else public.crm_nivel_role(p.role) >= 2 end;
  if coalesce(cardinality(v_lista), 0) = 0 then
    -- ninguém no rodízio: fica com o gestor
    select p.id into v from public.profiles p
     where p.empresa_id::text = p_emp and coalesce(p.ativo, true) and public.crm_nivel_role(p.role) <= 1
     order by lower(coalesce(p.nome, '')), p.id limit 1;
    return v;
  end if;
  insert into public.integ_rodizio (chave, ultimo, em) values (v_chave, null, now()) on conflict (chave) do nothing;
  select r.ultimo into v_ult from public.integ_rodizio r where r.chave = v_chave for update;
  v_pos := array_position(v_lista, v_ult);
  v := v_lista[coalesce(v_pos, 0) % cardinality(v_lista) + 1];
  update public.integ_rodizio set ultimo = v, em = now() where chave = v_chave;
  return v;
end $$;

-- Cria um lead vindo de fora (Meta ou WhatsApp) e avisa o responsável
create or replace function public.integ_srv_inserir_lead(p_emp text, p_nome text, p_tel text, p_tipo text, p_credito numeric,
  p_etapa text, p_origem text, p_obs text, p_meta_id text, p_resp uuid, p_canal text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; v_tel text := public.crm_tel_normalizado(p_tel); v_nome text; v_resp_nome text;
        v_tipo text := coalesce(nullif(btrim(p_tipo), ''), 'Imóvel');
begin
  if v_tipo not in ('Imóvel', 'Automóvel', 'Moto', 'Serviço') then v_tipo := 'Imóvel'; end if;
  v_nome := left(coalesce(nullif(btrim(p_nome), ''), 'Sem nome'), 120);
  perform set_config('crm.trusted', 'on', true);
  execute format(
    'insert into public.leads (empresa_id, responsavel_id, nome, telefone, tipo, credito, etapa, origem, obs, meta_id,
                               data_criacao, atendimento, updated_at)
     values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now()) returning id::text',
    p_emp, p_resp, v_nome, coalesce(v_tel, ''), v_tipo, greatest(coalesce(p_credito, 0), 0),
    coalesce(nullif(p_etapa, ''), 'Novo lead'), p_origem, left(coalesce(p_obs, ''), 4000), p_meta_id,
    public.crm_hoje(), '')
    into v_id;
  perform set_config('crm.trusted', '', true);
  select nome into v_resp_nome from public.profiles where id = p_resp;
  perform public.integ_srv_atividade(p_emp, p_resp::text, case when p_canal = 'whatsapp' then 'ti-brand-whatsapp' else 'ti-brand-meta' end,
    'Novo lead ' || case when p_canal = 'whatsapp' then 'pelo WhatsApp' else 'do Meta' end || ': ' || v_nome
    || coalesce(' → ' || v_resp_nome, ''));
  return v_id;
end $$;

-- Lead do formulário do Meta: não duplica (mesmo ID do Meta ou mesmo telefone)
create or replace function public.integ_srv_meta_lead(p_emp text, p_page text, p_leadgen text, p_nome text, p_tel text,
  p_tipo text, p_credito numeric, p_obs text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pg public.integ_meta_paginas; v_id text; v_resp uuid; v_chave text := public.crm_chave_tel(p_tel);
        v_exist text; v_exist_resp text; v_exist_nome text; v_etapa text; v_nota text;
begin
  select * into pg from public.integ_meta_paginas where empresa_id = p_emp and page_id = p_page;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'pagina'); end if;
  perform pg_advisory_xact_lock(hashtext('integ_lead:' || p_emp || ':' || coalesce(v_chave, p_leadgen)));

  select l.id::text into v_exist from public.leads l
   where l.empresa_id::text = p_emp and l.meta_id = p_leadgen limit 1;
  if v_exist is not null then
    return jsonb_build_object('ok', true, 'lead_id', v_exist, 'novo', false, 'repetido', 'meta_id');
  end if;

  if v_chave is not null then
    select l.id::text, l.responsavel_id::text, l.nome into v_exist, v_exist_resp, v_exist_nome
      from public.leads l
     where l.empresa_id::text = p_emp and public.crm_chave_tel(l.telefone) = v_chave
     order by l.created_at desc nulls last limit 1;
  end if;
  if v_exist is not null then
    v_nota := 'Preencheu de novo um formulário do Meta em '
              || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.';
    perform set_config('crm.trusted', 'on', true);
    execute format('update public.leads set obs = left(case when coalesce(obs, %L) = %L then %L else obs || E''\n'' || %L end, 4000),
                    updated_at = now() where id::text = %L', '', '', v_nota, v_nota, v_exist);
    perform set_config('crm.trusted', '', true);
    perform public.integ_srv_atividade(p_emp, v_exist_resp, 'ti-brand-meta',
      coalesce(v_exist_nome, 'Lead') || ' preencheu de novo um formulário do Meta');
    return jsonb_build_object('ok', true, 'lead_id', v_exist, 'novo', false, 'repetido', 'telefone');
  end if;

  v_resp := public.integ_srv_responsavel(p_emp, pg.responsavel_id, pg.rodizio_ids, 'pagina:' || p_page);
  v_etapa := case when pg.etapa_inicial in ('Novo lead', 'Primeiro contato', 'Aguardando resposta', 'Proposta enviada', 'Negociação')
                  then pg.etapa_inicial else 'Novo lead' end;
  v_id := public.integ_srv_inserir_lead(p_emp, p_nome, p_tel, coalesce(nullif(p_tipo, ''), pg.tipo_padrao), p_credito,
                                        v_etapa, 'Meta Ads', p_obs, p_leadgen, v_resp, 'meta');
  return jsonb_build_object('ok', true, 'lead_id', v_id, 'novo', true, 'responsavel_id', v_resp,
                            'ia_primeiro_contato', pg.ia_primeiro_contato);
end $$;

-- Mensagem recebida no WhatsApp: acha (ou cria) o lead e grava a mensagem
create or replace function public.integ_srv_wa_entrada(p_numero text, p_contato text, p_nome text, p_wa_id text,
  p_tipo text, p_conteudo text, p_midia text, p_referral jsonb, p_em timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.integ_wa_numeros; v_chave text := public.crm_chave_tel(p_contato);
        v_lead text; v_nome text; v_etapa text; v_resp text; v_novo boolean := false; v_msg uuid;
        v_origem text; v_obs text; v_ref boolean := p_referral is not null and jsonb_typeof(p_referral) = 'object';
begin
  select * into n from public.integ_wa_numeros where phone_number_id = p_numero and ativo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'numero_desconhecido'); end if;
  if p_wa_id is not null and exists (select 1 from public.wa_mensagens where wa_id = p_wa_id) then
    return jsonb_build_object('ok', true, 'duplicada', true);
  end if;
  perform pg_advisory_xact_lock(hashtext('integ_wa:' || n.empresa_id || ':' || coalesce(v_chave, p_contato)));

  if v_chave is not null then
    select l.id::text, l.nome, l.etapa, l.responsavel_id::text into v_lead, v_nome, v_etapa, v_resp
      from public.leads l
     where l.empresa_id::text = n.empresa_id and public.crm_chave_tel(l.telefone) = v_chave
     order by l.created_at desc nulls last limit 1;
  end if;
  if v_lead is null then
    v_origem := case when v_ref then 'Meta Ads' else 'WhatsApp' end;
    v_obs := 'Chegou pelo WhatsApp'
             || case when v_ref then ' (anúncio: ' || coalesce(nullif(p_referral ->> 'headline', ''), p_referral ->> 'source_id', 'clique para o WhatsApp') || ')' else '' end
             || '.';
    v_lead := public.integ_srv_inserir_lead(n.empresa_id, coalesce(nullif(btrim(p_nome), ''), 'Contato WhatsApp'), p_contato,
                                            null, 0, 'Novo lead', v_origem, v_obs, null,
                                            public.integ_srv_responsavel(n.empresa_id, n.dono_id, '{}'::uuid[], 'wa:' || p_numero), 'whatsapp');
    v_novo := true;
    select l.nome, l.etapa, l.responsavel_id::text into v_nome, v_etapa, v_resp from public.leads l where l.id::text = v_lead;
  end if;

  insert into public.wa_mensagens (empresa_id, lead_id, phone_number_id, contato, contato_nome, wa_id, direcao, tipo,
                                   conteudo, midia_id, status, criado_em)
  values (n.empresa_id, v_lead, p_numero, p_contato, p_nome, p_wa_id, 'entrada', coalesce(nullif(p_tipo, ''), 'texto'),
          left(p_conteudo, 4000), p_midia, 'recebida',
          -- hora de chegada (o WhatsApp só manda segundos); aviso atrasado mantém a hora original
          case when p_em is not null and p_em < clock_timestamp() - interval '2 minutes' then p_em else clock_timestamp() end)
  on conflict (wa_id) do nothing
  returning id into v_msg;
  if v_msg is null then return jsonb_build_object('ok', true, 'duplicada', true); end if;

  return jsonb_build_object('ok', true, 'duplicada', false, 'mensagem_id', v_msg, 'empresa_id', n.empresa_id,
                            'lead_id', v_lead, 'lead_nome', v_nome, 'etapa', v_etapa, 'responsavel_id', v_resp,
                            'novo_lead', v_novo, 'dono_id', n.dono_id);
end $$;

-- Status de entrega (só avança: enviada → entregue → lida; falha vale sempre)
create or replace function public.integ_srv_wa_status(p_wa_id text, p_status text, p_erro text) returns void
language sql security definer set search_path = public as $$
  update public.wa_mensagens
     set status = p_status, erro = coalesce(p_erro, erro)
   where wa_id = p_wa_id and direcao = 'saida'
     and (p_status = 'falhou'
          or (case status when 'pendente' then 0 when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3
                          when 'falhou' then 9 else 0 end)
             < (case p_status when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 0 end))
$$;

-- Primeiro contato feito (pela IA ou por alguém): "Novo lead" → "Primeiro contato"
create or replace function public.integ_srv_lead_contatado(p_lead text, p_quem text) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp text; v_nome text; v_resp text;
begin
  select l.empresa_id::text, l.nome, l.responsavel_id::text into v_emp, v_nome, v_resp
    from public.leads l where l.id::text = p_lead and l.etapa = 'Novo lead';
  if v_emp is null then return; end if;
  perform set_config('crm.trusted', 'on', true);
  update public.leads set etapa = 'Primeiro contato', updated_at = now() where id::text = p_lead and etapa = 'Novo lead';
  perform set_config('crm.trusted', '', true);
  perform public.integ_srv_atividade(v_emp, v_resp, 'ti-arrows-right-left',
    coalesce(v_nome, 'Lead') || ': Novo lead → Primeiro contato (' || coalesce(p_quem, 'WhatsApp') || ')');
end $$;

-- Soma o uso da IA na conversa
create or replace function public.integ_srv_ia_uso(p_conversa uuid, p_entrada integer, p_saida integer, p_custo numeric) returns void
language sql security definer set search_path = public as $$
  update public.ia_conversas
     set mensagens_ia = mensagens_ia + 1, tokens_entrada = tokens_entrada + coalesce(p_entrada, 0),
         tokens_saida = tokens_saida + coalesce(p_saida, 0), custo_usd = custo_usd + coalesce(p_custo, 0),
         atualizado_em = now()
   where id = p_conversa
$$;

-- Pega tarefas vencidas da fila sem que duas execuções peguem a mesma
create or replace function public.integ_srv_fila_pegar(p_limite integer) returns setof public.ia_fila
language sql security definer set search_path = public as $$
  update public.ia_fila set status = 'pendente'
   where status = 'processando' and pego_em < now() - interval '15 minutes';
  update public.ia_fila f set status = 'processando', tentativas = f.tentativas + 1, pego_em = now()
   where f.id in (select q.id from public.ia_fila q
                   where q.status = 'pendente' and q.executar_em <= now()
                   order by q.executar_em limit greatest(coalesce(p_limite, 10), 1)
                   for update skip locked)
  returning f.*;
$$;

-- Evita rodar a mesma tarefa periódica mais de uma vez dentro do intervalo
create or replace function public.integ_srv_cron_pode(p_chave text, p_segundos integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  insert into public.integ_cron (chave, ultimo) values (p_chave, now())
  on conflict (chave) do update set ultimo = now()
   where public.integ_cron.ultimo < now() - make_interval(secs => p_segundos)
  returning true into v;
  return coalesce(v, false);
end $$;

-- Limpeza: avisos da Meta com mais de 30 dias e fila antiga
create or replace function public.integ_srv_limpeza() returns void
language sql security definer set search_path = public as $$
  delete from public.integ_eventos where recebido_em < now() - interval '30 days';
  delete from public.ia_fila where status in ('feito', 'cancelado', 'erro') and criado_em < now() - interval '90 days';
$$;

-- ─── 6. Pós-venda automático ────────────────────────────────────────────────
-- Lead fechado → entra na fila da IA de pós-venda (se ela estiver ligada).
-- Lead que sai de "Fechado" → tarefa pendente cancelada. Nunca bloqueia o CRM.
create or replace function public.integ_tg_leads_pos_venda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ativo boolean; v_cfg jsonb; v_horas numeric;
begin
  begin
    if new.etapa = 'Fechado / Convertido' and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
      select r.ativo, r.config into v_ativo, v_cfg from public.ia_roteiros r
       where r.empresa_id = new.empresa_id::text and r.tipo = 'pos_venda';
      if coalesce(v_ativo, false) then
        v_horas := case when coalesce(v_cfg ->> 'atraso_horas', '') ~ '^\d+(\.\d+)?$'
                        then least((v_cfg ->> 'atraso_horas')::numeric, 24 * 60) else 24 end;
        insert into public.ia_fila (empresa_id, lead_id, tipo, executar_em)
        values (new.empresa_id::text, new.id::text, 'pos_venda', now() + make_interval(mins => (v_horas * 60)::integer))
        on conflict (lead_id, tipo) where status in ('pendente', 'processando') do nothing;
      end if;
    elsif tg_op = 'UPDATE' and old.etapa = 'Fechado / Convertido' and new.etapa is distinct from old.etapa then
      update public.ia_fila set status = 'cancelado', erro = 'O lead saiu de Fechado / Convertido'
       where lead_id = new.id::text and tipo = 'pos_venda' and status = 'pendente';
    end if;
  exception when others then
    raise warning 'integ_tg_leads_pos_venda: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists integ_leads_pos_venda on public.leads;
create trigger integ_leads_pos_venda after insert or update of etapa on public.leads
  for each row execute function public.integ_tg_leads_pos_venda();

-- ─── 7. Quem pode executar o quê ────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname like 'integ\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
    if r.proname like 'integ\_srv\_%' then
      execute format('grant execute on function %s to service_role', r.f);
    elsif r.proname in ('integ_status', 'integ_wa_conversas', 'integ_tem_perm') then
      execute format('grant execute on function %s to authenticated', r.f);
    end if;
  end loop;
end $$;

-- Tempo real: mensagens, conversas da IA e disparos aparecem na hora no CRM
-- (as regras de acesso acima valem também aqui)
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['wa_mensagens', 'ia_conversas', 'wa_disparos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then null;
      end;
    end if;
  end loop;
end $$;

-- ─── 8. Agenda da fila (pós-venda) a cada 10 minutos ─────────────────────────
-- Usa pg_cron + pg_net. Se não der para ativar aqui, a fila também anda sozinha
-- sempre que chega uma mensagem do WhatsApp ou um lead do Meta.
do $$
declare v_ok text := 'ativado (a cada 10 minutos)';
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute 'create extension if not exists pg_net with schema extensions';
    perform cron.schedule('evolux-integracoes-fila', '*/10 * * * *',
      $cron$ select net.http_post(
               url := 'https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/crm-integracoes?tarefa=fila',
               headers := '{"Content-Type": "application/json"}'::jsonb,
               body := '{}'::jsonb) $cron$);
  exception when others then
    v_ok := 'não ativado (' || sqlerrm || '). Ative pg_cron e pg_net em Database → Extensions e rode de novo.';
  end;
  insert into public.integ_instalacao (item, valor) values ('Agenda do pós-venda', v_ok);
end $$;

insert into public.integ_instalacao (item, valor)
select 'Tabelas das integrações', count(*)::text || ' de 12'
  from pg_tables where schemaname = 'public'
   and tablename in ('integ_meta', 'integ_meta_paginas', 'integ_wa_numeros', 'wa_mensagens', 'wa_disparos', 'ia_roteiros',
                     'ia_conversas', 'ia_fila', 'integ_eventos', 'integ_cron', 'integ_rodizio', 'integ_instalacao');
insert into public.integ_instalacao (item, valor)
select 'Funções das integrações', count(*)::text from pg_proc
 where pronamespace = 'public'::regnamespace and proname like 'integ\_%';

commit;

-- Relatório
select item as "Resultado", valor as "Valor" from public.integ_instalacao order by ordem;
