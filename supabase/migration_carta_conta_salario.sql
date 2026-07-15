-- Carta de abertura de conta salário (PDF + envio automático por e-mail) — colunas de
-- controle em admissoes, mesmo padrão de pdf_pacote_path/pdf_pacote_gerado_em/pdf_pacote_gerado_por
-- já usado para o pacote de contabilidade.
ALTER TABLE admissoes
  ADD COLUMN carta_banco_path TEXT,
  ADD COLUMN carta_banco_enviada_em TIMESTAMPTZ,
  ADD COLUMN carta_banco_enviada_por UUID;
