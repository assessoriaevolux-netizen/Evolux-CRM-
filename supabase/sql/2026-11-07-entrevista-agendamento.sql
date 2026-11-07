-- Adicionar campos de agendamento e follow-up na tabela de entrevistas
-- Rodar no Supabase SQL Editor

-- Data/hora que o candidato confirmou para a entrevista presencial
ALTER TABLE ia_entrevistas ADD COLUMN IF NOT EXISTS data_agendada timestamptz;

-- Quando o follow-up de confirmação foi enviado (null = não enviado)
ALTER TABLE ia_entrevistas ADD COLUMN IF NOT EXISTS followup_enviado timestamptz;

-- Índice para buscar entrevistas agendadas por data (usado pelo cron de follow-up)
CREATE INDEX IF NOT EXISTS idx_entrevistas_agendada ON ia_entrevistas (data_agendada) WHERE data_agendada IS NOT NULL;
