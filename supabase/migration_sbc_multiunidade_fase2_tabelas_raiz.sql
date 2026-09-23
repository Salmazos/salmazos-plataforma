-- Fase 2 do retrofit multi-unidade (SBC): adiciona unidade_id nas 14 tabelas "raiz"
-- (classificacao completa no mapa de tabelas discutido com o Olver, 23/09). Mesmo padrao da
-- Fase 1: coluna nula -> backfill imediato pra Monte Mor/Hortolandia -> trava como
-- obrigatoria, tudo na mesma migracao, pra nunca existir um registro sem unidade definida.
-- Nenhum codigo le essas colunas ainda (Fase 3) — zero mudanca de comportamento hoje.
DO $$
DECLARE
  v_padrao uuid;
BEGIN
  SELECT id INTO v_padrao FROM unidades WHERE slug = 'monte-mor-hortolandia';

  ALTER TABLE clientes ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE clientes SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE clientes ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE vagas ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE vagas SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE vagas ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE candidatos SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE candidatos ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE admissoes ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE admissoes SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE admissoes ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE funcionarios SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE funcionarios ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE rescisoes ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE rescisoes SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE rescisoes ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE cobrancas_rs ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE cobrancas_rs SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE cobrancas_rs ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE solicitacoes_vagas ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE solicitacoes_vagas SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE solicitacoes_vagas ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE contas_receber_hortolandia ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE contas_receber_hortolandia SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE contas_receber_hortolandia ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE contas_pagar_hortolandia ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE contas_pagar_hortolandia SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE contas_pagar_hortolandia ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE faturamento_rs_ajustes_manuais ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE faturamento_rs_ajustes_manuais SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE faturamento_rs_ajustes_manuais ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE faturamento_rs_impostos_mensais ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE faturamento_rs_impostos_mensais SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE faturamento_rs_impostos_mensais ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE faturamento_hortolandia_impostos_mensais ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE faturamento_hortolandia_impostos_mensais SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE faturamento_hortolandia_impostos_mensais ALTER COLUMN unidade_id SET NOT NULL;

  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id);
  UPDATE audit_logs SET unidade_id = v_padrao WHERE unidade_id IS NULL;
  ALTER TABLE audit_logs ALTER COLUMN unidade_id SET NOT NULL;
END $$;
