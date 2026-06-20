-- ──────────────────────────────────────────────────────────────
-- Salmazos RH & Serviços — Schema do Supabase
-- Execute este script no SQL Editor do painel do Supabase
-- ──────────────────────────────────────────────────────────────

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tabela de candidatos ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidatos (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome_completo       TEXT NOT NULL,
  cpf                 TEXT NOT NULL UNIQUE,
  telefone            TEXT NOT NULL,
  email               TEXT NOT NULL,
  cidade              TEXT NOT NULL,
  estado              TEXT NOT NULL,
  cargo_pretendido    TEXT NOT NULL,
  tempo_experiencia   TEXT NOT NULL,
  turno_disponivel    TEXT NOT NULL,
  pretensao_salarial  TEXT,
  habilidades         TEXT[]  DEFAULT '{}',
  resumo_profissional TEXT,
  curriculo_url       TEXT,
  etapa_kanban        TEXT    NOT NULL DEFAULT 'triagem'
                        CHECK (etapa_kanban IN ('triagem','entrevista_salmazos','entrevista_cliente','aprovado_cliente')),
  origem              TEXT    NOT NULL DEFAULT 'Banco de talentos',
  anotacoes           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidatos_updated_at
  BEFORE UPDATE ON candidatos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode inserir um candidato (cadastro público)
CREATE POLICY "Inserção pública de candidatos"
  ON candidatos FOR INSERT
  WITH CHECK (true);

-- Apenas usuários autenticados (recrutadores) podem ler
CREATE POLICY "Leitura restrita a autenticados"
  ON candidatos FOR SELECT
  USING (auth.role() = 'authenticated');

-- Apenas autenticados podem atualizar
CREATE POLICY "Atualização restrita a autenticados"
  ON candidatos FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ── Storage bucket para currículos ────────────────────────────
-- Execute no SQL Editor do Supabase:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'curriculos',
  'curriculos',
  true,
  5242880,           -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Política: qualquer pessoa pode fazer upload de PDF
CREATE POLICY "Upload público de currículos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'curriculos');

-- Política: qualquer pessoa pode ler (URL pública)
CREATE POLICY "Leitura pública de currículos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'curriculos');

-- ──────────────────────────────────────────────────────────────
-- MIGRATION: Clientes e Encaminhamentos
-- Execute este bloco separadamente após criar o schema inicial
-- ──────────────────────────────────────────────────────────────

-- ── Tabela de clientes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome             TEXT NOT NULL,
  contato_nome     TEXT NOT NULL,
  contato_telefone TEXT NOT NULL,
  contato_email    TEXT NOT NULL,
  cidade           TEXT NOT NULL,
  segmento         TEXT NOT NULL,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de clientes por autenticados"
  ON clientes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Inserção de clientes por autenticados"
  ON clientes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Atualização de clientes por autenticados"
  ON clientes FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ── Tabela de encaminhamentos ─────────────────────────────────
CREATE TABLE IF NOT EXISTS encaminhamentos (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  candidato_id     UUID NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES clientes(id)   ON DELETE RESTRICT,
  data_entrevista  DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'aguardando'
                     CHECK (status IN ('aguardando','aprovado','reprovado','desistiu')),
  observacoes      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reaproveita a função set_updated_at já criada
CREATE TRIGGER encaminhamentos_updated_at
  BEFORE UPDATE ON encaminhamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE encaminhamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de encaminhamentos por autenticados"
  ON encaminhamentos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Inserção de encaminhamentos por autenticados"
  ON encaminhamentos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Atualização de encaminhamentos por autenticados"
  ON encaminhamentos FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────
-- MIGRATION: Tipos de serviço por cliente
-- Execute este bloco após a migration anterior
-- ──────────────────────────────────────────────────────────────

-- Adiciona coluna de serviços na tabela clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS servicos TEXT[] NOT NULL DEFAULT '{}';

-- Adiciona coluna de tipo de serviço em encaminhamentos
ALTER TABLE encaminhamentos
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT;

-- ──────────────────────────────────────────────────────────────
-- MIGRATION: Responsável pelo candidato
-- Execute este bloco após a migration anterior
-- ──────────────────────────────────────────────────────────────

ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS responsavel TEXT;

ALTER TABLE candidatos_vagas
  ADD COLUMN IF NOT EXISTS responsavel TEXT;
