-- Dia(s) de teste: alguns clientes contratantes fazem 1 ou 2 dias de teste ANTES do dia de integração e do
-- início efetivo do funcionário. O cliente informa em texto livre (ex.: "05/11 e 06/11") junto com os demais
-- dados de admissão (aprovação pelo portal ou indicação direta); o RH/DP vê no painel para avisar o candidato.
-- Mesmo caminho de admissao_local_integracao: nasce na solicitação de indicação e é copiado para candidatos_vagas
-- na aprovação. Sem validação de data de propósito (texto livre definido pelo contratante).
--
-- Este arquivo é só o registro local (CLAUDE.md: toda mudança de schema precisa de rastro); aplicar via
-- mcp__<supabase-mcp>__apply_migration.

ALTER TABLE candidatos_vagas ADD COLUMN IF NOT EXISTS admissao_dia_teste text;
ALTER TABLE solicitacoes_indicacao_candidato ADD COLUMN IF NOT EXISTS admissao_dia_teste text;
