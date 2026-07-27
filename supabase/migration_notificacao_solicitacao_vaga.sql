-- Permite deep-link do clique na notificação "nova_solicitacao_vaga" direto pra
-- solicitação específica em /painel/vagas, em vez de só abrir a lista geral.
ALTER TABLE notificacoes_analista
  ADD COLUMN IF NOT EXISTS solicitacao_vaga_id uuid REFERENCES solicitacoes_vagas(id) ON DELETE SET NULL;
