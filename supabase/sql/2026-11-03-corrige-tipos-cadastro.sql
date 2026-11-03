-- ============================================================================
-- Corrige "sintaxe de entrada inválida para o tipo inteiro: '<uuid>'"
-- ao cadastrar usuário, mudar equipe ou salvar hierarquia.
--
-- Causa: colunas que guardam referências (hierarquia do usuário, membros da
-- equipe, supervisor/representante, superior do cargo) foram criadas como
-- número inteiro, mas os IDs do sistema são UUID. Este script converte essas
-- colunas para texto (aceita UUID e número). Vale para TODAS as empresas.
--
-- Pode rodar mais de uma vez sem problema.
-- ============================================================================

do $$
declare
  c record;
  fk record;
begin
  for c in
    select table_name::text as t, column_name::text as col, udt_name::text as udt
      from information_schema.columns
     where table_schema = 'public'
       and (table_name::text, column_name::text) in (
         ('profiles',    'hierarquia_id'),
         ('profiles',    'equipe_id'),
         ('equipes',     'membros_sb_ids'),
         ('equipes',     'supervisor_sb_id'),
         ('equipes',     'representante_sb_id'),
         ('equipes',     'gestor_sb_id'),
         ('hierarquias', 'superior_id')
       )
  loop
    if c.udt not in ('int2','int4','int8','numeric','_int2','_int4','_int8','_numeric') then
      continue; -- já é texto/uuid/json: nada a fazer
    end if;

    -- remove chaves estrangeiras presas a essa coluna (apontavam para ID numérico)
    for fk in
      select con.conname
        from pg_constraint con
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
       where con.contype = 'f'
         and con.conrelid = format('public.%I', c.t)::regclass
         and a.attname = c.col
    loop
      execute format('alter table public.%I drop constraint %I', c.t, fk.conname);
    end loop;

    begin
      execute format('alter table public.%I alter column %I drop default', c.t, c.col);
      if c.udt like '\_%' then
        execute format('alter table public.%I alter column %I type text[] using %I::text[]', c.t, c.col, c.col);
        execute format('alter table public.%I alter column %I set default ''{}''::text[]', c.t, c.col);
      else
        execute format('alter table public.%I alter column %I type text using %I::text', c.t, c.col, c.col);
      end if;
      raise notice 'Corrigido: %.% (% -> texto)', c.t, c.col, c.udt;
    exception when others then
      raise warning 'NÃO foi possível converter %.%: %', c.t, c.col, sqlerrm;
    end;
  end loop;
end $$;

-- Meta da empresa (painel) — caso ainda não tenha rodado
alter table public.empresas add column if not exists meta_empresa bigint default 0;

-- Recarrega o cache da API para enxergar os novos tipos
notify pgrst, 'reload schema';

-- Conferência: nenhuma linha abaixo deve aparecer como int2/int4/int8/_int4
select table_name, column_name, udt_name
  from information_schema.columns
 where table_schema = 'public'
   and (table_name::text, column_name::text) in (
     ('profiles','hierarquia_id'), ('profiles','equipe_id'),
     ('equipes','membros_sb_ids'), ('equipes','supervisor_sb_id'),
     ('equipes','representante_sb_id'), ('equipes','gestor_sb_id'),
     ('hierarquias','superior_id'), ('empresas','meta_empresa')
   )
 order by 1, 2;
