#!/usr/bin/env bash
# Prova, num Postgres DESCARTÁVEL (nunca o Supabase de produção), o que o banco em memória do harness não consegue: a migração da
# comissão (Fase 1) aplica limpa, o trigger torna o ledger imutável, os índices únicos barram marcação dupla e os CHECKs valem.
# Pré-requisito: um servidor Postgres local e o psql. Por padrão usa o socket em /tmp/pgs (porta 54329); mude com PSQL="psql ...".
#   Rodar: bash scripts/verificar-comissao-fase1-banco.sh
set -u
PSQL=${PSQL:-"psql -h /tmp/pgs -p 54329 -U postgres"}
DB=comissao_fase1_teste
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
falhas=0

$PSQL -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1 || { echo "Sem Postgres local acessível ($PSQL)"; exit 2; }
P="$PSQL -d $DB -v ON_ERROR_STOP=1 -q -t -A"
trap '$PSQL -q -c "drop database if exists $DB" >/dev/null 2>&1' EXIT

# Stubs mínimos das tabelas que a migração referencia (o schema real já existe no Supabase).
$P >/dev/null <<'SQL'
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth; create table auth.users(id uuid primary key default gen_random_uuid());
create table public.unidades(id uuid primary key default gen_random_uuid(), slug text);
create function public.unidade_padrao() returns uuid language sql as $$ select id from public.unidades order by slug limit 1 $$;
create table public.analistas_perfil(id uuid primary key default gen_random_uuid(), nome_completo text, ativo boolean default true, unidade_id uuid);
create table public.cobrancas_rs(id uuid primary key default gen_random_uuid(), status text);
insert into public.unidades(slug) values ('monte-mor-hortolandia');
insert into public.analistas_perfil(nome_completo, unidade_id) select 'Giovanni Prado', id from public.unidades;
insert into public.cobrancas_rs(id,status) values ('c1000000-0000-4000-8000-000000000001','aprovada_enviada'),('c1000000-0000-4000-8000-000000000002','aprovada_enviada');
SQL

$P -f "$RAIZ/supabase/migration_comissao_fase1.sql" >/dev/null 2>&1 && echo "OK    migração aplica limpa" || { echo "FALHA migração não aplica"; exit 1; }
[ "$($P -c "select percentual from comissao_beneficiarios")" = "5.00" ] && echo "OK    Giovanni Prado semeado a 5%" || { echo "FALHA semente do beneficiário"; falhas=1; }
$P -f "$RAIZ/supabase/migration_comissao_fase1.sql" >/dev/null 2>&1 && { echo "FALHA a migração não é idempotente de propósito (CREATE TABLE sem IF NOT EXISTS) mas rodou 2x"; falhas=1; } || echo "OK    segunda execução é recusada (não reexecutar)"

B=$($P -c "select id from comissao_beneficiarios limit 1")
C1=c1000000-0000-4000-8000-000000000001; C2=c1000000-0000-4000-8000-000000000002
ins() { echo "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao) values ('$1','$B','comissao','$2','2026-11-01',400,5,20)"; }
esperar() { # esperar PERMITIU|BLOQUEOU "descrição" "sql"
  local quer=$1 desc=$2; shift 2
  if $P -c "$*" >/dev/null 2>&1; then got=PERMITIU; else got=BLOQUEOU; fi
  if [ "$got" = "$quer" ]; then echo "OK    $desc"; else echo "FALHA $desc (esperado $quer, veio $got)"; falhas=1; fi
}
esperar PERMITIU "comissão válida" "$(ins $C1 prevista)"
esperar BLOQUEOU "marcação dupla da mesma cobrança" "$(ins $C1 prevista)"
esperar BLOQUEOU "competência fora do dia 1" "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao) values ('$C2','$B','comissao','prevista','2026-11-15',400,5,20)"
L=$($P -c "select id from comissao_lancamentos where cobranca_id='$C1'")
esperar BLOQUEOU "DELETE de lançamento" "delete from comissao_lancamentos where id='$L'"
esperar BLOQUEOU "alterar competência" "update comissao_lancamentos set competencia='2026-10-01' where id='$L'"
esperar BLOQUEOU "alterar percentual aplicado" "update comissao_lancamentos set percentual_aplicado=9 where id='$L'"
esperar PERMITIU "sincronizar valor da comissão não fechada" "update comissao_lancamentos set base_valor=500, valor_comissao=25 where id='$L'"
esperar PERMITIU "prevista -> confirmada" "update comissao_lancamentos set status='confirmada' where id='$L'"
esperar BLOQUEOU "confirmada -> recusada (transição inválida)" "update comissao_lancamentos set status='recusada' where id='$L'"
esperar PERMITIU "confirmada -> contestada" "update comissao_lancamentos set status='contestada', contestacao_motivo='x' where id='$L'"
esperar PERMITIU "contestada -> confirmada" "update comissao_lancamentos set status='confirmada' where id='$L'"
esperar BLOQUEOU "estorno com valor positivo" "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,valor_comissao,lancamento_origem_id,motivo) values ('$C1','$B','estorno','confirmada','2026-11-01',5,'$L','x')"
esperar BLOQUEOU "estorno sem motivo" "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,valor_comissao,lancamento_origem_id) values ('$C1','$B','estorno','confirmada','2026-11-01',-5,'$L')"
esperar PERMITIU "estorno válido vinculado ao original" "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,valor_comissao,lancamento_origem_id,motivo) values ('$C1','$B','estorno','confirmada','2026-11-01',-25,'$L','cliente devolveu')"
E=$($P -c "select id from comissao_lancamentos where tipo='estorno'")
esperar BLOQUEOU "editar valor do estorno" "update comissao_lancamentos set valor_comissao=-1 where id='$E'"
esperar BLOQUEOU "mudar status do estorno" "update comissao_lancamentos set status='cancelada' where id='$E'"
esperar PERMITIU "confirmada -> cancelada" "update comissao_lancamentos set status='cancelada' where id='$L'"
esperar BLOQUEOU "cancelada -> prevista (estado final)" "update comissao_lancamentos set status='prevista' where id='$L'"
esperar PERMITIU "marcar de novo a mesma cobrança depois de cancelada" "$(ins $C1 prevista)"
esperar PERMITIU "fechamento (reservado à Fase 2) gravado" "update comissao_lancamentos set fechado_em=now() where cobranca_id='$C1' and status='prevista'"
esperar BLOQUEOU "valor de lançamento fechado" "update comissao_lancamentos set valor_comissao=1 where cobranca_id='$C1' and status='prevista'"
esperar BLOQUEOU "desfazer fechamento" "update comissao_lancamentos set fechado_em=null where cobranca_id='$C1' and status='prevista'"
[ "$($P -c "select count(*) from information_schema.columns where table_name='cobrancas_rs' and column_name='validada_em'")" = "1" ] && echo "OK    cobrancas_rs.validada_em criada" || { echo "FALHA validada_em"; falhas=1; }
[ "$($P -c "select count(*) from pg_policies where tablename like 'comissao_%' and roles <> '{service_role}'")" = "0" ] && echo "OK    RLS: só service_role (nenhuma política para authenticated)" || { echo "FALHA RLS aberta"; falhas=1; }

[ $falhas -eq 0 ] && echo "TUDO OK" || echo "HÁ FALHAS"
exit $falhas
