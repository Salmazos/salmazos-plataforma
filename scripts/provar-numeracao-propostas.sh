#!/usr/bin/env bash
# Prova de numeração de propostas (número = SIGLA-seq/ano; a sigla vem do app) num Postgres 16 descartável (nada toca o Supabase real).
# Precisa de initdb/pg_ctl/psql do Postgres 16 e de um usuário que não seja root (usa "postgres" se rodar como root).
# Uso: bash scripts/provar-numeracao-propostas.sh
set -euo pipefail

BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
MIGRATION="$RAIZ/supabase/migration_propostas.sql"
DIR=$(mktemp -d /tmp/pgprova.XXXXXX)
PORTA=54329
SESSOES=${SESSOES:-50}

if [ "$(id -u)" = "0" ]; then
  chown postgres "$DIR"; chmod 755 "$RAIZ" 2>/dev/null || true
  EXEC() { su postgres -s /bin/bash -c "$*"; }
else
  EXEC() { bash -c "$*"; }
fi
PSQL="$BIN/psql -h 127.0.0.1 -p $PORTA -U postgres -d prova -v ON_ERROR_STOP=1 -X -q -At"

limpar() { EXEC "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap limpar EXIT

EXEC "$BIN/initdb -D $DIR/data -U postgres --auth=trust -E UTF8 >/dev/null"
EXEC "$BIN/pg_ctl -D $DIR/data -o '-p $PORTA -c listen_addresses=127.0.0.1 -c unix_socket_directories=$DIR -c max_connections=200' -l $DIR/log -w start >/dev/null"
EXEC "$BIN/createdb -h 127.0.0.1 -p $PORTA -U postgres prova"

# Cenário mínimo que a migration espera já existir no Supabase (só o necessário para as FKs e policies).
cat > "$DIR/stubs.sql" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
-- Como no Supabase: tabelas novas em public já nascem com privilégios para os três papéis (a RLS e os REVOKE da migration é que restringem).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create table unidades (id uuid primary key default gen_random_uuid());
create table analistas_perfil (id uuid primary key default gen_random_uuid(), user_id uuid, ativo boolean default true, nivel_acesso text);
create table empresas_visitadas (id uuid primary key default gen_random_uuid());
create table oportunidades (id uuid primary key default gen_random_uuid());
create function public.meu_analista_id() returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.analistas_perfil where user_id = auth.uid() and ativo = true limit 1 $$;
create function public.is_gestor_comercial() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.analistas_perfil where user_id = auth.uid() and ativo = true and nivel_acesso in ('diretoria','superuser')) $$;
SQL
$PSQL -f "$DIR/stubs.sql"
echo "== aplica a migration (1ª vez) e de novo (idempotência)"
$PSQL -f "$MIGRATION"
$PSQL -f "$MIGRATION"
echo "ok: duas aplicações sem erro"

UNI=$($PSQL -c "insert into unidades default values returning id")
VEND=$($PSQL -c "insert into analistas_perfil (user_id, nivel_acesso) values (gen_random_uuid(),'analista') returning id")
CHAMADA="select numero from criar_proposta('RS','OS','$UNI','$VEND',null,null,'Cliente Teste',null,'{}'::jsonb,1,15)"

echo
echo "== 1) $SESSOES sessões concorrentes chamando criar_proposta (RS, mesmo ano)"
for i in $(seq 1 "$SESSOES"); do
  EXEC "$PSQL -c \"set role service_role; $CHAMADA\" > $DIR/saida.$i" &
done
wait
cat "$DIR"/saida.* | sort > "$DIR/numeros.txt"
echo "chamadas que retornaram número: $(wc -l < "$DIR/numeros.txt")"
echo "números distintos:              $(sort -u "$DIR/numeros.txt" | wc -l)"
echo "primeiro / último:              $(head -1 "$DIR/numeros.txt") / $(tail -1 "$DIR/numeros.txt")"
$PSQL -c "select 'sequenciais 1..' || max(sequencial) || ', count=' || count(*) || ', buracos=' || (max(sequencial) - count(*)) from propostas where modelo='RS'"
$PSQL -c "select 'contador RS/' || ano || ' = ' || ultimo from proposta_contadores where modelo='RS'"

echo
echo "== 2) falha no insert devolve o contador (vendedor inexistente viola a FK)"
ANTES=$($PSQL -c "select ultimo from proposta_contadores where modelo='RS'")
if $PSQL -c "set role service_role; select criar_proposta('RS','OS','$UNI','00000000-0000-0000-0000-000000000000',null,null,'X',null,'{}'::jsonb,1,15)" 2>"$DIR/erro.txt"; then
  echo "ERRO: a chamada deveria ter falhado"; exit 1
fi
echo "erro recebido: $(head -1 "$DIR/erro.txt")"
DEPOIS=$($PSQL -c "select ultimo from proposta_contadores where modelo='RS'")
echo "contador antes=$ANTES depois=$DEPOIS"
[ -n "$ANTES" ] || { echo "FALHOU: contador vazio"; exit 1; }
[ "$ANTES" = "$DEPOIS" ] && echo "ok: contador não avançou" || { echo "FALHOU"; exit 1; }
PROX=$($PSQL -c "set role service_role; select numero from criar_proposta('RS','OS','$UNI','$VEND',null,null,'Y',null,'{}'::jsonb,1,15)" | tail -1)
echo "próximo número após a falha: $PROX (deve ser sequencial $((ANTES + 1)))"

echo
echo "== 3) modelo inválido e permissões"
$PSQL -c "set role service_role; select criar_proposta('XX','OS','$UNI','$VEND',null,null,'Z',null,'{}'::jsonb,1,15)" 2>&1 | head -1 || true
for papel in anon authenticated; do
  if $PSQL -c "set role $papel; select criar_proposta('RS','OS','$UNI','$VEND',null,null,'Z',null,'{}'::jsonb,1,15)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: $papel executou"; exit 1; fi
  echo "$papel não executa a função: $(head -1 "$DIR/e.txt")"
done
if $PSQL -c "set role authenticated; select * from proposta_contadores" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: authenticated leu contador"; exit 1; fi
echo "authenticated não lê o contador: $(head -1 "$DIR/e.txt")"

echo
echo "== 4) unicidade (modelo, ano, sequencial) e (numero)"
if $PSQL -c "set role service_role; update propostas set numero = (select numero from propostas where sequencial=1 and modelo='RS') where sequencial=2 and modelo='RS'" 2>"$DIR/e.txt"; then echo "ERRO: numero duplicado aceito"; exit 1; fi
echo "numero duplicado recusado: $(head -1 "$DIR/e.txt")"

echo
echo "== 5) outro modelo e ano começam do 0001 (MOT)"
$PSQL -c "set role service_role; select numero from criar_proposta('MOT','MM','$UNI','$VEND',null,null,'M',null,'{}'::jsonb,1,15)" | tail -1

echo
echo "== 6) imutabilidade de revisões/histórico (vale também para o service role)"
PROP=$($PSQL -c "select id from propostas where modelo='MOT' limit 1")
$PSQL -c "set role service_role; insert into proposta_revisoes (proposta_id, revisao, conteudo, template_versao) values ('$PROP', 0, '{}', 1)"
$PSQL -c "set role service_role; insert into proposta_historico (proposta_id, de, para) values ('$PROP', 'rascunho', 'enviada')"
for cmd in "update proposta_revisoes set revisao = 9" "delete from proposta_revisoes" "update proposta_historico set para = 'x'" "delete from proposta_historico"; do
  if $PSQL -c "set role service_role; $cmd" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: service_role executou: $cmd"; exit 1; fi
  echo "service_role '$cmd': $(head -1 "$DIR/e.txt")"
done
if $PSQL -c "set role service_role; delete from propostas where id='$PROP'" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: apagar proposta com revisões passou"; exit 1; fi
echo "service_role apagar proposta (cascade): $(head -1 "$DIR/e.txt")"
echo "-- superusuário desliga o trigger, apaga e religa (procedimento documentado na migration):"
$PSQL -c "alter table proposta_historico disable trigger proposta_historico_imutavel; delete from proposta_historico where proposta_id='$PROP'; alter table proposta_historico enable trigger proposta_historico_imutavel"
echo "historico restante da proposta: $($PSQL -c "select count(*) from proposta_historico where proposta_id='$PROP'")"
if $PSQL -c "set role service_role; insert into proposta_historico (proposta_id, para) values ('$PROP','enviada'); delete from proposta_historico" >/dev/null 2>&1; then echo "ERRO: trigger não foi religado"; exit 1; fi
echo "trigger religado: delete volta a ser barrado"

echo
echo "== 7) RLS, cada caso em sua própria sessão (begin; set local role; set_config(request.jwt.claims,..., true))"
# Mesmo mecanismo do Supabase: auth.uid() lê o 'sub' de request.jwt.claims; meu_analista_id()/is_gestor_comercial() partem dele.
novo_analista() { $PSQL -c "insert into analistas_perfil (user_id, nivel_acesso) values (gen_random_uuid(), '$1') returning id || '|' || user_id"; }
IFS='|' read -r A A_U <<< "$(novo_analista analista)"
IFS='|' read -r B B_U <<< "$(novo_analista analista)"
IFS='|' read -r G G_U <<< "$(novo_analista diretoria)"
for i in 1 2 3; do $PSQL -c "set role service_role; select criar_proposta('TS','TT','$UNI','$A',null,null,'ClienteA$i',null,'{}'::jsonb,1,15)" >/dev/null; done
for i in 1 2;   do $PSQL -c "set role service_role; select criar_proposta('TS','TT','$UNI','$B',null,null,'ClienteB$i',null,'{}'::jsonb,1,15)" >/dev/null; done
PA=$($PSQL -c "select id from propostas where vendedor_id='$A' order by sequencial limit 1")
PB=$($PSQL -c "select id from propostas where vendedor_id='$B' order by sequencial limit 1")
$PSQL -c "set role service_role; insert into proposta_revisoes (proposta_id, revisao, conteudo, template_versao) values ('$PA',0,'{}',1),('$PA',1,'{}',1),('$PB',0,'{}',1)"
$PSQL -c "set role service_role; insert into proposta_historico (proposta_id, para) values ('$PA','enviada'),('$PB','enviada'),('$PB','aceita')"
TOTAL=$($PSQL -c "select count(*) from propostas")
echo "total no banco (superusuário): propostas=$TOTAL; dono A tem 3, B tem 2"

# como PAPEL SUB SQL...: uma sessão própria; devolve a saída da última instrução
como() { local papel=$1 sub=$2; shift 2
  $PSQL -c "begin; set local role $papel; select set_config('request.jwt.claims', '{\"sub\":\"$sub\",\"role\":\"$papel\"}', true); $*; commit" | tail -1; }
esperar() { # descrição, obtido, esperado
  if [ "$2" = "$3" ]; then echo "ok  $1: $2"; else echo "FALHOU $1: obtido=$2 esperado=$3"; exit 1; fi; }
erro_de() { local papel=$1 sub=$2; shift 2
  if $PSQL -c "begin; set local role $papel; select set_config('request.jwt.claims', '{\"sub\":\"$sub\",\"role\":\"$papel\"}', true); $*; commit" >/dev/null 2>"$DIR/e.txt"; then echo "SEM_ERRO"; else head -1 "$DIR/e.txt"; fi; }

esperar "(a) vendedor A vê só as suas (3)"                "$(como authenticated "$A_U" "select count(*) from propostas")" 3
esperar "(a) vendedor B vê só as suas (2)"                "$(como authenticated "$B_U" "select count(*) from propostas")" 2
esperar "(a) revisões de A (2, não as de B)"              "$(como authenticated "$A_U" "select count(*) from proposta_revisoes")" 2
esperar "(a) histórico de B (2, não o de A)"              "$(como authenticated "$B_U" "select count(*) from proposta_historico")" 2
esperar "(b) A não vê a proposta de B pelo id"            "$(como authenticated "$A_U" "select count(*) from propostas where id='$PB'")" 0
esperar "(b) B não vê as revisões de A"                   "$(como authenticated "$B_U" "select count(*) from proposta_revisoes where proposta_id='$PA'")" 0
esperar "(c) gestor vê todas"                             "$(como authenticated "$G_U" "select count(*) from propostas")" "$TOTAL"
esperar "(c) gestor vê todas as revisões"                 "$(como authenticated "$G_U" "select count(*) from proposta_revisoes")" "$($PSQL -c 'select count(*) from proposta_revisoes')"
esperar "(c) gestor tenta UPDATE: sem privilégio"       "$(erro_de authenticated "$G_U" "update propostas set cliente_nome='x'")" "ERROR:  permission denied for table propostas"
CONT_ANTES=$($PSQL -c "select ultimo from proposta_contadores where modelo='RS'")
esperar "(d) A tenta UPDATE na proposta de B: sem privilégio" "$(erro_de authenticated "$A_U" "update propostas set cliente_nome='hack' where id='$PB'")" "ERROR:  permission denied for table propostas"
esperar "(d) A tenta UPDATE da própria (situacao): sem privilégio" "$(erro_de authenticated "$A_U" "update propostas set situacao='aceita' where id='$PA'")" "ERROR:  permission denied for table propostas"
esperar "(d) A tenta INSERT com número forjado: sem privilégio" "$(erro_de authenticated "$A_U" "insert into propostas (numero,modelo,ano,sequencial,unidade_id,vendedor_id,cliente_nome) values ('RS-0052/26','RS',2026,52,'$UNI','$A','h')")" "ERROR:  permission denied for table propostas"
esperar "(d) A tenta INSERT como se fosse B: sem privilégio" "$(erro_de authenticated "$A_U" "insert into propostas (numero,modelo,ano,sequencial,unidade_id,vendedor_id,cliente_nome) values ('TS-9999/26','TS',2026,9999,'$UNI','$B','h')")" "ERROR:  permission denied for table propostas"
esperar "(d) A tenta INSERT em proposta_revisoes: sem privilégio" "$(erro_de authenticated "$A_U" "insert into proposta_revisoes (proposta_id,revisao,conteudo,template_versao) values ('$PA',7,'{}',1)")" "ERROR:  permission denied for table proposta_revisoes"
esperar "(d) A tenta INSERT em proposta_historico: sem privilégio" "$(erro_de authenticated "$A_U" "insert into proposta_historico (proposta_id,para) values ('$PA','aceita')")" "ERROR:  permission denied for table proposta_historico"
esperar "(d) A tenta DELETE (até na própria): sem privilégio" "$(erro_de authenticated "$A_U" "delete from propostas where id='$PA'")" "ERROR:  permission denied for table propostas"
esperar "(d) propostas de B intactas"                     "$($PSQL -c "select count(*) from propostas where vendedor_id='$B' and cliente_nome like 'ClienteB%'")" 2
esperar "(d) proposta de A intacta (situacao rascunho)"   "$($PSQL -c "select situacao from propostas where id='$PA'")" rascunho
esperar "(d) contador RS não mudou após as tentativas"    "$($PSQL -c "select ultimo from proposta_contadores where modelo='RS'")" "$CONT_ANTES"
NOVO_RS=$($PSQL -c "set role service_role; select numero from criar_proposta('RS','OS','$UNI','$A',null,null,'Pos-ataque',null,'{}'::jsonb,1,15)" | tail -1)
esperar "(d) criação normal de RS continua (próximo = $((CONT_ANTES + 1)))" "$NOVO_RS" "$(printf 'OS-%04d/26' $((CONT_ANTES + 1)))"
for t in propostas proposta_revisoes proposta_historico proposta_contadores; do
  esperar "(e) anon sem acesso a $t" "$(erro_de anon "$A_U" "select count(*) from $t")" "ERROR:  permission denied for table $t"
done
esperar "(e) anon não insere em propostas" "$(erro_de anon "$A_U" "insert into propostas (numero,modelo,ano,sequencial,unidade_id,vendedor_id,cliente_nome) values ('Z','TS',2026,1,'$UNI','$A','h')")" "ERROR:  permission denied for table propostas"
esperar "authenticated sem acesso ao contador" "$(erro_de authenticated "$A_U" "select count(*) from proposta_contadores")" "ERROR:  permission denied for table proposta_contadores"

echo
echo "== 8) sigla: validação, sobrecarga antiga e colisão entre modelos (risco registrado na migration)"
for ruim in "os" "" "ABCDE" "O1" "Ö"; do
  if $PSQL -c "set role service_role; select criar_proposta('RS','$ruim','$UNI','$VEND',null,null,'S',null,'{}'::jsonb,1,15)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: sigla '$ruim' aceita"; exit 1; fi
  echo "sigla '$ruim' recusada: $(head -1 "$DIR/e.txt")"
done
if $PSQL -c "set role service_role; select criar_proposta('RS',null,'$UNI','$VEND',null,null,'S',null,'{}'::jsonb,1,15)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: sigla nula aceita"; exit 1; fi
echo "sigla nula recusada: $(head -1 "$DIR/e.txt")"
ANTES=$($PSQL -c "select ultimo from proposta_contadores where modelo='RS'")
esperar "contador RS não andou com sigla inválida" "$ANTES" "$ANTES"
ANTIGA=$($PSQL -c "set role service_role; select numero from criar_proposta('RS','$UNI','$VEND',null,null,'Antiga',null,'{}'::jsonb,1,15)" | tail -1)
esperar "sobrecarga antiga (sem sigla) continua funcionando e usa o modelo no prefixo" "$ANTIGA" "$(printf 'RS-%04d/26' $((ANTES + 1)))"
# Força o mesmo sequencial do R&S no contador do MOT e usa a MESMA sigla: o texto do número colide com o do R&S.
SEQ_RS=$ANTES # último R&S criado com sigla (a chamada pela sobrecarga antiga, logo acima, tem prefixo RS)
$PSQL -c "update proposta_contadores set ultimo = $((SEQ_RS - 1)) where modelo='MOT'"
NUM_RS=$($PSQL -c "select numero from propostas where modelo='RS' and sequencial=$SEQ_RS")
if $PSQL -c "set role service_role; select criar_proposta('MOT','OS','$UNI','$VEND',null,null,'Colisao',null,'{}'::jsonb,1,15)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: colisão aceita"; exit 1; fi
echo "colisão RS/MOT (mesma sigla e mesmo sequencial, $NUM_RS) recusada: $(head -1 "$DIR/e.txt")"
esperar "contador MOT voltou (a criação inteira reverteu)" "$($PSQL -c "select ultimo from proposta_contadores where modelo='MOT'")" "$((SEQ_RS - 1))"

echo
echo "PROVA CONCLUÍDA"
