-- Popup de "Fatura vencida" (cobrança aprovada/enviada com data_vencimento no passado) —
-- mesma arquitetura do popup "Cobrança R&S enviada" (migration_cobranca_rs_popup_enviada.sql),
-- lista de destinatários própria (nem toda diretoria/analista quer ver esse aviso todo dia).
-- Diferença de comportamento importante: o dedup de "visto" AQUI inclui a data de referência
-- (data_referencia) — visto hoje não impede a mesma fatura de reaparecer amanhã se continuar
-- vencida. O popup "enviada" (cobranca_rs_popup_enviada_ids_vistos) é "visto uma vez, nunca
-- mais" porque o evento (aprovação) só acontece uma vez; aqui o evento ("está vencida hoje")
-- se repete todo dia até a fatura ser paga, então o "visto" também precisa ser por dia.

CREATE TABLE cobranca_rs_destinatarios_popup_vencida (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analista_perfil_id  UUID NOT NULL REFERENCES analistas_perfil(id) ON DELETE CASCADE,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  criado_por_user_id  UUID REFERENCES auth.users(id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analista_perfil_id)
);

ALTER TABLE cobranca_rs_destinatarios_popup_vencida ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all"
  ON cobranca_rs_destinatarios_popup_vencida
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_cobranca_rs_destinatarios_popup_vencida_analista
  ON cobranca_rs_destinatarios_popup_vencida(analista_perfil_id);

-- Dedup por notificação individual E por dia — chave inclui data_referencia, então cada dia
-- novo é uma "visualização" nova em potencial pra mesma cobrança, mesmo que já tenha sido
-- vista ontem (e no dia anterior, e assim por diante, enquanto ela continuar vencida).
CREATE TABLE cobranca_rs_popup_vencida_ids_vistos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cobranca_id     UUID NOT NULL REFERENCES cobrancas_rs(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  visto_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, cobranca_id, data_referencia)
);

CREATE INDEX idx_cobranca_rs_popup_vencida_vistos_usuario_data
  ON cobranca_rs_popup_vencida_ids_vistos(usuario_id, data_referencia);
