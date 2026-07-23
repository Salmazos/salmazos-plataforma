-- Dedup do cron de lembrete de entrevista no dia (evita reenvio se o cron rodar
-- mais de uma vez no mesmo dia).
ALTER TABLE encaminhamentos
  ADD COLUMN IF NOT EXISTS lembrete_entrevista_hoje_enviado_em timestamptz;
