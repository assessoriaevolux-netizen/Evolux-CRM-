-- ════════════════════════════════════════════════════════════════════════════
-- EVOLUX CRM — Projeto Indicador (29/10/2026)
--
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Precisa do arquivo 2026-10-22-seguranca-e-consistencia.sql já instalado.
-- Roda numa transação única e pode ser rodado de novo sem problema.
--
-- O que faz:
--  1. Tabela de indicadores (clientes que recebem um link único) e de
--     indicações (amigos que o cliente preencheu no link).
--  2. Cada pessoa só vê os indicadores dos clientes que ela atende (mesma regra
--     dos leads); o gestor vê todos da empresa.
--  3. A página pública /indicar só consegue: ler o primeiro nome do cliente e o
--     nome da empresa, e enviar até 5 amigos. Nada mais fica exposto.
--  4. Cada amigo indicado vira um lead "Novo lead" com origem "Indicação" no
--     funil do responsável pelo cliente, com aviso nas notificações.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Tabelas ─────────────────────────────────────────────────────────────
create table if not exists public.ind_indicadores (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     text not null,
  token          text not null unique,
  nome           text not null,
  telefone       text,
  lead_id        text,                       -- o cliente no CRM (quando existe)
  responsavel_id uuid,                       -- quem atende o cliente: recebe os indicados
  ativo          boolean not null default true,
  limite         integer not null default 5,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  ultimo_envio   timestamptz
);
create index if not exists ind_idx_indicadores_emp on public.ind_indicadores (empresa_id, criado_em desc);
create index if not exists ind_idx_indicadores_resp on public.ind_indicadores (responsavel_id);
create index if not exists ind_idx_indicadores_tel on public.ind_indicadores (empresa_id, (public.crm_chave_tel(telefone)));

create table if not exists public.ind_indicacoes (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          text not null,
  indicador_id        uuid not null references public.ind_indicadores (id) on delete cascade,
  lead_id             text,
  nome                text not null,
  telefone            text,
  interesse           text,
  situacao            text not null default 'novo' check (situacao in ('novo', 'ja_cadastrado')),
  recompensa          text,
  recompensa_valor    numeric,
  recompensa_paga_em  timestamptz,
  recompensa_paga_por uuid,
  criado_em           timestamptz not null default now()
);
create index if not exists ind_idx_indicacoes_ind on public.ind_indicacoes (indicador_id);
create index if not exists ind_idx_indicacoes_emp on public.ind_indicacoes (empresa_id, criado_em desc);

-- ─── 2. Regras de acesso: só leitura pela API; toda escrita passa pelas funções
alter table public.ind_indicadores enable row level security;
alter table public.ind_indicacoes enable row level security;
revoke all on public.ind_indicadores from anon, authenticated;
revoke all on public.ind_indicacoes from anon, authenticated;
grant select on public.ind_indicadores to authenticated;
grant select on public.ind_indicacoes to authenticated;

drop policy if exists ind_indicadores_ver on public.ind_indicadores;
create policy ind_indicadores_ver on public.ind_indicadores for select to authenticated
  using ((select public.crm_plataforma())
         or (empresa_id = (select public.crm_empresa())
             and ((select public.crm_gestor())
                  or responsavel_id::text = any ((select public.crm_visiveis())::text[]))));

drop policy if exists ind_indicacoes_ver on public.ind_indicacoes;
create policy ind_indicacoes_ver on public.ind_indicacoes for select to authenticated
  using (exists (select 1 from public.ind_indicadores i where i.id = ind_indicacoes.indicador_id));

-- ─── 3. Funções auxiliares ──────────────────────────────────────────────────
-- Código do link: 12 letras/números sem caracteres que confundem (0/o, 1/l)
create or replace function public.ind_novo_token() returns text
language plpgsql volatile set search_path = public as $$
declare a text := 'abcdefghijkmnpqrstuvwxyz23456789'; t text; b bytea;
begin
  loop
    -- 2 UUIDs aleatórios = 32 bytes; usa os bytes que não carregam a versão do UUID
    b := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
    t := '';
    for i in 0..11 loop t := t || substr(a, (get_byte(b, case when i < 6 then i else i + 4 end) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.ind_indicadores where token = t);
  end loop;
  return t;
end $$;

-- O CRM pode ver/alterar este indicador?
create or replace function public.ind_pode(p_ind public.ind_indicadores) returns boolean
language sql stable security definer set search_path = public as $$
  select p_ind.empresa_id = public.crm_empresa()
     and (public.crm_gestor() or p_ind.responsavel_id::text = any (public.crm_visiveis()))
$$;

-- Primeiro gestor ativo da empresa (para quando o responsável saiu)
create or replace function public.ind_gestor_da_empresa(p_emp text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where p.empresa_id::text = p_emp and coalesce(p.ativo, true) and public.crm_nivel_role(p.role) = 1
   order by lower(coalesce(p.nome, '')), p.id limit 1
$$;

-- Interesse escolhido no link → tipo de bem do funil
create or replace function public.ind_tipo_do_interesse(p text) returns text
language sql immutable as $$
  select case lower(coalesce(p, ''))
    when 'carro' then 'Automóvel' when 'caminhão' then 'Automóvel' when 'caminhao' then 'Automóvel'
    when 'moto' then 'Moto'
    when 'imóvel' then 'Imóvel' when 'imovel' then 'Imóvel' when 'reforma' then 'Imóvel' when 'investir' then 'Imóvel'
    else 'Serviço' end
$$;

-- ─── 4. Funções usadas pelo CRM (pessoa logada) ─────────────────────────────
-- Cadastra um ou vários indicadores. p_itens: [{nome, telefone, lead_id, responsavel_id}]
-- Se o telefone já é de um indicador da empresa, devolve o que já existe (não duplica).
create or replace function public.ind_criar(p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp text := public.crm_empresa(); v_gestor boolean := public.crm_gestor(); v_vis text[] := public.crm_visiveis();
        it jsonb; v_nome text; v_tel text; v_chave text; v_resp uuid; v_lead text; v_lead_resp text; v_achou boolean;
        v_row public.ind_indicadores; v_out jsonb := '[]'::jsonb;
begin
  if v_emp is null or auth.uid() is null then raise exception 'Sem acesso.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then return v_out; end if;
  if jsonb_array_length(p_itens) > 1000 then raise exception 'Máximo de 1000 clientes por vez.'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    v_nome := left(btrim(coalesce(it ->> 'nome', '')), 120);
    if v_nome = '' then continue; end if;
    v_tel := public.crm_tel_normalizado(nullif(btrim(coalesce(it ->> 'telefone', '')), ''));
    v_chave := public.crm_chave_tel(v_tel);
    v_lead := nullif(it ->> 'lead_id', '');
    v_resp := nullif(it ->> 'responsavel_id', '')::uuid;

    -- Cliente do CRM: precisa ser um lead que a pessoa enxerga; o responsável vem dele
    if v_lead is not null then
      v_achou := false; v_lead_resp := null;
      execute format('select true, responsavel_id::text from public.leads where id::text = %L and empresa_id::text = %L', v_lead, v_emp)
        into v_achou, v_lead_resp;
      if not coalesce(v_achou, false) then raise exception 'Cliente não encontrado.'; end if;
      if not v_gestor and not coalesce(v_lead_resp = any (v_vis), false) then raise exception 'Você não atende este cliente.'; end if;
      if v_resp is null then v_resp := v_lead_resp::uuid; end if;
    end if;
    if v_resp is null then v_resp := auth.uid(); end if;
    if not v_gestor and not (v_resp::text = any (v_vis)) then v_resp := auth.uid(); end if;
    if not public.crm_membro_ativo(v_resp::text, v_emp) then v_resp := auth.uid(); end if;

    v_row := null;
    if v_chave is not null then
      select * into v_row from public.ind_indicadores
       where empresa_id = v_emp and public.crm_chave_tel(telefone) = v_chave limit 1;
    end if;
    if v_row.id is null and v_lead is not null then
      select * into v_row from public.ind_indicadores where empresa_id = v_emp and lead_id = v_lead limit 1;
    end if;
    if v_row.id is not null then
      v_out := v_out || jsonb_build_object('id', v_row.id, 'token', v_row.token, 'nome', v_row.nome, 'novo', false);
      continue;
    end if;

    insert into public.ind_indicadores (empresa_id, token, nome, telefone, lead_id, responsavel_id, criado_por)
    values (v_emp, public.ind_novo_token(), v_nome, v_tel, v_lead, v_resp, auth.uid())
    returning * into v_row;
    v_out := v_out || jsonb_build_object('id', v_row.id, 'token', v_row.token, 'nome', v_row.nome, 'novo', true);
  end loop;
  return v_out;
end $$;

-- Pausa/reativa o link, troca o responsável ou o limite
create or replace function public.ind_editar(p_id uuid, p_ativo boolean, p_responsavel uuid, p_limite integer) returns void
language plpgsql security definer set search_path = public as $$
declare r public.ind_indicadores;
begin
  select * into r from public.ind_indicadores where id = p_id;
  if not found or not public.ind_pode(r) then raise exception 'Indicador não encontrado.'; end if;
  if p_responsavel is not null and p_responsavel is distinct from r.responsavel_id then
    if not (public.crm_gestor() or p_responsavel::text = any (public.crm_visiveis()))
       or not public.crm_membro_ativo(p_responsavel::text, r.empresa_id) then
      raise exception 'Responsável inválido.';
    end if;
  end if;
  if p_limite is not null and not public.crm_gestor() then raise exception 'Só o gestor muda o limite.'; end if;
  update public.ind_indicadores
     set ativo = coalesce(p_ativo, ativo),
         responsavel_id = coalesce(p_responsavel, responsavel_id),
         limite = least(greatest(coalesce(p_limite, limite), 1), 50)
   where id = p_id;
end $$;

-- Remove o indicador e o histórico de indicações (os leads continuam no funil)
create or replace function public.ind_excluir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.ind_indicadores;
begin
  select * into r from public.ind_indicadores where id = p_id;
  if not found or not public.ind_pode(r) then raise exception 'Indicador não encontrado.'; end if;
  if not public.crm_gestor() then raise exception 'Só o gestor remove indicadores.'; end if;
  delete from public.ind_indicadores where id = p_id;
end $$;

-- Registra a recompensa de uma indicação que fechou (só o gestor)
create or replace function public.ind_recompensa(p_id uuid, p_recompensa text, p_valor numeric, p_paga boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp text;
begin
  if not public.crm_gestor() then raise exception 'Só o gestor registra recompensas.'; end if;
  select empresa_id into v_emp from public.ind_indicacoes where id = p_id;
  if v_emp is null or v_emp <> public.crm_empresa() then raise exception 'Indicação não encontrada.'; end if;
  update public.ind_indicacoes
     set recompensa = nullif(left(btrim(coalesce(p_recompensa, '')), 80), ''),
         recompensa_valor = case when p_valor is null then null else greatest(p_valor, 0) end,
         recompensa_paga_em = case when p_paga then coalesce(recompensa_paga_em, now()) else null end,
         recompensa_paga_por = case when p_paga then coalesce(recompensa_paga_por, auth.uid()) else null end
   where id = p_id;
end $$;

-- ─── 5. Funções da página pública /indicar (sem login) ──────────────────────
-- Só o primeiro nome do cliente, o nome/logo da empresa e quantas vagas restam
create or replace function public.ind_publico_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.ind_indicadores; v_emp_nome text; v_logo text; v_emp_ativo boolean; v_usados integer;
begin
  if p_token is null or p_token !~ '^[a-z0-9]{8,24}$' then return jsonb_build_object('ok', false); end if;
  select * into r from public.ind_indicadores where token = p_token;
  if not found or not r.ativo then return jsonb_build_object('ok', false); end if;
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

-- Recebe os amigos: [{nome, telefone, interesse}] — cria os leads no funil
create or replace function public.ind_publico_enviar(p_token text, p_amigos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ind_indicadores; v_emp_ativo boolean; v_usados integer; v_resp uuid; v_resp_nome text;
        a jsonb; v_nome text; v_tel text; v_chave text; v_int text; v_lead text; v_lead_resp text;
        v_vistos text[] := array[]::text[]; v_novos integer := 0; v_repetidos integer := 0; v_obs text;
begin
  if p_token is null or p_token !~ '^[a-z0-9]{8,24}$' then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;
  select * into r from public.ind_indicadores where token = p_token for update;
  if not found or not r.ativo then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;
  execute format('select coalesce(ativo, true) from public.empresas where id::text = %L', r.empresa_id) into v_emp_ativo;
  if not coalesce(v_emp_ativo, false) then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;
  if jsonb_typeof(p_amigos) <> 'array' then return jsonb_build_object('ok', false, 'motivo', 'dados'); end if;

  select count(*) into v_usados from public.ind_indicacoes where indicador_id = r.id;
  if v_usados >= r.limite then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;

  -- Quem recebe: o responsável pelo cliente; se saiu da empresa, o gestor
  v_resp := r.responsavel_id;
  if v_resp is null or not public.crm_membro_ativo(v_resp::text, r.empresa_id) then
    v_resp := public.ind_gestor_da_empresa(r.empresa_id);
  end if;
  select nome into v_resp_nome from public.profiles where id = v_resp;

  perform set_config('crm.trusted', 'on', true);
  for a in select * from jsonb_array_elements(p_amigos) loop
    exit when v_usados >= r.limite;
    v_nome := left(btrim(regexp_replace(coalesce(a ->> 'nome', ''), '\s+', ' ', 'g')), 80);
    v_tel := regexp_replace(coalesce(a ->> 'telefone', ''), '\D', '', 'g');
    if length(v_tel) >= 12 and left(v_tel, 2) = '55' then v_tel := substr(v_tel, 3); end if;
    if length(v_nome) < 2 or length(v_tel) not in (10, 11) then continue; end if;
    v_tel := public.crm_tel_normalizado(v_tel);
    v_chave := public.crm_chave_tel(v_tel);
    if v_chave = any (v_vistos) or v_chave = public.crm_chave_tel(r.telefone) then continue; end if;
    v_vistos := v_vistos || v_chave;
    -- já indicado por este mesmo cliente
    if exists (select 1 from public.ind_indicacoes i where i.indicador_id = r.id and public.crm_chave_tel(i.telefone) = v_chave) then
      continue;
    end if;
    v_int := left(coalesce(nullif(btrim(a ->> 'interesse'), ''), 'Outro'), 30);

    -- Já existe lead com esse telefone na empresa? Não duplica: registra e avisa.
    v_lead := null; v_lead_resp := null;
    execute format('select id::text, responsavel_id::text from public.leads
                     where empresa_id::text = %L and public.crm_chave_tel(telefone) = %L
                     order by created_at desc nulls last limit 1', r.empresa_id, v_chave)
      into v_lead, v_lead_resp;
    if v_lead is not null then
      insert into public.ind_indicacoes (empresa_id, indicador_id, lead_id, nome, telefone, interesse, situacao)
      values (r.empresa_id, r.id, v_lead, v_nome, v_tel, v_int, 'ja_cadastrado');
      execute format('insert into public.atividades (empresa_id, user_id, icon, text) values (%L, %L, %L, %L)',
        r.empresa_id, coalesce(v_lead_resp, v_resp::text), 'ti-users-plus',
        left(r.nome || ' indicou ' || v_nome || ', que já está no CRM', 500));
      v_repetidos := v_repetidos + 1; v_usados := v_usados + 1;
      continue;
    end if;

    v_obs := 'Indicado por ' || r.nome || coalesce(' (' || r.telefone || ')', '') || ' — quer: ' || v_int || '.';
    execute format(
      'insert into public.leads (empresa_id, responsavel_id, nome, telefone, tipo, credito, etapa, origem, obs,
                                 data_criacao, atendimento, updated_at)
       values (%L, %L, %L, %L, %L, 0, %L, %L, %L, %L, %L, now()) returning id::text',
      r.empresa_id, v_resp, v_nome, v_tel, public.ind_tipo_do_interesse(v_int), 'Novo lead', 'Indicação', v_obs,
      public.crm_hoje(), 'aguardando')
      into v_lead;
    insert into public.ind_indicacoes (empresa_id, indicador_id, lead_id, nome, telefone, interesse, situacao)
    values (r.empresa_id, r.id, v_lead, v_nome, v_tel, v_int, 'novo');
    if v_resp is not null then
      execute format('insert into public.atividades (empresa_id, user_id, icon, text) values (%L, %L, %L, %L)',
        r.empresa_id, v_resp::text, 'ti-users-plus',
        left('Nova indicação de ' || r.nome || ': ' || v_nome || ' (' || v_int || ')' || coalesce(' → ' || v_resp_nome, ''), 500));
    end if;
    v_novos := v_novos + 1; v_usados := v_usados + 1;
  end loop;
  perform set_config('crm.trusted', '', true);

  if v_novos + v_repetidos > 0 then
    update public.ind_indicadores set ultimo_envio = now() where id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'recebidos', v_novos + v_repetidos, 'restantes', greatest(r.limite - v_usados, 0));
end $$;

-- ─── 6. Permissões das funções ──────────────────────────────────────────────
revoke all on function public.ind_novo_token() from public, anon, authenticated;
revoke all on function public.ind_pode(public.ind_indicadores) from public, anon, authenticated;
revoke all on function public.ind_gestor_da_empresa(text) from public, anon, authenticated;
revoke all on function public.ind_tipo_do_interesse(text) from public, anon;
revoke all on function public.ind_criar(jsonb) from public, anon;
revoke all on function public.ind_editar(uuid, boolean, uuid, integer) from public, anon;
revoke all on function public.ind_excluir(uuid) from public, anon;
revoke all on function public.ind_recompensa(uuid, text, numeric, boolean) from public, anon;
revoke all on function public.ind_publico_info(text) from public;
revoke all on function public.ind_publico_enviar(text, jsonb) from public;
grant execute on function public.ind_criar(jsonb) to authenticated;
grant execute on function public.ind_editar(uuid, boolean, uuid, integer) to authenticated;
grant execute on function public.ind_excluir(uuid) to authenticated;
grant execute on function public.ind_recompensa(uuid, text, numeric, boolean) to authenticated;
grant execute on function public.ind_publico_info(text) to anon, authenticated;
grant execute on function public.ind_publico_enviar(text, jsonb) to anon, authenticated;

-- Tempo real: a aba atualiza sozinha quando chega indicação
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['ind_indicadores', 'ind_indicacoes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      begin execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then null; end;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

select 'Projeto Indicador instalado' as resultado,
       (select count(*) from public.ind_indicadores) as indicadores,
       (select count(*) from public.ind_indicacoes) as indicacoes;
