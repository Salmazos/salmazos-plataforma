-- Pedido de alteração que o cliente faz pelo portal numa solicitação já enviada (pedido do
-- Olver, 25/09). Só vale depois que a Salmazos aprova; aí aplica na solicitação e, se já
-- houver vaga, na vaga (lib/propagarSolicitacaoNaVaga.ts). Aplicado em produção via
-- migração solicitacao_vaga_alteracoes.
CREATE TABLE public.solicitacao_vaga_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_vaga_id uuid NOT NULL REFERENCES public.solicitacoes_vagas(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id),        -- da solicitação (filtro por unidade)
  alteracoes jsonb NOT NULL,                                      -- { campo: { antes, depois } }
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'recusada', 'substituida')),
  solicitado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  decidido_por text,
  decidido_em timestamptz,
  motivo_recusa text
);

-- No máximo um pedido pendente por solicitação: nova edição do cliente marca o anterior
-- como 'substituida' e cria outro (decisão do Olver, 25/09).
CREATE UNIQUE INDEX solicitacao_vaga_alteracoes_um_pendente
  ON public.solicitacao_vaga_alteracoes (solicitacao_vaga_id) WHERE status = 'pendente';

-- Acesso só pelas rotas do servidor (service role), igual às demais tabelas do portal.
ALTER TABLE public.solicitacao_vaga_alteracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role acesso total solicitacao_vaga_alteracoes"
  ON public.solicitacao_vaga_alteracoes FOR ALL TO service_role USING (true) WITH CHECK (true);
