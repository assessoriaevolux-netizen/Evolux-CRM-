-- ─── Meta Pixel de Conversão ───────────────────────────────────────────────
-- Adiciona campo meta_pixel_id na tabela empresas para armazenar o ID
-- do pixel da Meta. Quando preenchido, o CRM dispara automaticamente
-- o evento de conversão (Purchase) ao mover um lead para "Fechado / Convertido".
-- ────────────────────────────────────────────────────────────────────────────

alter table public.empresas add column if not exists meta_pixel_id text;

comment on column public.empresas.meta_pixel_id is
  'ID do Meta Pixel para disparar eventos de conversão (fbq). Ex: 2260943157796247';

-- Libera leitura do campo para usuários autenticados (já têm select na tabela via RLS)
-- Nada mais é necessário: o campo vem junto com o select('*') existente.

notify pgrst, 'reload schema';

select 'Coluna meta_pixel_id adicionada à tabela empresas.' as resultado;
