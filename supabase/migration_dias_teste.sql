-- Dias de teste ESTRUTURADOS: substitui o texto livre (admissao_dia_teste) por dados validáveis.
-- Semântica da coluna admissao_dias_teste (jsonb):
--   NULL  = não informado (registros antigos, ou serviço que não pede a informação, como R&S);
--   []    = o cliente informou que NÃO houve dia de teste;
--   array de até 2 itens {"data":"YYYY-MM-DD","entrada":"HH:MM","saida":"HH:MM"}
--           (saída menor que a entrada = o turno vira a meia-noite; limite em MAX_DIAS_TESTE, src/lib/diasTeste.ts).
-- A coluna de texto antiga (admissao_dia_teste) NÃO é alterada nem apagada: os registros já gravados continuam legíveis.
--
-- Este arquivo é só o registro local (CLAUDE.md: toda mudança de schema precisa de rastro); aplicar via
-- mcp__<supabase-mcp>__apply_migration.

ALTER TABLE candidatos_vagas ADD COLUMN IF NOT EXISTS admissao_dias_teste jsonb;
ALTER TABLE solicitacoes_indicacao_candidato ADD COLUMN IF NOT EXISTS admissao_dias_teste jsonb;
