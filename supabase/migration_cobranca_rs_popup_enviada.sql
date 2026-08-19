-- Popup de "Cobrança R&S enviada" (aprovada) — evento diferente e lista de destinatários
-- separada do popup de pendências de revisão já existente (cobranca_rs_analistas_acesso /
-- cobranca_rs_popup_ids_vistos). Aqui não há relação com quem tem acesso pra revisar
-- cobranças: um analista pode ser destinatário deste popup sem nunca revisar nada.

-- Quem recebe o popup — RLS mesmo padrão de usuario_acesso_customizado (Fase 2a): só
-- service_role, toda leitura/escrita real passa pelas rotas de API com gate
-- checarPapelSuperuser.
CREATE TABLE cobranca_rs_destinatarios_popup_enviada (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analista_perfil_id  UUID NOT NULL REFERENCES analistas_perfil(id) ON DELETE CASCADE,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  criado_por_user_id  UUID REFERENCES auth.users(id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analista_perfil_id)
);

ALTER TABLE cobranca_rs_destinatarios_popup_enviada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all"
  ON cobranca_rs_destinatarios_popup_enviada
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_cobranca_rs_destinatarios_popup_enviada_analista
  ON cobranca_rs_destinatarios_popup_enviada(analista_perfil_id);

-- Dedup por notificação individual (não "1x por dia") — mesmo padrão exato de
-- cobranca_rs_popup_ids_vistos, mas em tabela própria pra este popup separado não
-- compartilhar estado "visto" com o popup de pendências. Mesma estrutura de FK/RLS do
-- original (sem RLS habilitado — baixa sensibilidade, é só marcação de "visto").
CREATE TABLE cobranca_rs_popup_enviada_ids_vistos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cobranca_id  UUID NOT NULL REFERENCES cobrancas_rs(id) ON DELETE CASCADE,
  visto_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, cobranca_id)
);

CREATE INDEX idx_cobranca_rs_popup_enviada_vistos_usuario
  ON cobranca_rs_popup_enviada_ids_vistos(usuario_id);
