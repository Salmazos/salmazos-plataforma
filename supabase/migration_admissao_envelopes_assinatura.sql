-- Migração: tabela única de envelopes de assinatura (Clicksign), substituindo o modelo
-- singular hoje espalhado em admissoes.assinatura_* (que só suportava 1 envelope por
-- admissão). Passa a existir 1 linha por (admissao_id, tipo_pacote) — 'interno' é o
-- pacote já existente (Ficha Cadastral + Autorização Sindical + Solicitação de VT);
-- 'contabilidade' é o novo pacote montado a partir dos documentos enviados pela
-- contabilidade (ver migration_admissao_documentos_contabilidade.sql).
--
-- As colunas antigas em admissoes (metodo_assinatura, assinatura_provedor,
-- assinatura_documento_externo_id, assinatura_em, assinatura_path) NÃO são removidas
-- aqui de propósito — ficam depreciadas, mantidas só para rollback seguro. Todo código
-- novo lê/grava exclusivamente na tabela nova.
--
-- Execute este SQL no SQL Editor do Supabase.

CREATE TABLE public.admissao_envelopes_assinatura (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id           UUID NOT NULL REFERENCES public.admissoes(id) ON DELETE CASCADE,
  tipo_pacote           TEXT NOT NULL CHECK (tipo_pacote IN ('interno', 'contabilidade')),
  documento_externo_id  TEXT,
  status                TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'assinado', 'cancelado')),
  assinado_em           TIMESTAMPTZ,
  path                  TEXT,
  provedor              TEXT NOT NULL DEFAULT 'clicksign',
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (admissao_id, tipo_pacote)
);

CREATE INDEX admissao_envelopes_assinatura_admissao_id_idx ON public.admissao_envelopes_assinatura (admissao_id);
-- Usado pelo webhook da Clicksign pra rotear o evento de conclusão direto pra linha certa
-- (ver lib/clicksign.ts / webhooks/clicksign/route.ts) sem precisar varrer por admissao_id.
CREATE INDEX admissao_envelopes_assinatura_documento_externo_id_idx ON public.admissao_envelopes_assinatura (documento_externo_id);

ALTER TABLE public.admissao_envelopes_assinatura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total envelopes assinatura"
  ON public.admissao_envelopes_assinatura FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total envelopes assinatura"
  ON public.admissao_envelopes_assinatura FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Backfill: migra o envelope 'interno' já existente em admissoes ─────────────────
-- documento_externo_id precisa ser o DOCUMENT id da Clicksign (o que volta em
-- payload.document.key no webhook), não o ENVELOPE id — admissoes.assinatura_documento_
-- externo_id guardava o envelope id (nome da coluna sempre foi impreciso; o roteamento
-- do webhook nunca dependeu dele, só de metadata.admissao_id). Corrige isso no backfill:
-- busca o document_id real em audit_logs (gravado por
-- /api/admissoes/assinatura-clicksign/criar em "admissao_assinatura_clicksign_criada");
-- se não achar log (registro anterior à auditoria, ou perdido), cai pro envelope id
-- antigo como último recurso — pior caso é o roteamento por ID falhar pra ESSA linha
-- legada específica e cair no fallback por metadata.admissao_id, que continua existindo
-- no webhook justamente por causa desse cenário.
INSERT INTO public.admissao_envelopes_assinatura
  (admissao_id, tipo_pacote, documento_externo_id, status, assinado_em, path, provedor, criado_em)
SELECT
  a.id,
  'interno',
  COALESCE(
    (
      SELECT al.detalhes ->> 'document_id'
      FROM public.audit_logs al
      WHERE al.entidade = 'admissoes'
        AND al.entidade_id = a.id::text
        AND al.acao = 'admissao_assinatura_clicksign_criada'
      ORDER BY al.created_at DESC
      LIMIT 1
    ),
    a.assinatura_documento_externo_id
  ),
  CASE WHEN a.assinatura_em IS NOT NULL THEN 'assinado' ELSE 'pendente' END,
  a.assinatura_em,
  a.assinatura_path,
  COALESCE(a.assinatura_provedor, 'clicksign'),
  NOW()
FROM public.admissoes a
WHERE a.assinatura_documento_externo_id IS NOT NULL;
