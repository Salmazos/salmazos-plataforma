-- Cliente pede, pelo portal, pra pausar (encerrar por ora) ou reabrir uma vaga já aprovada
-- (pedido do Olver, 26/09). Sempre resulta em status 'pausada'/'aberta' na vaga — nunca
-- 'fechada'/'cancelada', que são decisão manual do analista (a diferença importa pra
-- cobrança de cancelamento R&S, ver gerarCobrancaCancelamentoRSSeAplicavel). Motivo do
-- cliente é só contexto pro analista, não decide o resultado sozinho.
CREATE TABLE public.vaga_solicitacoes_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id uuid NOT NULL REFERENCES public.vagas(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  acao text NOT NULL CHECK (acao IN ('pausar', 'reabrir')),
  -- Só preenchido em pedidos de pausa — reabertura não tem categorias (o cliente só quer a
  -- vaga de volta).
  motivo_tipo text CHECK (motivo_tipo IN ('preenchida_internamente', 'nao_precisa_mais', 'outro')),
  motivo_texto text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'recusada')),
  solicitado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  decidido_por text,
  decidido_em timestamptz,
  motivo_recusa text
);

-- No máximo um pedido pendente por vaga (pausar OU reabrir, nunca os dois ao mesmo tempo).
CREATE UNIQUE INDEX vaga_solicitacoes_status_um_pendente
  ON public.vaga_solicitacoes_status (vaga_id) WHERE status = 'pendente';

-- Acesso só pelas rotas do servidor (service role), igual às demais tabelas do portal.
ALTER TABLE public.vaga_solicitacoes_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role acesso total vaga_solicitacoes_status"
  ON public.vaga_solicitacoes_status FOR ALL TO service_role USING (true) WITH CHECK (true);
