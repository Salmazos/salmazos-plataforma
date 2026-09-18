-- Contas a Pagar (Hortolândia) — contraparte de saída de contas_receber_hortolandia
-- (ver migration_contas_receber_hortolandia.sql). Pedido do Olver: acompanhar as despesas
-- da unidade Hortolândia dentro da mesma tela de Faturamento, pra chegar num Saldo Líquido
-- real (entrada líquida de imposto menos saída), não só o líquido de entrada isolado.
--
-- Cabeçalho vem direto da planilha manual que o Olver já usa hoje (Data de Pagamento,
-- Descrição, Valor, Responsável) — sem status/vencimento como contas_receber_hortolandia:
-- diferente da entrada (que nasce como expectativa e só depois é paga), a saída aqui já
-- nasce como um pagamento executado, então só existe "data_pagamento", sem "pendente".
-- Sem cliente_id (é despesa da unidade, não de um cliente específico) e sem
-- imposto_percentual_manual (imposto só se aplica à receita, não à despesa).
--
-- Aplicada em produção via mcp__Supabase__apply_migration (projeto ktzgjthxfpeemlgqynsk)
-- em 2026-09-18. Este arquivo é o registro histórico da migração, não reexecutar.
CREATE TABLE contas_pagar_hortolandia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_pagamento DATE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  responsavel TEXT NOT NULL,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contas_pagar_hortolandia_pagamento ON contas_pagar_hortolandia(data_pagamento);

ALTER TABLE contas_pagar_hortolandia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem contas_pagar_hortolandia" ON contas_pagar_hortolandia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados gerenciam contas_pagar_hortolandia" ON contas_pagar_hortolandia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total contas_pagar_hortolandia" ON contas_pagar_hortolandia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
