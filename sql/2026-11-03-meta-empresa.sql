-- Adiciona coluna meta_empresa na tabela empresas
-- Valor em reais (inteiro). Ex: 500000 = R$ 500.000
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS meta_empresa bigint DEFAULT 0;

-- Permite que usuários autenticados leiam e atualizem a meta
-- (a lógica de gestor-only é no frontend)
COMMENT ON COLUMN empresas.meta_empresa IS 'Meta mensal da empresa em reais (definida pelo gestor)';
