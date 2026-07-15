-- Tabela genérica de configuração chave/valor — pensada pra ser reaproveitada por
-- qualquer configuração futura, não só a carta de conta salário (destinatários padrão,
-- responsável pelo RH pra assinatura, etc.).
CREATE TABLE configuracoes_gerais (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID
);

ALTER TABLE configuracoes_gerais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem configuracoes_gerais" ON configuracoes_gerais
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados gerenciam configuracoes_gerais" ON configuracoes_gerais
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total configuracoes_gerais" ON configuracoes_gerais
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Assinatura do usuário (PNG fundo transparente) — usada na carta de abertura de conta
-- salário quando o usuário é designado "responsável pelo RH" em Configurações.
ALTER TABLE analistas_perfil ADD COLUMN assinatura_url TEXT;
