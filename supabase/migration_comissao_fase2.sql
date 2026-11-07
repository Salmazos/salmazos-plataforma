-- Comissão de analistas — FASE 2 (fechamento mensal, pagamento). Migração ADITIVA sobre a Fase 1 (migration_comissao_fase1.sql, já
-- aplicada): uma tabela nova (comissao_fechamentos), uma coluna nova em comissao_lancamentos (fechamento_id), a função de fechamento
-- em transação única e a troca (CREATE OR REPLACE) do trigger de imutabilidade para congelar lançamento fechado.
-- NÃO aplicada: aguarda o OK do Olver (mcp__Supabase__apply_migration no projeto ktzgjthxfpeemlgqynsk, nunca em branch paga).
--
-- Regras (decididas pelo Olver):
-- - Fechamento manual por mês de competência e por unidade, para todos os beneficiários de uma vez, só diretoria/superuser.
-- - Entram: lançamentos de COMISSÃO "confirmada" ainda sem fechamento, com competência <= mês fechado; mais ajustes/estornos ainda sem
--   fechamento (competência <= mês) cujo lançamento original já foi fechado ou entra neste mesmo fechamento (ajuste de comissão que
--   ainda não conta não vai sozinho, para não pagar um estorno sem a comissão correspondente). Prevista, contestada,
--   retroativo_pendente, cancelada e recusada ficam fora.
-- - Confirmada depois do fechamento do mês dela entra no PRÓXIMO fechamento, com a competência original preservada ("atrasada de <mês>").
-- - Não fecha com retroativo_pendente ou contestada de competência <= mês. Fechado = congelado: nada muda; correção = ajuste/estorno
--   no fechamento seguinte. Fechamento nunca é reaberto nem apagado. Pagamento é por fechamento, uma única vez, e não se desfaz.

-- ── 1) Fechamentos ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.comissao_fechamentos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia            date NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
  unidade_id             uuid NOT NULL DEFAULT public.unidade_padrao() REFERENCES public.unidades(id),
  fechado_por            uuid REFERENCES auth.users(id),
  fechado_em             timestamptz NOT NULL DEFAULT now(),
  -- Soma ASSINADA dos lançamentos incluídos (estorno negativo). Pode ser zero ou negativa: não bloqueia.
  total                  numeric(12,2) NOT NULL,
  qtd_lancamentos        integer NOT NULL CHECK (qtd_lancamentos > 0),
  pago_em                date,
  pago_registrado_por    uuid REFERENCES auth.users(id),
  pago_registrado_em     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_comissao_fechamento_mes_unidade UNIQUE (competencia, unidade_id),
  CONSTRAINT comissao_fech_pagamento_completo CHECK (
    (pago_em IS NULL AND pago_registrado_por IS NULL AND pago_registrado_em IS NULL)
    OR (pago_em IS NOT NULL AND pago_registrado_em IS NOT NULL)
  )
);

ALTER TABLE public.comissao_lancamentos ADD COLUMN fechamento_id uuid REFERENCES public.comissao_fechamentos(id);
CREATE INDEX idx_comissao_lanc_fechamento ON public.comissao_lancamentos (fechamento_id) WHERE fechamento_id IS NOT NULL;
-- fechado_em (já existia, reservado na Fase 1) e fechamento_id andam juntos.
ALTER TABLE public.comissao_lancamentos ADD CONSTRAINT comissao_lanc_fechamento_par CHECK ((fechado_em IS NULL) = (fechamento_id IS NULL));

-- ── 2) Trigger do lançamento: congela o fechado ────────────────────────────────────────────────────────────────────────
-- Mantém todas as regras da Fase 1 e acrescenta: (a) lançamento fechado não muda NADA (nem status, nem valor, nem metadados);
-- (b) a única mudança permitida em lançamento aberto que mexe em fechado_em/fechamento_id é o preenchimento inicial dos dois juntos
-- (de NULL para valor), sem alterar mais nada na mesma operação, e só para comissão "confirmada" ou ajuste/estorno.
CREATE OR REPLACE FUNCTION public.comissao_lancamentos_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'comissao_lancamentos é imutável: lançamento não pode ser apagado (crie um estorno vinculado ao original)';
  END IF;

  -- Fechado = congelado.
  IF OLD.fechado_em IS NOT NULL OR OLD.fechamento_id IS NOT NULL THEN
    RAISE EXCEPTION 'comissao_lancamentos é imutável: lançamento fechado não pode ser alterado (crie um ajuste/estorno para o próximo fechamento)';
  END IF;

  -- Preenchimento inicial do fechamento: os dois campos juntos, nada além deles muda na mesma operação.
  IF NEW.fechado_em IS NOT NULL OR NEW.fechamento_id IS NOT NULL THEN
    IF NEW.fechado_em IS NULL OR NEW.fechamento_id IS NULL THEN
      RAISE EXCEPTION 'comissao_lancamentos: fechado_em e fechamento_id devem ser preenchidos juntos';
    END IF;
    IF (to_jsonb(NEW) - 'fechado_em' - 'fechamento_id' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'fechado_em' - 'fechamento_id' - 'updated_at') THEN
      RAISE EXCEPTION 'comissao_lancamentos: o fechamento não pode alterar mais nada além de fechado_em/fechamento_id';
    END IF;
    IF NEW.tipo = 'comissao' AND NEW.status <> 'confirmada' THEN
      RAISE EXCEPTION 'comissao_lancamentos: só comissão confirmada entra em fechamento (status atual: %)', NEW.status;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Identidade e histórico nunca mudam.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.cobranca_id IS DISTINCT FROM OLD.cobranca_id
     OR NEW.beneficiario_id IS DISTINCT FROM OLD.beneficiario_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.competencia IS DISTINCT FROM OLD.competencia
     OR NEW.percentual_aplicado IS DISTINCT FROM OLD.percentual_aplicado
     OR NEW.lancamento_origem_id IS DISTINCT FROM OLD.lancamento_origem_id
     OR NEW.motivo IS DISTINCT FROM OLD.motivo
     OR NEW.marcado_por IS DISTINCT FROM OLD.marcado_por
     OR NEW.marcado_em IS DISTINCT FROM OLD.marcado_em
     OR NEW.unidade_id IS DISTINCT FROM OLD.unidade_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'comissao_lancamentos é imutável: identidade, competência, percentual aplicado e origem não podem ser alterados';
  END IF;

  -- Valor: só a comissão acompanha a cobrança (sincronização), e só antes do fechamento. Ajuste/estorno nunca mudam de valor.
  IF NEW.base_valor IS DISTINCT FROM OLD.base_valor OR NEW.valor_comissao IS DISTINCT FROM OLD.valor_comissao THEN
    IF OLD.tipo <> 'comissao' THEN
      RAISE EXCEPTION 'comissao_lancamentos é imutável: valor de ajuste/estorno não pode mudar (crie um ajuste)';
    END IF;
  END IF;

  -- Status: só as transições controladas abaixo (cancelada e recusada são finais; ajuste/estorno não mudam de status).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.tipo <> 'comissao' THEN
      RAISE EXCEPTION 'comissao_lancamentos é imutável: ajuste/estorno não muda de status';
    END IF;
    IF NOT (
      (OLD.status = 'prevista'            AND NEW.status IN ('confirmada', 'cancelada', 'contestada')) OR
      (OLD.status = 'confirmada'          AND NEW.status IN ('prevista', 'cancelada', 'contestada')) OR
      (OLD.status = 'retroativo_pendente' AND NEW.status IN ('prevista', 'confirmada', 'recusada', 'cancelada')) OR
      (OLD.status = 'contestada'          AND NEW.status IN ('prevista', 'confirmada', 'cancelada'))
    ) THEN
      RAISE EXCEPTION 'comissao_lancamentos: transição de status inválida (% -> %)', OLD.status, NEW.status;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── 3) Trigger do fechamento: nunca apaga, nunca reabre; o pagamento entra uma única vez ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.comissao_fechamentos_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'comissao_fechamentos é imutável: fechamento não pode ser apagado';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.competencia IS DISTINCT FROM OLD.competencia
     OR NEW.unidade_id IS DISTINCT FROM OLD.unidade_id
     OR NEW.fechado_por IS DISTINCT FROM OLD.fechado_por
     OR NEW.fechado_em IS DISTINCT FROM OLD.fechado_em
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.qtd_lancamentos IS DISTINCT FROM OLD.qtd_lancamentos
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'comissao_fechamentos é imutável: competência, total e dados do fechamento não podem ser alterados';
  END IF;
  IF OLD.pago_em IS NOT NULL THEN
    IF NEW.pago_em IS DISTINCT FROM OLD.pago_em
       OR NEW.pago_registrado_por IS DISTINCT FROM OLD.pago_registrado_por
       OR NEW.pago_registrado_em IS DISTINCT FROM OLD.pago_registrado_em THEN
      RAISE EXCEPTION 'comissao_fechamentos: pagamento já registrado não pode ser desfeito nem alterado (corrija por ajuste no fechamento seguinte)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comissao_fechamentos_guard
  BEFORE UPDATE OR DELETE ON public.comissao_fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.comissao_fechamentos_guard();

-- ── 4) Fechar o mês: transação única, idempotente e com trava ──────────────────────────────────────────────────────────────
-- Devolve jsonb:
--   {ok:true,  ja_existia:bool, fechamento_id, total, qtd}                        (clicar duas vezes devolve o mesmo fechamento)
--   {ok:false, codigo:'bloqueado', bloqueios:[{id,status,competencia,cobranca_id}]}   retroativo_pendente/contestada com competência <= mês
--   {ok:false, codigo:'nada_para_fechar'} | 'mes_futuro' | 'fechamento_posterior' | 'unidade_invalida' | 'mudou_desde_a_previa' (+ qtd,total atuais)
-- p_esperado_qtd / p_esperado_total vêm da prévia que a diretoria viu: se o conjunto mudou desde então, aborta o fechamento INTEIRO
-- (nada é gravado). As linhas candidatas são travadas (FOR UPDATE) até o fim da transação, então nada muda no meio.
CREATE OR REPLACE FUNCTION public.comissao_fechar_mes(
  p_competencia date,
  p_unidade uuid,
  p_usuario uuid,
  p_esperado_qtd integer DEFAULT NULL,
  p_esperado_total numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_atual date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
  v_exist public.comissao_fechamentos%ROWTYPE;
  v_bloqueios jsonb;
  v_ids uuid[];
  v_aj uuid[];
  v_todos uuid[];
  v_qtd integer;
  v_total numeric;
  v_id uuid;
  v_atualizados integer;
BEGIN
  IF p_competencia IS NULL OR EXTRACT(DAY FROM p_competencia) <> 1 THEN
    RAISE EXCEPTION 'competência deve ser o 1º dia do mês';
  END IF;

  -- Unidade nula ou inexistente: resposta clara, sem lock, sem consulta e sem gravar nada.
  IF p_unidade IS NULL OR NOT EXISTS (SELECT 1 FROM public.unidades WHERE id = p_unidade) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'unidade_invalida');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('comissao_fechar:' || p_unidade::text || ':' || p_competencia::text, 0));

  SELECT * INTO v_exist FROM public.comissao_fechamentos WHERE competencia = p_competencia AND unidade_id = p_unidade;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ja_existia', true, 'fechamento_id', v_exist.id, 'total', v_exist.total, 'qtd', v_exist.qtd_lancamentos);
  END IF;

  IF p_competencia > v_atual THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'mes_futuro');
  END IF;
  -- Um mês anterior não pode ser fechado depois de um posterior: o posterior já varreu o que estava confirmado.
  IF EXISTS (SELECT 1 FROM public.comissao_fechamentos WHERE unidade_id = p_unidade AND competencia > p_competencia) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'fechamento_posterior');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status, 'competencia', competencia, 'cobranca_id', cobranca_id) ORDER BY competencia, id), '[]'::jsonb)
    INTO v_bloqueios
  FROM public.comissao_lancamentos
  WHERE unidade_id = p_unidade AND tipo = 'comissao' AND status IN ('retroativo_pendente', 'contestada') AND competencia <= p_competencia;
  IF jsonb_array_length(v_bloqueios) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'bloqueado', 'bloqueios', v_bloqueios);
  END IF;

  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT id FROM public.comissao_lancamentos
    WHERE unidade_id = p_unidade AND tipo = 'comissao' AND status = 'confirmada' AND fechamento_id IS NULL AND competencia <= p_competencia
    ORDER BY id FOR UPDATE
  ) s;

  SELECT array_agg(s.id) INTO v_aj FROM (
    SELECT a.id FROM public.comissao_lancamentos a
    JOIN public.comissao_lancamentos o ON o.id = a.lancamento_origem_id
    WHERE a.unidade_id = p_unidade AND a.tipo IN ('ajuste', 'estorno') AND a.fechamento_id IS NULL AND a.competencia <= p_competencia
      AND (o.fechamento_id IS NOT NULL OR o.id = ANY (coalesce(v_ids, '{}'::uuid[])))
    ORDER BY a.id FOR UPDATE OF a
  ) s;

  v_todos := coalesce(v_ids, '{}'::uuid[]) || coalesce(v_aj, '{}'::uuid[]);
  v_qtd := cardinality(v_todos);
  IF v_qtd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'nada_para_fechar');
  END IF;
  SELECT coalesce(sum(valor_comissao), 0) INTO v_total FROM public.comissao_lancamentos WHERE id = ANY (v_todos);

  IF (p_esperado_qtd IS NOT NULL AND p_esperado_qtd <> v_qtd) OR (p_esperado_total IS NOT NULL AND p_esperado_total <> v_total) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'mudou_desde_a_previa', 'qtd', v_qtd, 'total', v_total);
  END IF;

  INSERT INTO public.comissao_fechamentos (competencia, unidade_id, fechado_por, total, qtd_lancamentos)
  VALUES (p_competencia, p_unidade, p_usuario, v_total, v_qtd)
  RETURNING id INTO v_id;

  UPDATE public.comissao_lancamentos SET fechamento_id = v_id, fechado_em = now() WHERE id = ANY (v_todos);
  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  IF v_atualizados <> v_qtd THEN
    RAISE EXCEPTION 'fechamento abortado: % lançamentos atualizados, % esperados', v_atualizados, v_qtd;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ja_existia', false, 'fechamento_id', v_id, 'total', v_total, 'qtd', v_qtd);
END;
$$;

-- A função muda dados: só o service_role (a aplicação, depois do portão exigirDiretoria) executa. ATENÇÃO: no Supabase, função nova em
-- public já nasce com EXECUTE explícito para anon e authenticated (ALTER DEFAULT PRIVILEGES do projeto); "FROM PUBLIC" sozinho NÃO
-- remove isso, então anon e authenticated são revogados pelo nome. Os dois triggers também não precisam ser chamáveis por ninguém
-- (o gatilho dispara sem exigir EXECUTE de quem grava).
REVOKE ALL ON FUNCTION public.comissao_fechar_mes(date, uuid, uuid, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comissao_fechar_mes(date, uuid, uuid, integer, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.comissao_lancamentos_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comissao_fechamentos_guard() FROM PUBLIC, anon, authenticated;

-- ── 5) RLS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.comissao_fechamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role total comissao_fechamentos" ON public.comissao_fechamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
