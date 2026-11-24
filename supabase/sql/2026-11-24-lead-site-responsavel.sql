-- Leads que chegam de fora do CRM (formulário de site, webhook) sem responsável
-- passam a cair no rodízio de vendedores da empresa — o mesmo usado nos leads da Meta.
-- Só age quando: o lead NÃO foi criado por um usuário logado no CRM
-- e veio sem responsável. Nada muda para leads criados/importados dentro do CRM.

create or replace function public.crm_lead_externo_responsavel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.responsavel_id is null and auth.uid() is null and new.empresa_id is not null then
    new.responsavel_id := public.integ_srv_responsavel(new.empresa_id::text, null, '{}'::uuid[], 'site:' || new.empresa_id::text);
  end if;
  return new;
end $$;

drop trigger if exists aa_crm_lead_externo_responsavel on public.leads;
create trigger aa_crm_lead_externo_responsavel before insert on public.leads
  for each row execute function public.crm_lead_externo_responsavel();

-- Distribui os leads que JÁ entraram sem responsável (criados de fora do CRM)
do $$
declare r record;
begin
  for r in select id, empresa_id from public.leads where responsavel_id is null and empresa_id is not null order by created_at loop
    update public.leads
       set responsavel_id = public.integ_srv_responsavel(r.empresa_id::text, null, '{}'::uuid[], 'site:' || r.empresa_id::text)
     where id = r.id;
  end loop;
end $$;
