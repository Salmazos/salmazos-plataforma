-- Unidade de faturamento (Monte Mor | Hortolândia): dimensão SÓ de faturamento/divisão de lucro,
-- separada da unidade de visibilidade (unidade_id). A equipe de Monte Mor e Hortolândia é a mesma;
-- o que muda é a cidade que fatura (sociedade 50% Hortolândia / SBC). SBC segue só por unidade_id
-- (unidade_faturamento fica NULL). NULL = "a definir": nunca some da tela (aba "A definir").
--
-- Aditiva e idempotente: nenhuma coluna nova é NOT NULL, então o código antigo continua
-- funcionando durante o deploy. Os lançamentos/cobranças guardam o valor do cliente no momento da
-- criação (snapshot): mudar o cliente depois não move o histórico de lucro entre sócios.
--
-- Contagens esperadas (conferidas em produção em leitura): ver cada UPDATE.

ALTER TABLE public.clientes                   ADD COLUMN IF NOT EXISTS unidade_faturamento text;
ALTER TABLE public.contas_receber_hortolandia ADD COLUMN IF NOT EXISTS unidade_faturamento text;
ALTER TABLE public.contas_pagar_hortolandia   ADD COLUMN IF NOT EXISTS unidade_faturamento text;
ALTER TABLE public.cobrancas_rs               ADD COLUMN IF NOT EXISTS unidade_faturamento text;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes', 'contas_receber_hortolandia', 'contas_pagar_hortolandia', 'cobrancas_rs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_unidade_faturamento_check' AND conrelid = ('public.' || t)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (unidade_faturamento IN (''monte_mor'', ''hortolandia''))',
        t, t || '_unidade_faturamento_check'
      );
    END IF;
  END LOOP;
END $$;

-- (a) Clientes que já têm lançamento em contas a receber. Petix NÃO é Hortolândia (decisão do
-- Olver): monte_mor. Só preenche onde está NULL, então rodar de novo não sobrescreve escolha manual.
-- Esperado: 13 clientes com lançamento -> 12 'hortolandia' + 1 'monte_mor' (Petix).
UPDATE public.clientes c
   SET unidade_faturamento = CASE WHEN lower(btrim(c.nome)) = 'petix' THEN 'monte_mor' ELSE 'hortolandia' END
 WHERE c.unidade_faturamento IS NULL
   AND EXISTS (SELECT 1 FROM public.contas_receber_hortolandia cr WHERE cr.cliente_id = c.id);

-- (b) Lançamentos de contas a receber herdam o valor do cliente marcado em (a).
-- Esperado: 26 lançamentos -> 24 'hortolandia' + 2 'monte_mor' (os 2 de Petix).
UPDATE public.contas_receber_hortolandia cr
   SET unidade_faturamento = c.unidade_faturamento
  FROM public.clientes c
 WHERE c.id = cr.cliente_id
   AND cr.unidade_faturamento IS NULL
   AND c.unidade_faturamento IS NOT NULL;

-- (c) contas_pagar_hortolandia (4 linhas): NÃO é preenchida em massa — não tem cliente, fica
-- "a definir" até alguém escolher na tela. Esperado: 0 linhas alteradas.
-- cobrancas_rs: só as cujo cliente já foi marcado em (a) herdam o valor do cliente.
-- Esperado: 22 cobranças -> 4 'hortolandia' + 2 'monte_mor' (Petix) = 6 alteradas; 16 ficam NULL.
UPDATE public.cobrancas_rs cb
   SET unidade_faturamento = c.unidade_faturamento
  FROM public.clientes c
 WHERE c.id = cb.cliente_id
   AND cb.unidade_faturamento IS NULL
   AND c.unidade_faturamento IS NOT NULL;
