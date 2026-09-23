-- Correção de segurança em 4 tabelas de "visto" de popup, achadas na varredura de 23/09
-- depois de cobranca_rs_popup_ids_vistos (ver migration_cobranca_rs_popup_ids_vistos_policies_por_role.sql).
-- Alinha todas ao padrão de funcionario_vencimento_mot_popup_visualizacoes: leitura e
-- inserção só do próprio registro pra authenticated, acesso total só pra service_role.
-- Todo o código acessa essas tabelas via service role, então nada muda no comportamento.
-- Aplicado em produção via migração popup_vistos_policies_por_role.

-- 1-3. Policies criadas sem "to <role>" caíam em public (inclui anon); a de "service role",
-- com using(true), dava leitura e escrita irrestrita pela chave anon.
ALTER TABLE public.cobranca_rs_popup_enviada_ids_vistos ENABLE ROW LEVEL SECURITY;
ALTER POLICY "Usuario le seu proprio registro cobranca rs enviada"
  ON public.cobranca_rs_popup_enviada_ids_vistos TO authenticated;
ALTER POLICY "Usuario insere seu proprio registro cobranca rs enviada"
  ON public.cobranca_rs_popup_enviada_ids_vistos TO authenticated;
ALTER POLICY "Service role acesso total cobranca rs popup enviada"
  ON public.cobranca_rs_popup_enviada_ids_vistos TO service_role;

ALTER TABLE public.cobranca_rs_popup_vencida_ids_vistos ENABLE ROW LEVEL SECURITY;
ALTER POLICY "Usuario le seu proprio registro cobranca rs vencida"
  ON public.cobranca_rs_popup_vencida_ids_vistos TO authenticated;
ALTER POLICY "Usuario insere seu proprio registro cobranca rs vencida"
  ON public.cobranca_rs_popup_vencida_ids_vistos TO authenticated;
ALTER POLICY "Service role acesso total cobranca rs popup vencida"
  ON public.cobranca_rs_popup_vencida_ids_vistos TO service_role;

ALTER TABLE public.pos_venda_rs_popup_visualizacoes ENABLE ROW LEVEL SECURITY;
ALTER POLICY "Usuario le seu proprio registro pos venda rs popup"
  ON public.pos_venda_rs_popup_visualizacoes TO authenticated;
ALTER POLICY "Usuario insere seu proprio registro pos venda rs popup"
  ON public.pos_venda_rs_popup_visualizacoes TO authenticated;
ALTER POLICY "Service role acesso total pos venda rs popup"
  ON public.pos_venda_rs_popup_visualizacoes TO service_role;

-- 4. Anon não tinha acesso, mas a policy "acesso total" pra authenticated com using(true)
-- deixava qualquer usuário logado ler e gravar os registros dos outros. Troca por
-- leitura/inserção só do próprio registro; a policy de service_role já estava certa.
ALTER TABLE public.conta_receber_hortolandia_popup_vistos ENABLE ROW LEVEL SECURITY;
DROP POLICY "Autenticados acesso total conta_receber_hortolandia_popup_visto"
  ON public.conta_receber_hortolandia_popup_vistos;
CREATE POLICY "Usuario le seu proprio registro hortolandia popup"
  ON public.conta_receber_hortolandia_popup_vistos
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY "Usuario insere seu proprio registro hortolandia popup"
  ON public.conta_receber_hortolandia_popup_vistos
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());
