-- Trava de duplicidade de clientes: dois clientes ATIVOS não podem ter o mesmo CNPJ.
--
-- Por quê: a checagem da API (clienteDuplicidade.ts) compara o CNPJ em memória e pode perder uma corrida entre
-- duas requisições simultâneas; este índice é a garantia final no banco. A rota traduz o erro 23505 em
-- mensagem amigável (409). Compara só os DÍGITOS do CNPJ (hoje há CNPJs com pontuação e sem pontuação).
-- Parcial em `ativo`: um cadastro inativo não bloqueia nada — reativar passa pela mesma checagem na API.
-- Não altera nenhum dado. Em 07/10/2026 havia 0 CNPJs repetidos entre clientes ativos.
--
-- CONFERÊNCIA ANTES DE APLICAR (deve retornar 0 linhas; se retornar, a criação do índice falharia):
--   select regexp_replace(cnpj, '\D', '', 'g') as cnpj_digitos, count(*), array_agg(id)
--   from public.clientes
--   where ativo and nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '') is not null
--   group by 1 having count(*) > 1;

create unique index if not exists clientes_cnpj_ativo_unico
  on public.clientes ((regexp_replace(cnpj, '\D', '', 'g')))
  where ativo and nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '') is not null;
