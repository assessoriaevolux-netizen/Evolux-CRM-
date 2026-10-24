-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — Ativação automática do número e coexistência com o app WhatsApp Business
-- Rodar DEPOIS de 2026-10-24-whatsapp-livre-ia-master.sql (pode rodar mais de uma vez).
--
-- • Ao conectar, o servidor registra o número na Cloud API sozinho (PIN guardado só no servidor).
-- • Coexistência: o cliente conecta o WhatsApp Business do celular por QR code e continua usando
--   o app. O que ele mandar pelo celular também aparece na conversa do CRM.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.integ_wa_numeros add column if not exists pin text;              -- PIN de 6 dígitos do registro (só o servidor lê)
alter table public.integ_wa_numeros add column if not exists status_api text;       -- CONNECTED, PENDING, DISCONNECTED…
alter table public.integ_wa_numeros add column if not exists coexistencia boolean not null default false;
alter table public.integ_wa_numeros add column if not exists registro_erro text;
alter table public.integ_wa_numeros add column if not exists historico_pedido_em timestamptz;

-- Situação das integrações (agora com a situação de cada número)
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
                          'token_proprio', n.token is not null,
                          'status_api', n.status_api, 'coexistencia', coalesce(n.coexistencia, false),
                          'registro_erro', n.registro_erro)
                        order by n.padrao desc, n.numero)
                   from public.integ_wa_numeros n where n.empresa_id = v_emp), '[]'::jsonb),
    'ia', coalesce((
                 select jsonb_object_agg(i.tipo, jsonb_build_object('ativo', i.ativo, 'ultimo_erro', i.ultimo_erro,
                                                                    'ultimo_erro_em', i.ultimo_erro_em))
                   from public.ia_roteiros i where i.empresa_id = v_emp), '{}'::jsonb)
  ) into r;
  return r;
end $$;

-- Mensagem que veio do aplicativo do celular (eco) ou do histórico importado.
-- Só grava se o contato já é lead da empresa; não cria lead novo a partir de conversa pessoal.
create or replace function public.integ_srv_wa_app(p_numero text, p_contato text, p_wa_id text, p_direcao text,
  p_tipo text, p_conteudo text, p_midia text, p_em timestamptz, p_pausar_ia boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.integ_wa_numeros; v_chave text := public.crm_chave_tel(p_contato); v_lead text; v_msg uuid;
begin
  select * into n from public.integ_wa_numeros where phone_number_id = p_numero and ativo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'numero_desconhecido'); end if;
  if v_chave is null then return jsonb_build_object('ok', false, 'motivo', 'sem_telefone'); end if;
  select l.id::text into v_lead from public.leads l
   where l.empresa_id::text = n.empresa_id and public.crm_chave_tel(l.telefone) = v_chave
   order by l.created_at desc nulls last limit 1;
  if v_lead is null then return jsonb_build_object('ok', false, 'motivo', 'nao_e_lead'); end if;
  insert into public.wa_mensagens (empresa_id, lead_id, phone_number_id, contato, wa_id, direcao, tipo, conteudo, midia_id, status, criado_em)
  values (n.empresa_id, v_lead, p_numero, p_contato, p_wa_id,
          case when p_direcao = 'entrada' then 'entrada' else 'saida' end,
          coalesce(nullif(p_tipo, ''), 'texto'), left(p_conteudo, 4000), p_midia,
          case when p_direcao = 'entrada' then 'recebida' else 'enviada' end,
          coalesce(p_em, clock_timestamp()))
  on conflict (wa_id) do nothing
  returning id into v_msg;
  -- Respondeu pelo celular: a IA sai da conversa (até alguém devolver)
  if v_msg is not null and p_pausar_ia and p_direcao <> 'entrada' then
    update public.ia_conversas set status = 'humano', motivo = 'Respondido pelo WhatsApp do celular', atualizado_em = now()
     where empresa_id = n.empresa_id and lead_id = v_lead and status = 'ativa';
  end if;
  return jsonb_build_object('ok', true, 'gravada', v_msg is not null, 'lead_id', v_lead);
end $$;
revoke all on function public.integ_srv_wa_app(text, text, text, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.integ_srv_wa_app(text, text, text, text, text, text, text, timestamptz, boolean) to service_role;

notify pgrst, 'reload schema';
