-- Migração: fluxo de reprovação de candidatos
-- Execute este SQL no SQL Editor do Supabase

ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'reprovado', 'negativado')),
  ADD COLUMN IF NOT EXISTS motivo_reprovacao text,
  ADD COLUMN IF NOT EXISTS etapa_reprovacao text;

-- Índice para a query principal do Kanban (status = 'ativo')
CREATE INDEX IF NOT EXISTS candidatos_status_idx ON candidatos (status);
