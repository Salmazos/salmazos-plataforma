-- Comissão de analistas — FASE 1 (marcação + visão do analista + visão da diretoria).
-- Fase 2 (fechamento mensal / folha) NÃO está aqui. Migração ADITIVA: uma coluna nova em cobrancas_rs e duas tabelas novas;
-- nenhum fluxo existente muda. NÃO aplicada: aguarda o OK do Olver (aplicar com mcp__Supabase__apply_migration no projeto
-- ktzgjthxfpeemlgqynsk, nunca em branch paga).
--
-- Regra de negócio (decidida pelo Olver): comissão = percentual do beneficiário (começa 5% para Giovanni Prado) sobre o
-- fee_valor BRUTO da cobrança R&S. O beneficiário MARCA a cobrança; o sistema nunca deduz por vaga.responsavel. Ledger
-- imutável: lançamento nunca é apagado nem tem valor reescrito por ninguém — só a sincronização com a cobrança (valor, enquanto
-- não houver fechamento) e transições controladas de status; correções entram como lançamento novo de ajuste/estorno.

-- ── 1) Data/hora da validação da diretoria ───────────────────────────────────────────────────────────────────────────
-- cobrancas_rs.enviado_em (quando foi enviada para validação = transição para aprovada_enviada, gravado em
-- /api/cobrancas-rs/[id]/aprovar) JÁ EXISTE. A validação (aprovada_enviada -> validada, ao definir o vencimento em
-- /api/cobrancas-rs/[id]/vencimento) não tinha coluna: validada_em passa a ser preenchida por essa rota daqui para frente.
-- SEM backfill inventado: cobranças validadas/pagas antes desta migração ficam com validada_em NULL (o status já prova que
-- foram validadas; a tela só deixa de mostrar a data). Se o Olver quiser, existe um backfill opcional pelo audit_logs
-- (comentado no fim deste arquivo) — a data só é provável, não exata.
ALTER TABLE public.cobrancas_rs ADD COLUMN IF NOT EXISTS validada_em timestamptz;

-- ── 2) Beneficiários ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.comissao_beneficiarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analista_perfil_id uuid NOT NULL UNIQUE REFERENCES public.analistas_perfil(id),
  -- Percentual por beneficiário (nunca fixo no código). Vale para marcações NOVAS; o lançamento guarda o percentual aplicado.
  percentual         numeric(5,2) NOT NULL DEFAULT 5 CHECK (percentual >= 0 AND percentual <= 100),
  ativo              boolean NOT NULL DEFAULT true,
  unidade_id         uuid NOT NULL DEFAULT public.unidade_padrao() REFERENCES public.unidades(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── 3) Lançamentos (ledger) ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.comissao_lancamentos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id            uuid NOT NULL REFERENCES public.cobrancas_rs(id),
  beneficiario_id        uuid NOT NULL REFERENCES public.comissao_beneficiarios(id),
  tipo                   text NOT NULL CHECK (tipo IN ('comissao', 'ajuste', 'estorno')),
  status                 text NOT NULL CHECK (status IN ('prevista', 'confirmada', 'retroativo_pendente', 'contestada', 'cancelada', 'recusada')),
  -- 1º dia do mês de competência (mês, em America/Sao_Paulo, em que a cobrança foi ENVIADA para validação).
  competencia            date NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
  base_valor             numeric(12,2),
  percentual_aplicado    numeric(5,2),
  -- Em ajuste/estorno é o valor assinado do ajuste (estorno sempre negativo). O total é a soma assinada dos lançamentos.
  valor_comissao         numeric(12,2) NOT NULL,
  lancamento_origem_id   uuid REFERENCES public.comissao_lancamentos(id),
  motivo                 text,
  marcado_por            uuid REFERENCES auth.users(id),
  marcado_em             timestamptz NOT NULL DEFAULT now(),
  decidido_por           uuid REFERENCES auth.users(id),
  decidido_em            timestamptz,
  contestado_por         uuid REFERENCES auth.users(id),
  contestado_em          timestamptz,
  contestacao_motivo     text,
  status_antes_contestacao text,
  resolvido_por          uuid REFERENCES auth.users(id),
  resolvido_em           timestamptz,
  resolucao_nota         text,
  -- Reservado para a Fase 2 (fechamento mensal): preenchido só quando o mês for fechado. Enquanto NULL, o valor do
  -- lançamento de comissão acompanha a cobrança (ex.: correção de taxa). Nada na Fase 1 escreve nesta coluna.
  fechado_em             timestamptz,
  unidade_id             uuid NOT NULL DEFAULT public.unidade_padrao() REFERENCES public.unidades(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comissao_lanc_comissao_campos CHECK (
    tipo <> 'comissao' OR (base_valor IS NOT NULL AND percentual_aplicado IS NOT NULL AND lancamento_origem_id IS NULL)
  ),
  CONSTRAINT comissao_lanc_ajuste_campos CHECK (
    tipo = 'comissao' OR (lancamento_origem_id IS NOT NULL AND length(btrim(coalesce(motivo, ''))) > 0 AND status = 'confirmada')
  ),
  CONSTRAINT comissao_lanc_sinais CHECK (
    (tipo <> 'estorno' OR valor_comissao < 0) AND (tipo <> 'ajuste' OR valor_comissao <> 0) AND (tipo <> 'comissao' OR valor_comissao >= 0)
  )
);

CREATE INDEX idx_comissao_lanc_beneficiario_competencia ON public.comissao_lancamentos (beneficiario_id, competencia);
CREATE INDEX idx_comissao_lanc_cobranca ON public.comissao_lancamentos (cobranca_id);
CREATE INDEX idx_comissao_lanc_origem ON public.comissao_lancamentos (lancamento_origem_id) WHERE lancamento_origem_id IS NOT NULL;

-- Marcação dupla bloqueada no banco: no máximo UMA comissão ativa por cobrança (e, por consequência, por beneficiário+cobrança).
-- Cancelada/recusada saem do índice, então desmarcar e marcar de novo é possível (cria outro lançamento, sem reescrever o antigo).
CREATE UNIQUE INDEX uq_comissao_ativa_beneficiario_cobranca ON public.comissao_lancamentos (beneficiario_id, cobranca_id)
  WHERE tipo = 'comissao' AND status NOT IN ('cancelada', 'recusada');
CREATE UNIQUE INDEX uq_comissao_ativa_cobranca ON public.comissao_lancamentos (cobranca_id)
  WHERE tipo = 'comissao' AND status NOT IN ('cancelada', 'recusada');

-- ── 4) Imutabilidade do ledger ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comissao_lancamentos_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'comissao_lancamentos é imutável: lançamento não pode ser apagado (crie um estorno vinculado ao original)';
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
    IF OLD.tipo <> 'comissao' OR OLD.fechado_em IS NOT NULL THEN
      RAISE EXCEPTION 'comissao_lancamentos é imutável: valor de ajuste/estorno ou de lançamento fechado não pode mudar (crie um ajuste)';
    END IF;
  END IF;

  IF OLD.fechado_em IS NOT NULL AND NEW.fechado_em IS DISTINCT FROM OLD.fechado_em THEN
    RAISE EXCEPTION 'comissao_lancamentos é imutável: fechamento não pode ser desfeito';
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

CREATE TRIGGER trg_comissao_lancamentos_guard
  BEFORE UPDATE OR DELETE ON public.comissao_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.comissao_lancamentos_guard();

-- ── 5) RLS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Dado de remuneração: SÓ service_role (a aplicação lê/grava pelo createServiceClient e decide quem vê o quê). Diferente de
-- tabelas de operação, NÃO há política "authenticated" — um analista com o token dele não consegue ler comissão alheia direto
-- pela API REST do Supabase.
ALTER TABLE public.comissao_beneficiarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role total comissao_beneficiarios" ON public.comissao_beneficiarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role total comissao_lancamentos" ON public.comissao_lancamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6) Beneficiário inicial ───────────────────────────────────────────────────────────────────────────────────────────
-- Giovanni Prado, 5%. Nome exato de analistas_perfil; se não existir/ativo, não insere nada.
INSERT INTO public.comissao_beneficiarios (analista_perfil_id, percentual, ativo, unidade_id)
SELECT id, 5, true, unidade_id
FROM public.analistas_perfil
WHERE nome_completo = 'Giovanni Prado' AND ativo = true
ON CONFLICT (analista_perfil_id) DO NOTHING;

-- ── Backfill OPCIONAL de validada_em (NÃO executado; só se o Olver quiser) ───────────────────────────────────────────────
-- Usa a 1ª vez que o vencimento foi definido no audit_logs. É aproximado: se o vencimento foi apagado e redefinido, a data
-- real da validação pode ser posterior. Na consulta feita antes de escrever esta migração, 16 das 19 cobranças validadas/pagas tinham esse registro.
-- UPDATE public.cobrancas_rs c SET validada_em = a.primeira
-- FROM (
--   SELECT entidade_id::uuid AS cobranca_id, min(created_at) AS primeira
--   FROM public.audit_logs
--   WHERE entidade = 'cobrancas_rs' AND acao = 'cobranca_rs_vencimento_definido' AND detalhes->>'data_vencimento' IS NOT NULL
--   GROUP BY entidade_id
-- ) a
-- WHERE a.cobranca_id = c.id AND c.status IN ('validada', 'paga') AND c.validada_em IS NULL;
