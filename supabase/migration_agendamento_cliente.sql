-- Migração: agendamento de entrevista pelo cliente
-- Execute este SQL no SQL Editor do Supabase

-- 1. data_entrevista passa de date para timestamptz, ficando opcional (nullable) —
--    necessário pro novo fluxo "pedir agendamento ao cliente", que cria o
--    encaminhamento sem data definida ainda. Os 23 registros existentes (todos com
--    data preenchida) são convertidos pro meio-dia em horário de Brasília, pra evitar
--    qualquer ambiguidade de fuso ao exibir a mesma data em telas que já leem esse
--    campo hoje (Kanban, agenda, portal do cliente).
ALTER TABLE encaminhamentos
  ALTER COLUMN data_entrevista TYPE timestamptz
  USING (data_entrevista::timestamp + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo';

ALTER TABLE encaminhamentos
  ALTER COLUMN data_entrevista DROP NOT NULL;

-- 2. Novo status: "aguardando_agendamento_cliente" — encaminhamento criado sem data,
--    esperando o cliente definir quando pode receber o candidato pra entrevista.
ALTER TABLE encaminhamentos DROP CONSTRAINT IF EXISTS encaminhamentos_status_check;
ALTER TABLE encaminhamentos
  ADD CONSTRAINT encaminhamentos_status_check
  CHECK (status IN ('aguardando', 'aprovado', 'reprovado', 'desistiu', 'aguardando_agendamento_cliente'));
