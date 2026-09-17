-- ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O OLVER: a maioria dos lançamentos de Faturamento
-- Hortolândia usa o imposto do mês (faturamento_hortolandia_impostos_mensais), mas alguns
-- clientes têm alíquota diferente. Esse campo permite travar o imposto de UM lançamento
-- específico numa alíquota própria — NULL (padrão) segue o imposto do mês normalmente;
-- preenchido, ignora o mês e usa sempre esse valor, mesmo que o imposto do mês mude depois.
ALTER TABLE contas_receber_hortolandia
  ADD COLUMN imposto_percentual_manual NUMERIC(5, 2);
