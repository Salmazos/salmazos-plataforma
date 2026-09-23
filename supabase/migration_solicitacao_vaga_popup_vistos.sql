-- Dedup por pendência individual (mesmo padrão de cobranca_rs_popup_ids_vistos) pro popup
-- "Nova solicitação de vaga" — cada usuário marca como visto por solicitação, não por dia,
-- senão uma segunda solicitação no mesmo dia ficaria sem aviso até o dia seguinte.
CREATE TABLE IF NOT EXISTS solicitacao_vaga_popup_vistos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitacao_vaga_id uuid NOT NULL REFERENCES solicitacoes_vagas(id) ON DELETE CASCADE,
  visto_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, solicitacao_vaga_id)
);

ALTER TABLE public.solicitacao_vaga_popup_vistos ENABLE ROW LEVEL SECURITY;

-- "to <role>" é obrigatório: sem ele a policy vale pra public (inclui anon) — mesmo padrão de
-- funcionario_vencimento_mot_popup_visualizacoes (service_role / authenticated / authenticated).
CREATE POLICY "Usuario le seu proprio registro solicitacao_vaga_popup"
  ON public.solicitacao_vaga_popup_vistos
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "Usuario insere seu proprio registro solicitacao_vaga_popup"
  ON public.solicitacao_vaga_popup_vistos
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "Service role acesso total solicitacao_vaga_popup_vistos"
  ON public.solicitacao_vaga_popup_vistos
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
