-- Ajuste pedido pelo usuário após ver a tela: separar bruto/líquido por lançamento não faz
-- sentido aqui — o líquido real depende do imposto do MÊS (calculado fora da plataforma
-- hoje), não de cada lançamento individual. Consolida num único valor por lançamento
-- ("Valor R$") e move o conceito de líquido pro nível agregado do mês, com um campo de
-- imposto mensal igual ao que já existe em faturamento_rs_impostos_mensais.
--
-- Aplicada em produção via mcp__Supabase__apply_migration (projeto ktzgjthxfpeemlgqynsk)
-- em 2026-09-15 (mesmo dia da criação da tabela — só 1 lançamento de teste existia, sem
-- perda de dado real). Este arquivo é o registro histórico da migração, não reexecutar.
ALTER TABLE contas_receber_hortolandia DROP COLUMN valor_liquido;
ALTER TABLE contas_receber_hortolandia RENAME COLUMN valor_bruto TO valor;
ALTER TABLE contas_receber_hortolandia ALTER COLUMN valor SET NOT NULL;

CREATE TABLE faturamento_hortolandia_impostos_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  percentual NUMERIC NOT NULL,
  informado_por UUID REFERENCES auth.users(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

ALTER TABLE faturamento_hortolandia_impostos_mensais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total faturamento_hortolandia_impostos_mensais"
  ON faturamento_hortolandia_impostos_mensais FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total faturamento_hortolandia_impostos_mensais"
  ON faturamento_hortolandia_impostos_mensais FOR ALL TO service_role USING (true) WITH CHECK (true);
