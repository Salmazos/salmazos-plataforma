-- Migração: Módulo de Admissão Digital
-- Execute este SQL no SQL Editor do Supabase

-- ── 1) admissoes ─────────────────────────────────────────────
CREATE TABLE public.admissoes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id         UUID NOT NULL REFERENCES public.candidatos(id),
  vaga_id              UUID REFERENCES public.vagas(id) ON DELETE SET NULL,
  modalidade           TEXT NOT NULL CHECK (modalidade IN ('MOT', 'terceirizacao')),
  status               TEXT NOT NULL DEFAULT 'aguardando_candidato'
                         CHECK (status IN (
                           'aguardando_candidato', 'em_preenchimento', 'aguardando_analise',
                           'em_analise', 'aprovado', 'enviado_contabilidade'
                         )),
  token                UUID NOT NULL DEFAULT gen_random_uuid(),
  token_expira_em      TIMESTAMPTZ NOT NULL,
  token_usado_em       TIMESTAMPTZ,
  criado_por           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacoes_internas TEXT
);

CREATE UNIQUE INDEX admissoes_token_idx ON public.admissoes (token);
CREATE INDEX admissoes_candidato_id_idx ON public.admissoes (candidato_id);
CREATE INDEX admissoes_status_idx ON public.admissoes (status);

CREATE TRIGGER admissoes_updated_at
  BEFORE UPDATE ON public.admissoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.admissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem admissoes"
  ON public.admissoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem admissoes"
  ON public.admissoes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados atualizam admissoes"
  ON public.admissoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total admissoes"
  ON public.admissoes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2) admissao_dados_pessoais ───────────────────────────────
CREATE TABLE public.admissao_dados_pessoais (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id               UUID NOT NULL UNIQUE REFERENCES public.admissoes(id) ON DELETE CASCADE,
  nome_completo             TEXT,
  data_nascimento           DATE,
  sexo                      TEXT CHECK (sexo IN ('M', 'F')),
  estado_civil              TEXT CHECK (estado_civil IN ('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel')),
  nacionalidade             TEXT DEFAULT 'Brasileira',
  naturalidade              TEXT,
  cpf                       TEXT,
  rg_numero                 TEXT,
  rg_orgao_emissor          TEXT,
  rg_uf                     TEXT,
  rg_data_emissao           DATE,
  titulo_eleitor            TEXT,
  zona_eleitoral            TEXT,
  secao_eleitoral           TEXT,
  pis_pasep                 TEXT,
  carteira_trabalho_numero  TEXT,
  carteira_trabalho_serie   TEXT,
  carteira_trabalho_uf      TEXT,
  cnh_numero                TEXT,
  cnh_categoria             TEXT,
  cnh_validade              DATE,
  reservista                TEXT,
  nome_mae                  TEXT,
  nome_pai                  TEXT,
  grau_instrucao            TEXT CHECK (grau_instrucao IN (
                               'fundamental_incompleto', 'fundamental_completo',
                               'medio_incompleto', 'medio_completo',
                               'superior_incompleto', 'superior_completo', 'pos_graduacao'
                             )),
  endereco_cep              TEXT,
  endereco_logradouro       TEXT,
  endereco_numero           TEXT,
  endereco_complemento      TEXT,
  endereco_bairro           TEXT,
  endereco_cidade           TEXT,
  endereco_uf               TEXT,
  telefone                  TEXT,
  email                     TEXT,
  banco                     TEXT,
  agencia                   TEXT,
  conta                     TEXT,
  tipo_conta                TEXT CHECK (tipo_conta IN ('corrente', 'poupanca')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER admissao_dados_pessoais_updated_at
  BEFORE UPDATE ON public.admissao_dados_pessoais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.admissao_dados_pessoais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total dados pessoais"
  ON public.admissao_dados_pessoais FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total dados pessoais"
  ON public.admissao_dados_pessoais FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3) admissao_dependentes ──────────────────────────────────
CREATE TABLE public.admissao_dependentes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id      UUID NOT NULL REFERENCES public.admissoes(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  parentesco       TEXT CHECK (parentesco IN ('filho', 'filha', 'conjuge', 'outro')),
  data_nascimento  DATE,
  cpf              TEXT,
  nome_mae         TEXT,
  cpf_mae          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admissao_dependentes_admissao_id_idx ON public.admissao_dependentes (admissao_id);

ALTER TABLE public.admissao_dependentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total dependentes"
  ON public.admissao_dependentes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total dependentes"
  ON public.admissao_dependentes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4) admissao_documentos ───────────────────────────────────
CREATE TABLE public.admissao_documentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id       UUID NOT NULL REFERENCES public.admissoes(id) ON DELETE CASCADE,
  tipo_documento    TEXT NOT NULL CHECK (tipo_documento IN (
                       'ctps_todas_paginas', 'foto_3x4', 'cpf', 'titulo_eleitor', 'cartao_sus',
                       'rg', 'reservista', 'certidao_civil', 'comprovante_escolaridade', 'pis_pasep',
                       'comprovante_endereco', 'cnh', 'certidao_nascimento_filho', 'cpf_dependentes',
                       'caderneta_vacinacao', 'frequencia_escolar'
                     )),
  storage_path      TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'aprovado', 'rejeitado')),
  motivo_rejeicao   TEXT,
  obrigatorio       BOOLEAN NOT NULL DEFAULT true,
  condicional       TEXT CHECK (condicional IN ('masculino', 'motorista', 'dependente')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admissao_documentos_admissao_id_idx ON public.admissao_documentos (admissao_id);

CREATE TRIGGER admissao_documentos_updated_at
  BEFORE UPDATE ON public.admissao_documentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.admissao_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados acesso total documentos admissao"
  ON public.admissao_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role total documentos admissao"
  ON public.admissao_documentos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5) storage bucket 'admissao-docs' ────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admissao-docs',
  'admissao-docs',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Autenticados leem admissao-docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'admissao-docs');

CREATE POLICY "Autenticados enviam admissao-docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'admissao-docs');

CREATE POLICY "Service role storage admissao-docs"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'admissao-docs')
  WITH CHECK (bucket_id = 'admissao-docs');
