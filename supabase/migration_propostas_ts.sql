-- Propostas de Terceirização de Serviços (TS): percentuais de encargos, cobertura e preço, com vigência.
-- NÃO APLICADA: aplicar manualmente (Supabase) e conferir por SELECT. Nenhum DROP, TRUNCATE, DELETE ou alteração de tabela/dado
-- existente; idempotente; tudo numa única transação (se qualquer comando falhar, nada fica criado). Pressupõe
-- supabase/migration_propostas.sql e supabase/migration_propostas_mot.sql já aplicadas (usa proposta_registro_imutavel e as tabelas de propostas).
--
-- (a) proposta_ts_parametros: percentuais em pontos-base inteiros (23% = 2300; 0,65% = 65; 100% = 10000). Só inserção: cada mudança é uma linha
--     nova com vigente_desde (ÚNICO, já na criação: duas vigências na mesma data são impossíveis); a regra de leitura é "a vigência mais recente com
--     vigente_desde <= hoje" (parametros_ts_vigentes). Authenticated e anon não têm nenhum privilégio (nem select): leitura e escrita só pela API com
--     service role, que confere se quem altera é diretoria/superuser. Cada proposta TS grava no snapshot os percentuais que usou.
-- (b) Linha inicial: fgts_bp 800, inss_bp 2300, multa_fgts_bp 4000; TODAS as demais colunas em 0 (cobertura, os cinco tributos, despesas, lucro e
--     margem mínima). Com tributos + despesas + lucro = 0 a lib de cálculo RECUSA calcular preço ("Os percentuais de preço da Terceirização ainda não
--     foram configurados pela diretoria."): a diretoria precisa cadastrar uma vigência nova com os percentuais de preço antes de qualquer proposta.
-- (c) contador TS: aguardar o número legado do Ölver. Esta migration NÃO cria linha em proposta_contadores nem em proposta_contadores_teste para o TS;
--     sem linha, criar_proposta começa em SIGLA-TS-0001/26 (e criar_proposta_teste em TESTE-TS-0001/26). Se houver número legado, uma migration
--     separada semeia o contador (como a do MOT fez com 71).

begin;

create table if not exists public.proposta_ts_parametros (
  id                uuid primary key default gen_random_uuid(),
  -- Primeiro dia em que estes percentuais valem.
  vigente_desde     date not null,
  -- Encargos (sobre a remuneração completa; as bases ficam na lib de cálculo, num ponto só).
  fgts_bp           int  not null check (fgts_bp           between 0 and 10000),
  inss_bp           int  not null check (inss_bp           between 0 and 10000),
  multa_fgts_bp     int  not null check (multa_fgts_bp     between 0 and 10000),
  -- Cobertura de ausências: padrão global (cada posto pode ter override na proposta).
  cobertura_bp      int  not null check (cobertura_bp      between 0 and 10000),
  -- Preço = custo / (1 - tributos - despesas - lucro).
  iss_bp            int  not null check (iss_bp            between 0 and 10000),
  pis_bp            int  not null check (pis_bp            between 0 and 10000),
  cofins_bp         int  not null check (cofins_bp         between 0 and 10000),
  irpj_bp           int  not null check (irpj_bp           between 0 and 10000),
  csll_bp           int  not null check (csll_bp           between 0 and 10000),
  despesas_bp       int  not null check (despesas_bp       between 0 and 10000),
  lucro_bp          int  not null check (lucro_bp          between 0 and 10000),
  -- Piso de margem: preço manual abaixo dele é bloqueado para o vendedor (o gestor libera com justificativa).
  margem_minima_bp  int  not null check (margem_minima_bp  between 0 and 10000),
  -- Nulo na linha inicial (carga da migração); depois, quem alterou (diretoria/superuser, conferido pela API).
  alterado_por      uuid references public.analistas_perfil(id),
  created_at        timestamptz not null default now()
);

-- Uma vigência por data, garantida pelo banco desde a criação (a rota ainda confere antes e trata o 23505 da corrida).
create unique index if not exists proposta_ts_parametros_vigente_desde_uq on public.proposta_ts_parametros (vigente_desde);
create index if not exists proposta_ts_parametros_vigencia_idx on public.proposta_ts_parametros (vigente_desde desc, created_at desc);

-- Somente inserção, para qualquer papel (inclusive service role): reaproveita o gatilho de proposta_historico/proposta_revisoes/proposta_mot_parametros.
drop trigger if exists proposta_ts_parametros_imutavel on public.proposta_ts_parametros;
create trigger proposta_ts_parametros_imutavel before update or delete on public.proposta_ts_parametros
  for each row execute function public.proposta_registro_imutavel();

-- Authenticated e anon: nenhum privilégio, nem select. RLS ligada e sem policy: só o service role (que a bypassa) lê e escreve.
revoke all on public.proposta_ts_parametros from public, anon, authenticated;
alter table public.proposta_ts_parametros enable row level security;

-- Linha inicial, só se a tabela ainda estiver vazia (vigente_desde = data desta migration).
insert into public.proposta_ts_parametros (
  vigente_desde, fgts_bp, inss_bp, multa_fgts_bp, cobertura_bp, iss_bp, pis_bp, cofins_bp, irpj_bp, csll_bp, despesas_bp, lucro_bp, margem_minima_bp
)
select date '2026-11-25', 800, 2300, 4000, 0, 0, 0, 0, 0, 0, 0, 0, 0
where not exists (select 1 from public.proposta_ts_parametros);

-- Regra de leitura num só lugar: a vigência mais recente com vigente_desde <= hoje.
-- Sem linha vigente (hoje antes da primeira vigência) devolve nenhuma linha: quem chama decide (a API recusa, não inventa).
create or replace function public.parametros_ts_vigentes(
  p_hoje date default ((now() at time zone 'America/Sao_Paulo')::date)
) returns setof public.proposta_ts_parametros
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.proposta_ts_parametros
  where vigente_desde <= p_hoje
  order by vigente_desde desc, created_at desc
  limit 1
$$;

revoke all on function public.parametros_ts_vigentes(date) from public, anon, authenticated;
grant execute on function public.parametros_ts_vigentes(date) to service_role;

commit;

-- Conferência depois de aplicar (esperado: 1 linha com fgts 800, inss 2300, multa 4000 e o resto 0; RLS ligada; sem privilégio para authenticated):
--   select * from public.parametros_ts_vigentes(date '2026-11-25');
--   select relrowsecurity from pg_class where oid = 'public.proposta_ts_parametros'::regclass;
--   select grantee, privilege_type from information_schema.role_table_grants where table_name = 'proposta_ts_parametros';
--   select tgname from pg_trigger where tgrelid = 'public.proposta_ts_parametros'::regclass and not tgisinternal;
