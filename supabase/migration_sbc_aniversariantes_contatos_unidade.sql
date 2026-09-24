-- Fase 3 SBC — contatos aniversariantes por unidade. Aplicado em produção via migração
-- sbc_aniversariantes_contatos_unidade (24/09). A tabela não tem trigger de atualizado_em,
-- então o backfill não mexe em data de "última atualização".
--
-- Regra da aplicação daqui pra frente (ver api/aniversariantes): contato com cliente herda a
-- unidade do cliente; contato só com empresa em texto livre fica na unidade de quem cadastrou.

ALTER TABLE public.aniversariantes_contatos
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);

-- Contato com cliente: unidade do cliente.
UPDATE public.aniversariantes_contatos a
SET unidade_id = c.unidade_id
FROM public.clientes c
WHERE a.cliente_id = c.id AND a.unidade_id IS NULL;

-- Contato sem cliente: tudo que existe foi cadastrado antes de SBC operar, por Monte
-- Mor/Hortolândia (única unidade até 23/09).
UPDATE public.aniversariantes_contatos
SET unidade_id = public.unidade_padrao()
WHERE unidade_id IS NULL;

ALTER TABLE public.aniversariantes_contatos
  ALTER COLUMN unidade_id SET DEFAULT public.unidade_padrao(),
  ALTER COLUMN unidade_id SET NOT NULL;
