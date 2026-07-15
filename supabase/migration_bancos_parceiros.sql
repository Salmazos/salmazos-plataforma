-- Cadastro de bancos parceiros — substitui o bloco fixo de destinatários únicos em
-- configuracoes_gerais, já que a Salmazos pode passar a trabalhar com mais de um banco
-- parceiro no futuro (hoje só Sicoob).
CREATE TABLE bancos_parceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  emails_para TEXT[] NOT NULL DEFAULT '{}',
  emails_cc TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bancos_parceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem bancos_parceiros" ON bancos_parceiros
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados gerenciam bancos_parceiros" ON bancos_parceiros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total bancos_parceiros" ON bancos_parceiros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Rastreabilidade: qual banco parceiro foi usado em cada carta enviada. carta_banco_id é
-- a referência (usada para bloquear exclusão definitiva de bancos já usados);
-- carta_banco_nome é um snapshot do nome no momento do envio, resiliente a renomeações
-- futuras do banco sem precisar de join pra exibir o histórico.
ALTER TABLE admissoes
  ADD COLUMN carta_banco_id UUID REFERENCES bancos_parceiros(id),
  ADD COLUMN carta_banco_nome TEXT;

-- Migra o valor já configurado em configuracoes_gerais pro primeiro banco parceiro
-- (Sicoob), pra não perder o que já estava salvo. Rode só uma vez — mantido aqui como
-- registro histórico da migração, não reexecutar.
-- INSERT INTO bancos_parceiros (nome, emails_para, emails_cc, ativo)
-- VALUES ('Sicoob', ARRAY['<valor de carta_conta_salario_destinatarios_para>'], ARRAY['<valor de _cc>']::TEXT[], true);
-- DELETE FROM configuracoes_gerais
-- WHERE chave IN ('carta_conta_salario_destinatarios_para', 'carta_conta_salario_destinatarios_cc');
