-- Fase 2a — base do sistema central de exceção de acesso por pessoa × aba.
-- Generaliza o padrão já usado em cobranca_rs_analistas_acesso (uma tabela dedicada por
-- módulo) para uma única tabela cobrindo qualquer aba, identificada por chave_aba (ver
-- src/lib/abasConfig.ts para a lista canônica). Regra de negócio: exceção individual
-- (liberado=true ou liberado=false) sempre vence sobre o comportamento de papel padrão;
-- sem linha aqui, cai no comportamento de hoje, inalterado (ver podeAcessarAba em
-- src/lib/acessoCustomizadoAuth.ts). Nenhum módulo existente foi migrado para usar esta
-- tabela ainda — é só a peça nova, isolada, adotada módulo a módulo depois.

CREATE TABLE usuario_acesso_customizado (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analista_perfil_id  UUID NOT NULL REFERENCES analistas_perfil(id) ON DELETE CASCADE,
  chave_aba           TEXT NOT NULL,
  liberado            BOOLEAN NOT NULL,
  criado_por_user_id  UUID REFERENCES auth.users(id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analista_perfil_id, chave_aba)
);

CREATE OR REPLACE FUNCTION set_atualizado_em_acesso_customizado()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usuario_acesso_customizado_atualizado_em
  BEFORE UPDATE ON usuario_acesso_customizado
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em_acesso_customizado();

-- Tabela mais sensível da plataforma (decide acesso a tudo mais) — diferente do padrão
-- "Autenticados acesso total" usado em cobranca_rs_analistas_acesso, aqui RLS só libera o
-- service role. Toda leitura/escrita real passa pelas rotas de API (gate checarPapelSuperuser
-- + createServiceClient), então bloquear a chave anon/authenticated por completo não quebra
-- nada do fluxo normal — só fecha a porta de acesso direto via client anon key.
ALTER TABLE usuario_acesso_customizado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all"
  ON usuario_acesso_customizado
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_usuario_acesso_customizado_analista ON usuario_acesso_customizado(analista_perfil_id);
