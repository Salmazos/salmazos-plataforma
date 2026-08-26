-- Adiciona timestamp de quando calcularMatchCandidato() rodou pela última vez para o
-- candidato, para permitir uma trava de idempotência (evitar recálculo duplicado por
-- retry/duplo submit) sem depender de updated_at, que muda por qualquer outro motivo.
alter table candidatos
  add column if not exists matches_calculados_em timestamptz;
