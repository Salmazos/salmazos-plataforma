-- As 3 tabelas do Espelho de Ponto nasceram (migration_ponto_espelho.sql) sem RLS e com o
-- grant padrão pra anon/authenticated — com a chave anon pública no front, qualquer um lia e
-- gravava marcação/falta/atestado de funcionário direto pela API. Pego antes do primeiro
-- import (tabelas vazias, 28/09). Mesmo padrão das demais tabelas: só o servidor
-- (service_role) acessa; as rotas /api/ponto/* já usam createServiceClient.
--
-- Aplicada em produção via apply_migration (nome: ponto_espelho_rls).
ALTER TABLE public.ponto_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponto_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponto_dias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role acesso total ponto_fechamentos" ON public.ponto_fechamentos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role acesso total ponto_funcionarios" ON public.ponto_funcionarios FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role acesso total ponto_dias" ON public.ponto_dias FOR ALL TO service_role USING (true) WITH CHECK (true);
