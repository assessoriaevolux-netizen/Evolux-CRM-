-- Permite que o consultor edite a mensagem do SMS antes de agendar.
-- Adiciona o parâmetro p_mensagem (opcional) ao sim_token_criar.
-- Se não informado, usa o texto padrão de antes.

-- Primeiro, remover grants da versão antiga (5 params)
revoke all on function public.sim_token_criar(text, text, numeric, text, integer) from public, anon, authenticated;
drop function if exists public.sim_token_criar(text, text, numeric, text, integer);

create or replace function public.sim_token_criar(
  p_nome text,
  p_telefone text,
  p_valor numeric,
  p_lead_id text default null,
  p_atraso_seg integer default 0,
  p_mensagem text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
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

  -- telefone
  if length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
  if length(v_tel) not in (12, 13) or left(v_tel, 2) <> '55' then
    raise exception 'Celular inválido. Use DDD + número (ex.: 11 98765-4321).';
  end if;
  if length(v_tel) = 12 or substr(v_tel, 5, 1) <> '9' then
    raise exception 'O token vai por SMS: informe um número de CELULAR (com o 9 na frente).';
  end if;
  if length(v_nome) < 2 then raise exception 'Informe o nome do cliente.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor da carta de crédito.'; end if;

  -- lead
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

  -- limites
  if (select count(*) from public.sim_tokens where criado_por = auth.uid() and criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'Limite de 30 tokens por hora atingido. Tente mais tarde.';
  end if;
  if (select count(*) from public.sim_tokens where empresa_id = v_emp and telefone = v_tel
        and criado_em > now() - interval '24 hours' and status <> 'cancelado') >= 5 then
    raise exception 'Este celular já recebeu 5 tokens nas últimas 24 horas.';
  end if;

  -- código de 6 dígitos
  v_cod := lpad((((get_byte(v_b, 0)::bigint << 16) | (get_byte(v_b, 1)::bigint << 8) | get_byte(v_b, 2)) % 1000000)::text, 6, '0');

  -- mensagem: customizada ou padrão
  v_primeiro := split_part(v_nome, ' ', 1);
  v_primeiro := upper(left(v_primeiro, 1)) || lower(substr(v_primeiro, 2));

  if p_mensagem is not null and btrim(p_mensagem) <> '' then
    v_msg := btrim(p_mensagem);
    -- garantir que tem o placeholder do código
    if position('{codigo}' in v_msg) = 0 then
      v_msg := v_msg || ' Token: {codigo}';
    end if;
  else
    v_msg := 'Olá ' || v_primeiro || ', sua proposta de carta de crédito de ' || public.sms_valor_txt(p_valor)
             || ' foi registrada no seu nome. Token para dar continuidade à sua proposta: {codigo}';
  end if;

  -- limitar tamanho (765 chars = limite do SMSFire)
  if length(v_msg) > 765 then
    raise exception 'A mensagem ultrapassa 765 caracteres. Reduza o texto.';
  end if;

  v_quando := now() + make_interval(secs => least(greatest(coalesce(p_atraso_seg, 0), 0), 1800));

  insert into public.sim_tokens (id, empresa_id, criado_por, lead_id, nome, telefone, valor,
                                  mensagem, codigo, codigo_hash, status, enviar_em)
  values (v_id, v_emp, auth.uid(),
          case when p_lead_id is not null then p_lead_id::uuid end,
          v_nome, v_tel, p_valor,
          v_msg, v_cod, encode(digest(v_cod, 'sha256'), 'hex'),
          'agendado', v_quando);

  return jsonb_build_object('id', v_id, 'enviar_em', v_quando);
end;
$$;

-- grants
revoke all on function public.sim_token_criar(text, text, numeric, text, integer, text) from public, anon;
grant execute on function public.sim_token_criar(text, text, numeric, text, integer, text) to authenticated;

raise notice 'sim_token_criar atualizado — mensagem editável ok';
