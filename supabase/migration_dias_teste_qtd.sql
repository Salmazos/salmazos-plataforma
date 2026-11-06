-- Dias de teste: o cliente só informa SE houve teste e QUANTOS dias (1 ou 2; a Salmazos paga por dia). Sem datas e sem horários.
-- Semântica de admissao_qtd_dias_teste (smallint, CHECK 0..2):
--   NULL = não informado (registros antigos, ou serviço que não pede a informação, como R&S);
--   0    = o cliente informou que NÃO houve dia de teste;
--   1, 2 = quantidade de dias de teste (limite = MAX_DIAS_TESTE em src/lib/diasTeste.ts).
-- O texto livre legado (admissao_dia_teste) NÃO foi alterado e continua legível nos registros antigos.
-- A coluna jsonb admissao_dias_teste (migration_dias_teste.sql, lista de {data, entrada, saida}) foi DESCARTADA: nunca
-- teve dado real e nenhum código a referencia mais.
--
-- Este arquivo é só o registro local (CLAUDE.md: toda mudança de schema precisa de rastro); JÁ APLICADA no banco.

ALTER TABLE candidatos_vagas
  ADD COLUMN IF NOT EXISTS admissao_qtd_dias_teste smallint CHECK (admissao_qtd_dias_teste BETWEEN 0 AND 2);
ALTER TABLE solicitacoes_indicacao_candidato
  ADD COLUMN IF NOT EXISTS admissao_qtd_dias_teste smallint CHECK (admissao_qtd_dias_teste BETWEEN 0 AND 2);
