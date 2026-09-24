-- Fase 3 SBC — Carteira de Clientes (empresas_visitadas) por unidade. Aplicado em produção via
-- migração sbc_empresas_visitadas_unidade (24/09). A tabela não tem trigger de updated_at,
-- então o backfill não mexe em data de "última atualização".
--
-- DECISÃO DO OLVER (24/09): a carteira é separada por unidade — cada unidade prospecta os
-- seus clientes. Regra da aplicação daqui pra frente (ver api/km/visitas): a empresa fica na
-- unidade de quem registrou a visita, e o "já existe essa empresa?" só procura dentro da
-- mesma unidade (a mesma empresa visitada pelas duas unidades vira duas linhas).

ALTER TABLE public.empresas_visitadas
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);

-- Tudo que existe foi visitado antes de SBC operar, por Monte Mor/Hortolândia (única
-- unidade até 23/09 — conferido: todos os km_registros são de analistas de Monte Mor).
UPDATE public.empresas_visitadas
SET unidade_id = public.unidade_padrao()
WHERE unidade_id IS NULL;

ALTER TABLE public.empresas_visitadas
  ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao(),
  ALTER COLUMN unidade_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS empresas_visitadas_unidade_id_idx ON public.empresas_visitadas (unidade_id);
