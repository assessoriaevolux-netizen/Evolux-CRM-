-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — Permissões gravadas em formato que o banco não lia (12/11/2026)
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez sem problema.
--
-- Problema: a tela grava as permissões do cargo como um texto. Quando a coluna
-- do banco guarda esse texto "embrulhado", a tela consegue ler (e mostra o
-- botão), mas o banco não lia e usava as permissões de fábrica do cargo — por
-- isso recusava com "sem permissão para excluir esta venda".
--
-- O que este arquivo faz:
-- 1. O banco passa a ler as permissões nos dois formatos.
-- 2. Regrava no formato certo os cargos que estavam embrulhados.
-- 3. No final mostra, pessoa por pessoa, o que o banco está liberando.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Leitura tolerante ───────────────────────────────────────────────────
create or replace function public.crm_jsonb(p text) returns jsonb
language plpgsql immutable as $$
declare j jsonb; t text; i integer := 0;
begin
  if p is null or btrim(p) in ('', 'null') then return null; end if;
  j := p::jsonb;
  -- texto com um JSON dentro ("{\"a\":true}") → abre até chegar no conteúdo
  while jsonb_typeof(j) = 'string' and i < 3 loop
    t := btrim(j #>> '{}');
    exit when left(t, 1) not in ('{', '[');
    begin
      j := t::jsonb;
    exception when others then exit;
    end;
    i := i + 1;
  end loop;
  return j;
exception when others then return null;
end $$;

-- Permissões de um cargo sempre como objeto (junta pedaços, se houver)
create or replace function public.crm_perms_obj(p text) returns jsonb
language plpgsql immutable as $$
declare j jsonb := public.crm_jsonb(p); r jsonb := '{}'::jsonb; e jsonb; x jsonb;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'object' then return j; end if;
  if jsonb_typeof(j) = 'array' then
    for e in select * from jsonb_array_elements(j) loop
      x := public.crm_perms_obj(e::text);
      if x is not null then r := r || x; end if;
    end loop;
    return r;
  end if;
  return null;
end $$;

-- ─── 2. Regrava os cargos que estavam em formato errado ─────────────────────
create temporary table if not exists _crm_perms_fix (qtd integer);
truncate _crm_perms_fix;
do $$
declare v_tipo text; v_qtd integer := 0;
begin
  select data_type into v_tipo from information_schema.columns
   where table_schema = 'public' and table_name = 'hierarquias' and column_name = 'perms';
  perform set_config('crm.trusted', 'on', true);
  if v_tipo in ('json', 'jsonb') then
    execute format($q$
      update public.hierarquias h set perms = public.crm_perms_obj(h.perms::text)::%s
       where h.perms is not null
         and jsonb_typeof(h.perms::jsonb) <> 'object'
         and public.crm_perms_obj(h.perms::text) is not null $q$, v_tipo);
  else
    update public.hierarquias h set perms = public.crm_perms_obj(h.perms::text)::text
     where h.perms is not null and btrim(h.perms::text) <> ''
       and left(btrim(h.perms::text), 1) <> '{'
       and public.crm_perms_obj(h.perms::text) is not null;
  end if;
  get diagnostics v_qtd = row_count;
  perform set_config('crm.trusted', '', true);
  insert into _crm_perms_fix values (v_qtd);
end $$;

-- Daqui para frente: o que a tela gravar embrulhado é desembrulhado na hora
create or replace function public.crm_tg_hierarquias_perms() returns trigger
language plpgsql as $$
declare v jsonb;
begin
  if new.perms is null then return new; end if;
  if pg_typeof(new.perms)::text in ('json', 'jsonb') then
    if jsonb_typeof(to_jsonb(new) -> 'perms') <> 'object' then
      v := public.crm_perms_obj((to_jsonb(new) -> 'perms')::text);
      if v is not null then new := jsonb_populate_record(new, jsonb_build_object('perms', v)); end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists aa_crm_hierarquias_perms on public.hierarquias;
create trigger aa_crm_hierarquias_perms before insert or update on public.hierarquias
  for each row execute function public.crm_tg_hierarquias_perms();

notify pgrst, 'reload schema';

-- ─── 3. Conferência: o que o banco libera para cada pessoa ──────────────────
select e.nome as empresa, p.nome as pessoa, h.nome as cargo,
       public.crm_tem_perm_de(p.id, 'vendas_edit')   as edita_vendas,
       public.crm_tem_perm_de(p.id, 'vendas_delete') as exclui_vendas,
       public.crm_tem_perm_de(p.id, 'leads_delete')  as exclui_leads,
       coalesce(array_length(public.crm_visiveis_de(p.id), 1), 0) as pessoas_que_enxerga,
       (select qtd from _crm_perms_fix limit 1) as cargos_corrigidos
  from public.profiles p
  join public.empresas e on e.id::text = p.empresa_id::text
  left join public.hierarquias h on h.id::text = public.crm_hierarquia_de(p.id)
 where coalesce(p.ativo, true)
 order by (e.nome ilike '%invest%') desc, e.nome, public.crm_nivel_de(p.id), p.nome;
