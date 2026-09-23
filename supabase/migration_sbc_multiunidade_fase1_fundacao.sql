-- Fase 1 do retrofit multi-unidade (SBC): cria a tabela raiz "unidades" e vincula cada
-- analista a uma unidade, com excecao de acesso corporativo pra diretoria/superuser (hoje:
-- Olver, Elizabete Salmazo, Lucas Miguel, Andreza Salmazo), que precisam enxergar as duas
-- unidades ao mesmo tempo por serem socios de SBC — confirmado com o Olver, 23/09.
-- Nenhum codigo le essas colunas ainda (isso so passa a valer na Fase 3) — zero mudanca de
-- comportamento pra Monte Mor/Hortolandia.
CREATE TABLE IF NOT EXISTS unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO unidades (slug, nome, ativa) VALUES
  ('monte-mor-hortolandia', 'Monte Mor / Hortolândia', true),
  ('sbc', 'São Bernardo do Campo', false)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE analistas_perfil
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES unidades(id),
  ADD COLUMN IF NOT EXISTS acesso_todas_unidades boolean NOT NULL DEFAULT false;

UPDATE analistas_perfil
SET unidade_id = (SELECT id FROM unidades WHERE slug = 'monte-mor-hortolandia')
WHERE unidade_id IS NULL;

ALTER TABLE analistas_perfil
  ALTER COLUMN unidade_id SET NOT NULL;

-- Diretoria e superuser sempre enxergam todas as unidades — regra de acesso corporativo,
-- nao uma lista fixa de nomes (assim um futuro membro de diretoria ja nasce com o acesso).
UPDATE analistas_perfil
SET acesso_todas_unidades = true
WHERE nivel_acesso IN ('diretoria', 'superuser');
