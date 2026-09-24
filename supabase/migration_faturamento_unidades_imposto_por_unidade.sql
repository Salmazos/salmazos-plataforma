-- Faturamento Unidades (ex-"Faturamento Hortolândia") — imposto mensal por unidade.
--
-- DECISÃO DO OLVER (24/09): SBC terá um controle de contas a receber/pagar próprio, igual ao
-- de Hortolândia — o módulo vira um faturamento por unidade (sempre uma unidade por vez, sem
-- visão consolidada). As 3 tabelas já têm unidade_id desde a Fase 2 do retrofit SBC (todos
-- os lançamentos atuais = unidade padrão, que nessa tela aparece como "Hortolândia"); o que
-- impedia cada unidade de ter o próprio imposto do mês era o UNIQUE (ano, mes).
-- Os nomes das tabelas continuam "_hortolandia" de propósito (renomear quebraria histórico,
-- auditoria e o registro das migrações anteriores sem ganho real).
--
-- Aplicada em DOIS passos, pra o salvamento do imposto não quebrar durante o deploy: o código
-- antigo faz upsert com onConflict "ano,mes" e o novo com "unidade_id,ano,mes" — cada um
-- precisa da sua constraint existindo.

-- Passo 1 (antes do deploy) — migração faturamento_unidades_imposto_por_unidade_passo1:
ALTER TABLE public.faturamento_hortolandia_impostos_mensais
  ADD CONSTRAINT faturamento_hortolandia_impostos_mensais_unidade_ano_mes_key UNIQUE (unidade_id, ano, mes);

-- Passo 2 (depois do deploy do código novo) — migração
-- faturamento_unidades_imposto_por_unidade_passo2. Sem isso, SBC não consegue lançar o
-- imposto de um mês que Hortolândia já lançou.
ALTER TABLE public.faturamento_hortolandia_impostos_mensais
  DROP CONSTRAINT IF EXISTS faturamento_hortolandia_impostos_mensais_ano_mes_key;
