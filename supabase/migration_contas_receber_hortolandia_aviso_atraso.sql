-- Aviso de atraso (sino + popup) pra diretoria quando um lançamento de Contas a Receber
-- Hortolândia vence e continua 'pendente' — pedido explícito do usuário, sem repetir
-- diariamente (diferente do aviso de atraso de Cobrança R&S, que reenvia a cada 2 dias):
-- aqui é 1 lembrete só por lançamento, controlado por ultimo_lembrete_atraso_em (nunca
-- reenviado depois de setado) e um "visto" PERMANENTE (sem data_referencia na chave) pro
-- popup, ao contrário de cobranca_rs_popup_vencida_ids_vistos.
--
-- Aplicada em produção via mcp__Supabase__apply_migration (projeto ktzgjthxfpeemlgqynsk).
-- Este arquivo é o registro histórico da migração, não reexecutar.
ALTER TABLE contas_receber_hortolandia ADD COLUMN ultimo_lembrete_atraso_em TIMESTAMPTZ;

ALTER TABLE notificacoes_analista
  ADD COLUMN conta_receber_hortolandia_id UUID REFERENCES contas_receber_hortolandia(id);

CREATE TABLE conta_receber_hortolandia_popup_vistos (
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  conta_id UUID NOT NULL REFERENCES contas_receber_hortolandia(id),
  visto_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, conta_id)
);

ALTER TABLE conta_receber_hortolandia_popup_vistos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total conta_receber_hortolandia_popup_vistos"
  ON conta_receber_hortolandia_popup_vistos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total conta_receber_hortolandia_popup_vistos"
  ON conta_receber_hortolandia_popup_vistos FOR ALL TO service_role USING (true) WITH CHECK (true);
