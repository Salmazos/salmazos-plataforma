-- Admissão Rápida (candidato novo): candidatos.origem passa a aceitar 'admissao_rapida'.
-- POST /api/admissoes/admissao-rapida grava origem = 'admissao_rapida' no candidato que ela cria (rótulo "Admissão Rápida
-- (vaga casada)" em lib/constants.ts), mas chk_candidatos_origem nunca incluiu esse valor (23/06: 3 valores; 30/09, indicação
-- direta: 4 valores), então o INSERT de candidato novo sempre era recusado pelo banco (23514). O caminho de reaproveitar o
-- candidato pelo CPF não passa por esse INSERT e não é afetado.
--
-- ADITIVA e idempotente: só recria a CHECK de origem com os 5 valores (os 4 de hoje + admissao_rapida), no mesmo padrão da
-- migration de 30/09 (indicacao_direta_candidato). Nenhuma coluna, tabela, função, trigger ou policy nova, e nenhum dado
-- alterado: todo candidato existente tem uma das 4 origens antigas, então a constraint nova é satisfeita por todas as linhas.
-- (Para o ADD CONSTRAINT passar, nenhuma linha pode ter origem fora dos 5 valores; a conferência abaixo mostra isso.)

alter table public.candidatos drop constraint if exists chk_candidatos_origem;
alter table public.candidatos add constraint chk_candidatos_origem
  check (origem = any (array['cadastro_rapido', 'vaga_especifica', 'banco_talentos', 'indicacao_direta_cliente', 'admissao_rapida']));

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: a definição lista exatamente os 5 valores acima
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'chk_candidatos_origem';
-- Esperado: 0 linhas (nenhum candidato com origem fora dos 5 valores)
--   select origem, count(*) from public.candidatos where origem <> all (array['cadastro_rapido', 'vaga_especifica', 'banco_talentos', 'indicacao_direta_cliente', 'admissao_rapida']) group by origem;
