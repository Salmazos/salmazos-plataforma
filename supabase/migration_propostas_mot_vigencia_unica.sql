-- Uma vigência por data nos percentuais da planilha de verbas do MOT: índice ÚNICO em proposta_mot_parametros (vigente_desde).
-- NÃO APLICADA: aplicar manualmente (Supabase) e conferir por SELECT. Aplicar ANTES do deploy do código da API de parâmetros.
--
-- Motivo: a rota POST /api/comercial/propostas/mot/parametros recusa (409) uma vigência com data que já existe, mas essa conferência é feita ANTES
-- do insert; duas chamadas simultâneas na mesma data podem passar as duas pela conferência. A tabela é só-inserção (gatilho de imutabilidade), então
-- uma duplicata gravada ficaria para sempre. O índice único fecha a corrida no banco: a segunda inserção falha com 23505 e a rota devolve o mesmo 409
-- ("Já existe uma vigência com esta data. Escolha outra data."). Com o índice, o desempate "a criada por último" de parametros_mot_vigentes deixa de ser
-- necessário (não há mais duas linhas na mesma data), mas a função continua válida.
--
-- Aditivo e idempotente (if not exists); NENHUM dado é tocado: só cria um índice. Sem begin/commit (uma única instrução, atômica por si só).
-- Pressupõe migration_propostas_mot.sql já aplicada. Hoje a tabela tem 1 linha (vigente_desde = 2026-11-19), então não há duplicata e o índice é criado.
-- Se algum dia houver duas linhas na mesma data, a instrução falha SEM alterar nada. Conferência prévia (esperado: 0 linhas):
--   select vigente_desde, count(*) from public.proposta_mot_parametros group by vigente_desde having count(*) > 1;

create unique index if not exists proposta_mot_parametros_vigente_desde_uq
  on public.proposta_mot_parametros (vigente_desde);
