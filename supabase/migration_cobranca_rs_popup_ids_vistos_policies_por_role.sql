-- Correção de segurança em cobranca_rs_popup_ids_vistos (popup de Cobrança R&S pendente).
-- A tabela nasceu direto no banco (migrações cobranca_rs_gerador_e_popup_por_pendencia e
-- habilita_rls_cobranca_rs_popup_vistos, sem arquivo no repo) com as 3 policies sem
-- "to <role>" — caíam em public (inclui anon), e a de "service role" com using(true) dava
-- leitura e escrita irrestrita pela chave anon. Mesmo padrão de
-- funcionario_vencimento_mot_popup_visualizacoes (service_role / authenticated / authenticated).
-- Aplicado em produção via migração cobranca_rs_popup_ids_vistos_policies_por_role.

ALTER TABLE public.cobranca_rs_popup_ids_vistos ENABLE ROW LEVEL SECURITY;

ALTER POLICY "Usuario le seu proprio registro cobranca rs pendente"
  ON public.cobranca_rs_popup_ids_vistos TO authenticated;

ALTER POLICY "Usuario insere seu proprio registro cobranca rs pendente"
  ON public.cobranca_rs_popup_ids_vistos TO authenticated;

ALTER POLICY "Service role acesso total cobranca rs popup pendente"
  ON public.cobranca_rs_popup_ids_vistos TO service_role;
