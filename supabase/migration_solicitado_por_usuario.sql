-- Rastreia qual usuário do cliente enviou cada solicitação de vaga.
-- Registros antigos ficam null (não sabemos quem enviou) — aparecem só em "Todas".
ALTER TABLE solicitacoes_vagas
  ADD COLUMN IF NOT EXISTS solicitado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
