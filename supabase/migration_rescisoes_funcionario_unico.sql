-- Uma rescisão por funcionário, garantido pelo banco.
--
-- Por quê: POST /api/rescisoes confere "já existe rescisão deste funcionário?" e só depois insere
-- (check-then-insert). Com a rescisão programada o funcionário continua 'ativo' até a data, então o status
-- deixou de barrar o segundo lançamento; duas requisições simultâneas (duplo clique, duas pessoas do RH)
-- passariam juntas pelo guard e gerariam duas linhas financeiras para a mesma pessoa. O índice único fecha
-- essa janela; a rota traduz o erro 23505 para o mesmo 409 amigável do guard.
--
-- Índice único simples, não parcial: um predicado parcial não enxerga funcionarios.status (outra tabela), e o
-- modelo já é "uma rescisão por funcionário" (não existe reativação; recontratação cria outra linha em
-- funcionarios). Cancelar uma rescisão programada (DELETE /api/rescisoes/[id]) libera um novo lançamento.
--
-- Antes de aplicar, conferir que não há duplicados (em 07/10/2026: 14 rescisões, 14 funcionários distintos).
-- Se esta consulta devolver linhas, o índice NÃO será criado até alguém resolver os duplicados à mão:
--   select funcionario_id, count(*) from public.rescisoes group by 1 having count(*) > 1;
--
-- O índice comum rescisoes_funcionario_id_idx (migration_rescisoes.sql) fica redundante, mas é inofensivo e
-- não é removido aqui.
--
-- Idempotente: pode rodar mais de uma vez sem erro.

create unique index if not exists rescisoes_funcionario_id_unico
  on public.rescisoes (funcionario_id);
