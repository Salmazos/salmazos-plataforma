-- Migração: Documentos da Contabilidade (Parte 2 — upload em lote + matching + merge +
-- assinatura eletrônica dos 7 documentos que a contabilidade prepara: Ficha de Registro,
-- Modelo Contrato Temporário, Acordo de HS/Decl. VT, Termo de Consentimento (LGPD),
-- Ficha de IR, Ficha de Salário Família, Termo de Responsabilidade).
--
-- Só 1 arquivo por tipo_documento (ao contrário de admissao_documentos, que permite
-- múltiplos arquivos pra tipos condicionados a "dependente") — por isso o UNIQUE
-- (admissao_id, tipo_documento), que permite upsert direto na confirmação do upload.
--
-- Sem policy de candidato/token — equipe interna apenas (nenhuma rota pública toca
-- nesta tabela; contabilidade envia os PDFs por fora do portal, a equipe da Salmazos é
-- quem faz o upload em lote no painel).
--
-- Execute este SQL no SQL Editor do Supabase.

CREATE TABLE public.admissao_documentos_contabilidade (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id    UUID NOT NULL REFERENCES public.admissoes(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN (
                    'ficha_registro', 'modelo_contrato', 'acordo_hs_vt', 'termo_lgpd',
                    'ficha_ir', 'salario_familia', 'termo_responsabilidade'
                  )),
  storage_path   TEXT NOT NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (admissao_id, tipo_documento)
);

CREATE INDEX admissao_documentos_contabilidade_admissao_id_idx ON public.admissao_documentos_contabilidade (admissao_id);

ALTER TABLE public.admissao_documentos_contabilidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total documentos contabilidade"
  ON public.admissao_documentos_contabilidade FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total documentos contabilidade"
  ON public.admissao_documentos_contabilidade FOR ALL TO service_role USING (true) WITH CHECK (true);
