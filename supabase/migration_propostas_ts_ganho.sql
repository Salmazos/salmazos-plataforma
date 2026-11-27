-- Terceirização (TS), etapa 2F: o preço passa a ser "ganho sobre o custo" (preço = custo × (1 + ganho)).
-- APLICADA em 27/11/2026 (Supabase, conferida por SELECT), antes do deploy do código da 2F: sem estas colunas as rotas do TS respondem 500 ("percentuais inválidos").
--
-- Só acrescenta três colunas em proposta_ts_parametros. Nenhum DROP, DELETE, TRUNCATE ou UPDATE; idempotente (add column if not exists, e o check nasce junto com a
-- coluna); tudo numa única transação. Pressupõe supabase/migration_propostas_ts.sql (aplicada em 25/11/2026).
--
-- ganho_padrao_bp            ganho sobre o custo de toda proposta, em pontos-base (28,6% = 2860; teto 1000% = 100000). 0 = ainda não configurado (o cálculo recusa com 422).
-- ganho_minimo_bp            abaixo dele só o gestor/diretoria libera, com justificativa.
-- encargos_sobre_adicionais  ligado (padrão): adicionais e horas extras entram na base dos encargos; desligado: só o salário.
--
-- As colunas antigas (iss_bp, pis_bp, cofins_bp, irpj_bp, csll_bp, despesas_bp, lucro_bp, margem_minima_bp, cobertura_bp) ficam como estão, pelo histórico; o código
-- grava 0 nelas nas vigências novas e não as lê. A tabela continua somente inserção (o gatilho de imutabilidade não dispara com add column) e sem privilégio para
-- authenticated/anon. A linha já existente passa a ter ganho 0, mínimo 0 e interruptor ligado.
-- parametros_ts_vigentes(date) NÃO precisa ser recriada: devolve "setof public.proposta_ts_parametros" com "select *" e corpo em texto (conferido por SELECT em
-- pg_proc: prosqlbody nulo), então passa a devolver as colunas novas.

begin;

alter table public.proposta_ts_parametros
  add column if not exists ganho_padrao_bp int not null default 0 check (ganho_padrao_bp >= 0 and ganho_padrao_bp <= 100000);

alter table public.proposta_ts_parametros
  add column if not exists ganho_minimo_bp int not null default 0 check (ganho_minimo_bp >= 0 and ganho_minimo_bp <= 100000);

alter table public.proposta_ts_parametros
  add column if not exists encargos_sobre_adicionais boolean not null default true;

-- Recarrega o cache de esquema da API para as colunas novas aceitarem inserção na hora.
notify pgrst, 'reload schema';

commit;

-- Conferência depois de aplicar (esperado: a linha vigente com ganho_padrao_bp 0, ganho_minimo_bp 0 e encargos_sobre_adicionais true):
--   select vigente_desde, fgts_bp, inss_bp, multa_fgts_bp, ganho_padrao_bp, ganho_minimo_bp, encargos_sobre_adicionais from public.parametros_ts_vigentes((now() at time zone 'America/Sao_Paulo')::date);
--   select conname from pg_constraint where conrelid = 'public.proposta_ts_parametros'::regclass and conname like '%ganho%';
--   select grantee, privilege_type from information_schema.role_table_grants where table_name = 'proposta_ts_parametros';
