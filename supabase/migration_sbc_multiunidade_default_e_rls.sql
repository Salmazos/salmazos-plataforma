-- Correção das Fases 1 e 2 do retrofit multi-unidade (SBC), aplicada logo depois delas.
--
-- 1. As 15 colunas unidade_id nasceram NOT NULL sem DEFAULT, mas nenhum código da aplicação
--    preenche unidade_id ainda (isso só chega na Fase 3) — todo INSERT nessas tabelas
--    (cadastro público de candidato, audit_logs, vagas, admissões, Portal do Cliente...)
--    passaria a falhar com "null value in column unidade_id". DEFAULT via função (lookup
--    por slug, sem uuid fixo) garante Monte Mor/Hortolândia pra todo registro novo até a
--    Fase 3 passar a gravar a unidade explicitamente. SECURITY DEFINER pra o default
--    funcionar independente da RLS de unidades pra quem estiver inserindo.
-- 2. A tabela unidades nasceu sem RLS (leitura e escrita abertas pra chave anon). Mesmo
--    padrão das tabelas de popup corrigidas em 23/09: leitura pra authenticated, escrita
--    só pra service_role.
--
-- Aplicado em produção via migração sbc_multiunidade_default_e_rls.

CREATE OR REPLACE FUNCTION public.unidade_padrao()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.unidades WHERE slug = 'monte-mor-hortolandia'
$$;

ALTER TABLE public.analistas_perfil ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.clientes ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.vagas ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.candidatos ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.admissoes ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.funcionarios ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.rescisoes ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.cobrancas_rs ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.solicitacoes_vagas ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.contas_receber_hortolandia ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.contas_pagar_hortolandia ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.faturamento_rs_ajustes_manuais ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.faturamento_rs_impostos_mensais ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.faturamento_hortolandia_impostos_mensais ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();
ALTER TABLE public.audit_logs ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao();

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem unidades"
  ON public.unidades
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role acesso total unidades"
  ON public.unidades
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
