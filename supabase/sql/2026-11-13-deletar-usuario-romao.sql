-- =============================================================
-- DELETAR USUÁRIO: Romaoconsorcioseinvestimentos@gmail.com
-- Para que ele possa criar uma conta nova como gestor
-- Rode no SQL Editor do Supabase
-- =============================================================

do $$
declare
  v_uid   uuid;
  v_email text := 'Romaoconsorcioseinvestimentos@gmail.com';
  v_emp   text;
  v_nome  text;
  v_leads int := 0;
begin
  -- 1. Encontrar o usuário
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Usuário com email % não encontrado no auth.users', v_email;
  end if;

  -- 2. Pegar dados do perfil
  select empresa_id::text, nome into v_emp, v_nome
    from public.profiles where id = v_uid;

  raise notice '>> Usuário encontrado: % (id: %, empresa: %)', coalesce(v_nome, '(sem nome)'), v_uid, coalesce(v_emp, '(nenhuma)');

  -- 3. Se tem empresa, transferir leads para o gestor da empresa
  if v_emp is not null then
    declare v_gestor uuid;
    begin
      select id into v_gestor
        from public.profiles
       where empresa_id::text = v_emp
         and lower(role) = 'gestor'
         and ativo = true
         and id <> v_uid
       limit 1;

      if v_gestor is not null then
        update public.leads
           set responsavel_id = v_gestor, updated_at = now()
         where empresa_id::text = v_emp
           and responsavel_id::text = v_uid::text;
        get diagnostics v_leads = row_count;
        raise notice '>> Leads transferidos para gestor: %', v_leads;

        update public.lances set user_id = v_gestor
         where empresa_id::text = v_emp and user_id::text = v_uid::text;

        update public.eventos_calendario set user_id = v_gestor
         where empresa_id::text = v_emp and user_id::text = v_uid::text;
      else
        -- Se não tem outro gestor, seta leads para null
        update public.leads
           set responsavel_id = null, updated_at = now()
         where empresa_id::text = v_emp
           and responsavel_id::text = v_uid::text;
        get diagnostics v_leads = row_count;
        raise notice '>> Leads sem dono (nenhum gestor encontrado): %', v_leads;
      end if;
    end;

    -- 4. Limpar referências em equipes
    update public.equipes set supervisor_sb_id = null
     where empresa_id::text = v_emp and supervisor_sb_id = v_uid;

    update public.equipes set representante_sb_id = null
     where empresa_id::text = v_emp and representante_sb_id = v_uid;

    update public.equipes set gestor_sb_id = null
     where empresa_id::text = v_emp and gestor_sb_id = v_uid;

    -- Remover de membros_sb_ids (uuid[])
    update public.equipes
       set membros_sb_ids = array_remove(membros_sb_ids, v_uid)
     where empresa_id::text = v_emp
       and v_uid = any(membros_sb_ids);
  end if;

  -- 5. Limpar atividades
  delete from public.atividades where user_id::text = v_uid::text;

  -- 6. Limpar sim_tokens
  delete from public.sim_tokens where criado_por = v_uid;

  -- 7. Deletar perfil
  delete from public.profiles where id = v_uid;
  raise notice '>> Perfil deletado';

  -- 8. Deletar do auth.users (libera o email)
  delete from auth.users where id = v_uid;
  raise notice '>> Auth user deletado — email % está livre para novo cadastro', v_email;

  raise notice '=========================================';
  raise notice 'PRONTO! O usuário % foi removido.', v_email;
  raise notice 'Leads transferidos: %', v_leads;
  raise notice 'Agora ele pode criar uma conta nova como gestor.';
  raise notice '=========================================';
end $$;
