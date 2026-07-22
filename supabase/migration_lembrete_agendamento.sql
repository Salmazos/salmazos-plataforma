-- Migração: lembrete automático de agendamento pendente
-- Execute este SQL no SQL Editor do Supabase

-- Rastreia quando foi o último lembrete enviado pro cliente/analista sobre um
-- encaminhamento parado em "aguardando_agendamento_cliente" — sem isso não dá
-- pra saber se já se passaram 48h desde o último lembrete ou só desde a criação.
ALTER TABLE encaminhamentos
  ADD COLUMN IF NOT EXISTS ultimo_lembrete_agendamento_em timestamptz;
