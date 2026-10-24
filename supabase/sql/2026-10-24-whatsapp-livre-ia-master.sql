-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — WhatsApp liberado para todos e IA só no plano Master
-- Rodar DEPOIS de 2026-10-23-integracoes-meta-whatsapp-ia.sql (pode rodar mais de uma vez).
--
-- • WhatsApp: qualquer pessoa ativa da empresa vê as conversas dos leads que já
--   enxerga no CRM, envia mensagens e faz disparo em massa. O custo dos modelos é
--   cobrado pela Meta na conta do WhatsApp Business da própria empresa.
-- • IA de atendimento: só empresas com plano = 'master'. Quem muda o plano é o
--   administrador da plataforma (painel Empresas); o gestor não consegue alterar.
-- ════════════════════════════════════════════════════════════════════════════

-- A empresa tem a IA liberada?
create or replace function public.integ_ia_liberada(p_emp text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select lower(coalesce(e.plano, '')) = 'master' and coalesce(e.ativo, true)
                     from public.empresas e where e.id::text = p_emp), false)
$$;
revoke all on function public.integ_ia_liberada(text) from public, anon;
revoke all on function public.integ_ia_liberada(text) from authenticated;
grant execute on function public.integ_ia_liberada(text) to service_role;

-- Permissões das integrações
create or replace function public.integ_tem_perm_de(p_user uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_perms jsonb; v_emp text;
begin
  if p_user is null then return false; end if;
  v_emp := public.crm_empresa_de(p_user);
  -- IA: só no plano Master (vale até para o gestor)
  if p_perm in ('ia_view', 'ia_manage') and not public.integ_ia_liberada(v_emp) then return false; end if;
  -- WhatsApp: liberado para todo mundo da empresa
  if p_perm in ('whatsapp_view', 'whatsapp_send', 'whatsapp_bulk') then return v_emp is not null; end if;
  if public.crm_gestor_de(p_user) then return true; end if;
  if p_perm not in ('anuncios_view', 'ia_view', 'ia_manage') then
    return coalesce(public.crm_tem_perm_de(p_user, p_perm), false);
  end if;
  if v_emp is null then return false; end if;
  select public.crm_jsonb(h.perms::text) into v_perms
    from public.profiles p join public.hierarquias h on h.id::text = p.hierarquia_id::text
   where p.id = p_user;
  if v_perms is not null and v_perms ? p_perm then
    return coalesce(v_perms ->> p_perm = 'true', false);
  end if;
  if p_perm = 'ia_view' then return true; end if; -- padrão: todos da empresa Master veem as conversas da IA
  return false;
end $$;

-- Mensagens: cada pessoa vê as conversas dos leads que ela enxerga no CRM
drop policy if exists integ_wa_msg_ver on public.wa_mensagens;
create policy integ_wa_msg_ver on public.wa_mensagens for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or (lead_id is not null
                      and exists (select 1 from public.leads l where l.id::text = wa_mensagens.lead_id)))));

-- Situação da IA no chat (quem está atendendo) acompanha a conversa
drop policy if exists integ_ia_conv_ver on public.ia_conversas;
create policy integ_ia_conv_ver on public.ia_conversas for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or exists (select 1 from public.leads l where l.id::text = ia_conversas.lead_id))));

-- Contexto usado pelo servidor: inclui se a IA está liberada
create or replace function public.integ_srv_contexto(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp text := public.crm_empresa_de(p_user); v jsonb;
begin
  select jsonb_build_object(
    'user_id', p.id, 'nome', p.nome, 'email', p.email, 'role', lower(coalesce(p.role, 'vendedor')),
    'empresa_id', v_emp, 'empresa_nome', e.nome,
    'gestor', coalesce(public.crm_gestor_de(p.id), false),
    'plataforma', coalesce(public.crm_plataforma_de(p.id), false),
    'ia_liberada', public.integ_ia_liberada(v_emp),
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

-- Recarrega o cache da API do Supabase
notify pgrst, 'reload schema';
