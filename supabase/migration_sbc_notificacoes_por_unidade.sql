-- Fase 3 SBC — notificações por unidade. Aplicado em produção via migração
-- sbc_notificacoes_por_unidade (24/09).
--
-- Nenhuma das duas tabelas tem trigger de updated_at, então o backfill abaixo não mexe em
-- data de "última atualização" (ver lição da Fase 2).

-- 1. Avisos gerais do sino (user_id nulo) passam a poder ter unidade: com unidade, só a
--    equipe daquela unidade vê (sócios com acesso a todas veem tudo); sem unidade,
--    continua visível pra todos.
ALTER TABLE public.notificacoes_analista
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);

-- Avisos gerais que já existem são todos de Monte Mor/Hortolândia (única unidade em
-- operação). "atualizacao_curriculo" fica sem unidade: é sobre candidato, e o banco de
-- candidatos é compartilhado entre as unidades.
UPDATE public.notificacoes_analista
SET unidade_id = public.unidade_padrao()
WHERE user_id IS NULL AND unidade_id IS NULL AND tipo <> 'atualizacao_curriculo';

CREATE INDEX IF NOT EXISTS notificacoes_analista_broadcast_unidade_idx
  ON public.notificacoes_analista (unidade_id) WHERE user_id IS NULL;

-- 2. Antiduplicação do lembrete mensal de aniversários passa a ser por unidade (um e-mail
--    de lote por unidade, cada um só com os aniversariantes dela).
ALTER TABLE public.aniversario_notificacoes_enviadas
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);

UPDATE public.aniversario_notificacoes_enviadas
SET unidade_id = public.unidade_padrao()
WHERE tipo = 'mes_seguinte' AND unidade_id IS NULL;

DROP INDEX IF EXISTS public.aniversario_notif_mes_seguinte_uq;
CREATE UNIQUE INDEX aniversario_notif_mes_seguinte_uq
  ON public.aniversario_notificacoes_enviadas (tipo, ano, mes_referencia, unidade_id)
  WHERE contato_id IS NULL;
