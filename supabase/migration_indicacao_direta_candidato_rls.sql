-- solicitacoes_indicacao_candidato (migration_indicacao_direta_candidato.sql) nasceu sem RLS e
-- com o grant padrão pra anon/authenticated — com a chave anon pública no front, qualquer um
-- lia/gravava nome, telefone e salário dos candidatos indicados pelos clientes. Pego antes da
-- primeira indicação (tabela vazia, 30/09). Mesmo padrão das demais tabelas: só o servidor
-- (service_role); as rotas usam createServiceClient.
--
-- Aplicada em produção via apply_migration (nome: indicacao_direta_candidato_rls).
ALTER TABLE public.solicitacoes_indicacao_candidato ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role acesso total solicitacoes_indicacao_candidato" ON public.solicitacoes_indicacao_candidato FOR ALL TO service_role USING (true) WITH CHECK (true);
