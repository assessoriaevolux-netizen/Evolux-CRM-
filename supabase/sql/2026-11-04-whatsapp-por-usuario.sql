-- ════════════════════════════════════════════════════════════════════════════
-- Evolux CRM — Cada pessoa conecta o PRÓPRIO WhatsApp (04/11/2026)
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- A tabela abaixo guarda, por alguns minutos, a conexão com a Meta que a pessoa
-- acabou de fazer, até o CRM ligar o número dela (o número fica com "dono" = a
-- pessoa). Só o servidor lê e grava: ninguém acessa pelo navegador.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.integ_wa_pessoal (
  user_id    uuid primary key,
  empresa_id text not null,
  token      text not null,
  expira_em  timestamptz,
  criado_em  timestamptz not null default now()
);
alter table public.integ_wa_pessoal enable row level security;
revoke all on public.integ_wa_pessoal from anon, authenticated;
grant all on public.integ_wa_pessoal to service_role;

-- Um número só pode ter um dono; o índice ajuda a achar o número de cada pessoa
create index if not exists integ_idx_wa_numeros_dono on public.integ_wa_numeros (empresa_id, dono_id);

notify pgrst, 'reload schema';
