-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — Imagens da IA (04/11/2026)
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- • Pasta pública "ia-midias" no Storage para as imagens dos roteiros da IA
--   (o WhatsApp precisa de um link público para baixar a imagem).
-- • Cada empresa só grava/apaga na própria pasta, e só quem gerencia a IA.
-- • Mensagens do WhatsApp guardam o link da imagem enviada (aparece no chat).
-- ════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ia-midias', 'ia-midias', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists ia_midias_ver on storage.objects;
create policy ia_midias_ver on storage.objects for select to public
  using (bucket_id = 'ia-midias');

drop policy if exists ia_midias_enviar on storage.objects;
create policy ia_midias_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'ia-midias'
              and (storage.foldername(name))[1] = (select public.crm_empresa())
              and (select public.integ_tem_perm('ia_manage')));

drop policy if exists ia_midias_apagar on storage.objects;
create policy ia_midias_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'ia-midias'
         and (storage.foldername(name))[1] = (select public.crm_empresa())
         and (select public.integ_tem_perm('ia_manage')));

alter table public.wa_mensagens add column if not exists midia_url text;

notify pgrst, 'reload schema';
