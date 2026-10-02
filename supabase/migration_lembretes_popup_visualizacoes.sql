-- DOCUMENTAÇÃO: já aplicada no banco por outra via (migração aditiva). Dedup "1x por usuário por dia"
-- do popup de lembretes do Comercial, no mesmo molde de supervisao_popup_visualizacoes.
CREATE TABLE IF NOT EXISTS public.lembretes_popup_visualizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  data_referencia date NOT NULL,
  visualizado_em timestamptz DEFAULT now(),
  UNIQUE (usuario_id, data_referencia)
);

ALTER TABLE public.lembretes_popup_visualizacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lembretes_popup_visualizacoes FROM anon;
