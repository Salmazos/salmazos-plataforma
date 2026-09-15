-- Contas a Receber (Hortolândia) — planilha manual de controle de faturamento a receber,
-- hoje mantida fora da plataforma pelo Olver. Primeira versão alimentada 100% manualmente
-- (sem geração automática por vaga/admissão, diferente de cobrancas_rs). Cabeçalho baseado
-- em cobrancas_rs por decisão explícita do usuário, com 3 diferenças combinadas com ele:
-- (1) sem coluna "tipo" (não existe no fluxo manual desta planilha); (2) cliente_id é
-- OBRIGATÓRIO e sempre um cliente já cadastrado (sem snapshot de texto livre, diferente de
-- cobrancas_rs, porque aqui não há um fluxo automático que precise sobreviver a uma edição
-- futura do cadastro do cliente); (3) sem coluna "unidade" — escopo implícito Hortolândia
-- por enquanto, decisão de não adicionar a coluna agora pra não overengineer (extensível
-- depois sem perda de dado se a Salmazos abrir outra unidade com controle próprio).
--
-- Aplicada em produção via mcp__Supabase__apply_migration (projeto ktzgjthxfpeemlgqynsk)
-- em 2026-09-15. Este arquivo é o registro histórico da migração, não reexecutar.
CREATE TABLE contas_receber_hortolandia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  numero_nf TEXT,
  valor_bruto NUMERIC,
  valor_liquido NUMERIC NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  data_emissao_nf DATE,
  -- "Atrasado" não é armazenado (mesma decisão já tomada em cobrancas_rs): é calculado no
  -- cliente a partir de status='pendente' + data_vencimento no passado, pra nunca ficar
  -- dessincronizado de uma correção manual de data feita depois.
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contas_receber_hortolandia_cliente ON contas_receber_hortolandia(cliente_id);
CREATE INDEX idx_contas_receber_hortolandia_status ON contas_receber_hortolandia(status);
CREATE INDEX idx_contas_receber_hortolandia_vencimento ON contas_receber_hortolandia(data_vencimento);

ALTER TABLE contas_receber_hortolandia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem contas_receber_hortolandia" ON contas_receber_hortolandia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados gerenciam contas_receber_hortolandia" ON contas_receber_hortolandia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total contas_receber_hortolandia" ON contas_receber_hortolandia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
