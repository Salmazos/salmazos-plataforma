-- Migração: reprovação interna de candidato (flag permanente, cross-vaga)
-- Execute este SQL no SQL Editor do Supabase

ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS reprovado_internamente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reprovacao_motivo TEXT,
  ADD COLUMN IF NOT EXISTS reprovado_por_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reprovado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS reprovado_em TIMESTAMPTZ;

-- Índice para filtrar/destacar reprovados no Banco de Candidatos
CREATE INDEX IF NOT EXISTS candidatos_reprovado_internamente_idx
  ON candidatos (reprovado_internamente) WHERE reprovado_internamente = true;
