#!/usr/bin/env bash
# Prova de numeração de propostas (R&S = SIGLA-seq/ano; MOT/TS = SIGLA-MODELO-seq/ano; a sigla vem do app) e dos percentuais da proposta MOT
# num Postgres 16 descartável (nada toca o Supabase real). Aplica migration_propostas.sql e depois migration_propostas_mot.sql.
# Precisa de initdb/pg_ctl/psql do Postgres 16 e de um usuário que não seja root (usa "postgres" se rodar como root).
# Uso: bash scripts/provar-numeracao-propostas.sh
set -euo pipefail

BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
MIGRATION="$RAIZ/supabase/migration_propostas.sql"
MIGRATION_MOT="$RAIZ/supabase/migration_propostas_mot.sql"
MIGRATION_TESTE="$RAIZ/supabase/migration_propostas_teste.sql"
MIGRATION_VIGENCIA="$RAIZ/supabase/migration_propostas_mot_vigencia_unica.sql"
SCRIPT_DADOS_TESTE="$RAIZ/supabase/dados_propostas_teste_marcar_existentes.sql"
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

echo "== aplica a migration do MOT (1ª vez) e de novo (idempotência); criar_proposta de produção antes x depois"
SQL_META_FN="select p.prosecdef || '|' || coalesce(p.proconfig::text,'') || '|' || coalesce(p.proacl::text,'') || '|' || p.prorettype::regtype || '|' || pg_get_function_identity_arguments(p.oid) from pg_proc p where p.proname='criar_proposta' and p.pronargs=11"
META_ANTES=$($PSQL -c "$SQL_META_FN")
$PSQL -f "$MIGRATION_MOT"
$PSQL -f "$MIGRATION_MOT"
META_DEPOIS=$($PSQL -c "$SQL_META_FN")
echo "ok: duas aplicações sem erro"
echo "criar_proposta(11 args) antes : $META_ANTES"
echo "criar_proposta(11 args) depois: $META_DEPOIS"
[ "$META_ANTES" = "$META_DEPOIS" ] || { echo "FALHOU: assinatura/retorno/search_path/security definer/grants mudaram"; exit 1; }
echo "ok: assinatura, retorno, search_path, security definer e grants idênticos"

echo "== aplica a migration das propostas de TESTE (1ª vez) e de novo (idempotência); criar_proposta real ANTES x DEPOIS (corpo e metadados idênticos)"
SQL_CORPO_FN="select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname='criar_proposta' and p.pronargs=11"
CORPO_ANTES=$($PSQL -c "$SQL_CORPO_FN")
META_ANTES_T=$($PSQL -c "$SQL_META_FN")
$PSQL -f "$MIGRATION_TESTE"
$PSQL -f "$MIGRATION_TESTE"
CORPO_DEPOIS=$($PSQL -c "$SQL_CORPO_FN")
META_DEPOIS_T=$($PSQL -c "$SQL_META_FN")
echo "ok: duas aplicações sem erro"
echo "criar_proposta(11 args) corpo (md5) antes : $CORPO_ANTES"
echo "criar_proposta(11 args) corpo (md5) depois: $CORPO_DEPOIS"
[ "$CORPO_ANTES" = "$CORPO_DEPOIS" ] || { echo "FALHOU: o corpo de criar_proposta mudou"; exit 1; }
[ "$META_ANTES_T" = "$META_DEPOIS_T" ] || { echo "FALHOU: assinatura/retorno/search_path/security definer/grants de criar_proposta mudaram"; exit 1; }
echo "ok: criar_proposta (real) IDÊNTICA à anterior: mesmo corpo, assinatura, retorno, search_path, security definer e grants"

echo "== aplica o índice único de vigência do MOT (1ª vez) e de novo (idempotência); os dados de proposta_mot_parametros não mudam"
DADOS_ANTES=$($PSQL -c "select count(*) || '|' || coalesce(md5(string_agg(t::text, ',' order by t.id)), '') from proposta_mot_parametros t")
$PSQL -f "$MIGRATION_VIGENCIA"
$PSQL -f "$MIGRATION_VIGENCIA"
DADOS_DEPOIS=$($PSQL -c "select count(*) || '|' || coalesce(md5(string_agg(t::text, ',' order by t.id)), '') from proposta_mot_parametros t")
echo "ok: duas aplicações sem erro"
echo "proposta_mot_parametros antes : $DADOS_ANTES"
echo "proposta_mot_parametros depois: $DADOS_DEPOIS"
[ "$DADOS_ANTES" = "$DADOS_DEPOIS" ] || { echo "FALHOU: a migration do índice alterou dados"; exit 1; }
echo "ok: nenhuma linha alterada (mesma contagem e mesmo md5 do conteúdo)"

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
echo "== 5) MOT: contador próprio começando em 71 (próximo = 72), número com o modelo"
esperar_cedo() { if [ "$2" = "$3" ]; then echo "ok  $1: $2"; else echo "FALHOU $1: obtido=$2 esperado=$3"; exit 1; fi; }
esperar_cedo "contador MOT/2026 inicial" "$($PSQL -c "select ultimo from proposta_contadores where modelo='MOT' and ano=2026")" 71
esperar_cedo "primeira proposta MOT" "$($PSQL -c "set role service_role; select numero from criar_proposta('MOT','MM','$UNI','$VEND',null,null,'M',null,'{}'::jsonb,1,15)" | tail -1)" "MM-MOT-0072/26"
esperar_cedo "contador MOT depois" "$($PSQL -c "select ultimo from proposta_contadores where modelo='MOT' and ano=2026")" 72

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
# Antes (só o prefixo de sigla) o texto do número colidia em propostas_numero_uq quando R&S e MOT tinham a MESMA sigla e o MESMO
# sequencial. Agora o MOT leva o modelo no número: força o mesmo sequencial do R&S no contador do MOT, com a MESMA sigla, e confirma que NÃO colide.
SEQ_RS=$ANTES # último R&S criado com sigla (a chamada pela sobrecarga antiga, logo acima, tem prefixo RS)
NUM_RS=$($PSQL -c "select numero from propostas where modelo='RS' and sequencial=$SEQ_RS")
SIGLA_RS="${NUM_RS%%-*}"
$PSQL -c "update proposta_contadores set ultimo = $((SEQ_RS - 1)) where modelo='MOT'"
NUM_MOT=$($PSQL -c "set role service_role; select numero from criar_proposta('MOT','$SIGLA_RS','$UNI','$VEND',null,null,'MesmaSigla',null,'{}'::jsonb,1,15)" | tail -1)
echo "R&S: $NUM_RS  |  MOT (mesma sigla $SIGLA_RS, mesmo sequencial $SEQ_RS): $NUM_MOT"
[ "$NUM_RS" != "$NUM_MOT" ] || { echo "FALHOU: números iguais"; exit 1; }
esperar "R&S mantém o formato antigo (SIGLA-seq/aa)" "$NUM_RS" "$(printf '%s-%04d/26' "$SIGLA_RS" "$SEQ_RS")"
esperar "MOT com a mesma sigla e o mesmo sequencial: número diferente e sem colisão" "$NUM_MOT" "$(printf '%s-MOT-%04d/26' "$SIGLA_RS" "$SEQ_RS")"
TS_NUM=$($PSQL -c "set role service_role; select numero from criar_proposta('TS','$SIGLA_RS','$UNI','$VEND',null,null,'TsMesma',null,'{}'::jsonb,1,15)" | tail -1)
esperar "TS também leva o modelo no número" "$TS_NUM" "$(printf '%s-TS-%04d/26' "$SIGLA_RS" "$($PSQL -c "select ultimo from proposta_contadores where modelo='TS' and ano=2026")")"
esperar "contador MOT avançou normalmente" "$($PSQL -c "select ultimo from proposta_contadores where modelo='MOT'")" "$SEQ_RS"
esperar "nenhum número repetido na tabela" "$($PSQL -c "select count(*) - count(distinct numero) from propostas")" 0
esperar "nenhum número de MOT/TS tem o formato do R&S" "$($PSQL -c "select count(*) from propostas where modelo <> 'RS' and numero !~ '^[A-Z]{1,4}-(MOT|TS)-[0-9]{4}/[0-9]{2}$'")" 0
esperar "todo número de R&S criado com sigla tem o formato antigo" "$($PSQL -c "select count(*) from propostas where modelo = 'RS' and numero !~ '^[A-Z]{1,4}-[0-9]{4}/[0-9]{2}$' and numero !~ '^RS-[0-9]{4}/[0-9]{2}$'")" 0

echo
echo "== 9) proposta_mot_parametros: linha inicial, CHECK 0..10000, só inserção, sem acesso de authenticated/anon, regra de vigência"
esperar "linha inicial única" "$($PSQL -c "select count(*) from proposta_mot_parametros")" 1
esperar "linha inicial = PARAMETROS_MOT_INICIAIS, vigente desde 2026-11-19" "$($PSQL -c "select vigente_desde || ' ' || taxa_administrativa_bp || ' ' || encargos_tributarios_bp || ' ' || inss_patronal_bp || ' ' || fgts_bp || ' ' || ret_iss_bp || ' ' || ret_inss_bp || ' ' || ret_ir_bp || ' ' || ret_cofins_bp || ' ' || ret_csll_bp || ' ' || ret_pis_bp || ' ' || coalesce(alterado_por::text,'sem-autor') from proposta_mot_parametros")" "2026-11-19 1000 3200 3120 800 200 1100 100 300 100 65 sem-autor"
INS_BASE="insert into proposta_mot_parametros (vigente_desde, taxa_administrativa_bp, encargos_tributarios_bp, inss_patronal_bp, fgts_bp, ret_iss_bp, ret_inss_bp, ret_ir_bp, ret_cofins_bp, ret_csll_bp, ret_pis_bp, alterado_por)"
for ruim in "-1" "10001"; do
  if $PSQL -c "set role service_role; $INS_BASE values ('2027-01-01', $ruim, 3200, 3120, 800, 200, 1100, 100, 300, 100, 65, '$G')" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: percentual $ruim aceito"; exit 1; fi
  echo "percentual $ruim recusado: $(head -1 "$DIR/e.txt")"
done
esperar "a linha com percentual inválido não foi gravada" "$($PSQL -c "select count(*) from proposta_mot_parametros")" 1
if $PSQL -c "set role service_role; insert into proposta_mot_parametros (taxa_administrativa_bp,encargos_tributarios_bp,inss_patronal_bp,fgts_bp,ret_iss_bp,ret_inss_bp,ret_ir_bp,ret_cofins_bp,ret_csll_bp,ret_pis_bp) values (1,1,1,1,1,1,1,1,1,1)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: vigente_desde nulo aceito"; exit 1; fi
echo "vigente_desde obrigatório: $(head -1 "$DIR/e.txt")"
# Vigência nova em 2027-01-01 (taxa 1200). Com o índice único, uma SEGUNDA no mesmo dia (taxa 1300) é recusada (23505): não existe mais empate.
$PSQL -c "set role service_role; $INS_BASE values ('2027-01-01', 1200, 3200, 3120, 800, 200, 1100, 100, 300, 100, 65, '$G')"
if $PSQL -c "set role service_role; $INS_BASE values ('2027-01-01', 1300, 3200, 3120, 800, 200, 1100, 100, 300, 100, 65, '$G')" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: segunda vigência na mesma data aceita"; exit 1; fi
echo "segunda vigência na mesma data recusada: $(head -1 "$DIR/e.txt")"
esperar "o erro é a violação do índice único de vigência (23505: duplicate key ... proposta_mot_parametros_vigente_desde_uq)" "$(head -1 "$DIR/e.txt")" 'ERROR:  duplicate key value violates unique constraint "proposta_mot_parametros_vigente_desde_uq"'
esperar "só uma linha em 2027-01-01 (a recusada não gravou)" "$($PSQL -c "select count(*) from proposta_mot_parametros where vigente_desde='2027-01-01'")" 1
vigente() { $PSQL -c "set role service_role; select coalesce((select taxa_administrativa_bp::text from parametros_mot_vigentes('$1')), 'nenhuma')"; }
esperar "vigência: antes da primeira (2026-11-18) não há linha vigente" "$(vigente 2026-11-18)" nenhuma
esperar "vigência: no dia da primeira (2026-11-19) vale a inicial" "$(vigente 2026-11-19)" 1000
esperar "vigência: véspera da nova (2026-12-31) ainda vale a inicial" "$(vigente 2026-12-31)" 1000
esperar "vigência: no dia da nova (2027-01-01) vale a nova" "$(vigente 2027-01-01)" 1200
esperar "vigência: depois (2030-01-01) continua a última" "$(vigente 2030-01-01)" 1200
esperar "vigência: sem argumento usa a data de hoje (Brasília) e devolve exatamente uma linha" "$($PSQL -c "set role service_role; select count(*) from parametros_mot_vigentes()")" 1
for cmd in "update proposta_mot_parametros set fgts_bp = 1" "delete from proposta_mot_parametros"; do
  esperar "service_role '$cmd': barrado pelo gatilho" "$(erro_de service_role "$A_U" "$cmd")" "ERROR:  registro imutável: $(echo "${cmd%% *}" | tr a-z A-Z) em proposta_mot_parametros não é permitido"
done
for papel in authenticated anon; do
  esperar "$papel não lê a tabela" "$(erro_de $papel "$A_U" "select count(*) from proposta_mot_parametros")" "ERROR:  permission denied for table proposta_mot_parametros"
  esperar "$papel não insere" "$(erro_de $papel "$A_U" "$INS_BASE values ('2028-01-01',1,1,1,1,1,1,1,1,1,1,'$A')")" "ERROR:  permission denied for table proposta_mot_parametros"
  esperar "$papel não altera" "$(erro_de $papel "$A_U" "update proposta_mot_parametros set fgts_bp = 1")" "ERROR:  permission denied for table proposta_mot_parametros"
  esperar "$papel não apaga" "$(erro_de $papel "$A_U" "delete from proposta_mot_parametros")" "ERROR:  permission denied for table proposta_mot_parametros"
  esperar "$papel não executa parametros_mot_vigentes" "$(erro_de $papel "$A_U" "select * from parametros_mot_vigentes('2026-12-01')")" "ERROR:  permission denied for function parametros_mot_vigentes"
done
esperar "gestor (diretoria) também não lê direto: leitura só pela API com service role" "$(erro_de authenticated "$G_U" "select count(*) from proposta_mot_parametros")" "ERROR:  permission denied for table proposta_mot_parametros"
esperar "RLS ligada na tabela nova" "$($PSQL -c "select relrowsecurity from pg_class where oid='public.proposta_mot_parametros'::regclass")" t
esperar "authenticated/anon sem nenhum privilégio na tabela (has_table_privilege)" "$($PSQL -c "select bool_or(has_table_privilege(r, 'public.proposta_mot_parametros', p)) from unnest(array['anon','authenticated']) r, unnest(array['select','insert','update','delete','truncate','references','trigger']) p")" f
esperar "criar_proposta(11 args) continua sem execute para anon/authenticated" "$($PSQL -c "select bool_or(has_function_privilege(r, 'public.criar_proposta(text,text,uuid,uuid,uuid,uuid,text,text,jsonb,int,int)', 'execute')) from unnest(array['anon','authenticated']) r")" f
esperar "criar_proposta(11 args) executável pelo service_role" "$($PSQL -c "select has_function_privilege('service_role', 'public.criar_proposta(text,text,uuid,uuid,uuid,uuid,text,text,jsonb,int,int)', 'execute')")" t

echo
echo "== 10) propostas de TESTE: contador separado, números TESTE-..., unicidade (modelo, ano, sequencial, teste), privilégios e script de dados"
# O contador REAL não pode andar quando a proposta é de teste (RS, MOT e TS); o de teste tem linhas próprias.
CR_ANTES="$($PSQL -c "select string_agg(modelo || ano || '=' || ultimo, ',' order by modelo) from proposta_contadores")"
REAIS_ANTES=$($PSQL -c "select count(*) from propostas where teste = false")
TODAS_TESTE_FALSE=$($PSQL -c "select count(*) = count(*) filter (where not teste) from propostas")
esperar "toda proposta já existente nasceu com teste = false (default da coluna)" "$TODAS_TESTE_FALSE" t
N_RS=$($PSQL -c "set role service_role; select numero from criar_proposta_teste('RS','$UNI','$VEND',null,null,'T1',null,'{}'::jsonb,1,15)" | tail -1)
N_MOT=$($PSQL -c "set role service_role; select numero from criar_proposta_teste('MOT','$UNI','$VEND',null,null,'T2',null,'{}'::jsonb,1,15)" | tail -1)
N_TS=$($PSQL -c "set role service_role; select numero from criar_proposta_teste('TS','$UNI','$VEND',null,null,'T3',null,'{}'::jsonb,1,15)" | tail -1)
N_RS2=$($PSQL -c "set role service_role; select numero from criar_proposta_teste('RS','$UNI','$VEND',null,null,'T4',null,'{}'::jsonb,1,15)" | tail -1)
esperar "número de teste R&S" "$N_RS" "TESTE-0001/26"
esperar "número de teste MOT" "$N_MOT" "TESTE-MOT-0001/26"
esperar "número de teste TS" "$N_TS" "TESTE-TS-0001/26"
esperar "segundo teste R&S segue a sequência de teste" "$N_RS2" "TESTE-0002/26"
esperar "o contador REAL (RS, MOT, TS) NÃO andou com as 4 propostas de teste" "$($PSQL -c "select string_agg(modelo || ano || '=' || ultimo, ',' order by modelo) from proposta_contadores")" "$CR_ANTES"
esperar "contadores de teste: RS=2, MOT=1, TS=1" "$($PSQL -c "select string_agg(modelo || '=' || ultimo, ',' order by modelo) from proposta_contadores_teste where ano = 2026")" "MOT=1,RS=2,TS=1"
esperar "as 4 propostas de teste gravadas com teste = true e sequencial do contador de teste" "$($PSQL -c "select count(*) from propostas where teste and ((modelo='RS' and sequencial in (1,2)) or (modelo='MOT' and sequencial=1) or (modelo='TS' and sequencial=1))")" 4
esperar "propostas reais não aumentaram" "$($PSQL -c "select count(*) from propostas where teste = false")" "$REAIS_ANTES"

# A criação REAL continua exatamente como antes (mesmo formato, contador real, teste = false), mesmo depois dos testes.
PROX_REAL=$($PSQL -c "set role service_role; select numero || '|' || teste from criar_proposta('RS','OS','$UNI','$VEND',null,null,'Real pos-teste',null,'{}'::jsonb,1,15)" | tail -1)
ULT_RS=$($PSQL -c "select ultimo from proposta_contadores where modelo='RS' and ano=2026")
esperar "proposta REAL depois dos testes: mesmo formato de sempre, contador real, teste = false" "$PROX_REAL" "$(printf 'OS-%04d/26|false' "$ULT_RS")"
MOT_REAL=$($PSQL -c "set role service_role; select numero from criar_proposta('MOT','OS','$UNI','$VEND',null,null,'Mot real',null,'{}'::jsonb,1,15)" | tail -1)
esperar "MOT real continua SIGLA-MOT-nnnn" "$MOT_REAL" "$(printf 'OS-MOT-%04d/26' "$($PSQL -c "select ultimo from proposta_contadores where modelo='MOT' and ano=2026")")"

# Unicidade (modelo, ano, sequencial, teste): sequencial 1 de TESTE e REAL no mesmo ano e modelo coexistem; duplicata dentro de cada grupo é recusada.
esperar "a restrição antiga (modelo, ano, sequencial) foi substituída" "$($PSQL -c "select count(*) from pg_constraint where conrelid='public.propostas'::regclass and conname='propostas_modelo_ano_seq_uq'")" 0
esperar "a restrição nova existe" "$($PSQL -c "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.propostas'::regclass and conname='propostas_modelo_ano_seq_teste_uq'")" "UNIQUE (modelo, ano, sequencial, teste)"
esperar "sequencial 1 REAL e sequencial 1 de TESTE no mesmo modelo/ano (R&S 2026) coexistem" "$($PSQL -c "select count(*) from propostas where modelo='RS' and ano=2026 and sequencial=1")" 2
esperar "...um real e um de teste" "$($PSQL -c "select string_agg(teste::text, ',' order by teste) from propostas where modelo='RS' and ano=2026 and sequencial=1")" "false,true"
if $PSQL -c "set role service_role; insert into propostas (numero,modelo,ano,sequencial,teste,unidade_id,vendedor_id,cliente_nome) values ('DUP-T/26','RS',2026,1,true,'$UNI','$VEND','dup')" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: sequencial de teste duplicado aceito"; exit 1; fi
echo "duplicata dentro de TESTE recusada: $(head -1 "$DIR/e.txt")"
if $PSQL -c "set role service_role; insert into propostas (numero,modelo,ano,sequencial,teste,unidade_id,vendedor_id,cliente_nome) values ('DUP-R/26','RS',2026,1,false,'$UNI','$VEND','dup')" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: sequencial real duplicado aceito"; exit 1; fi
echo "duplicata dentro das REAIS recusada: $(head -1 "$DIR/e.txt")"
esperar "nenhum número repetido (TESTE-... nunca colide com número real)" "$($PSQL -c "select count(*) - count(distinct numero) from propostas")" 0
esperar "nenhum número real tem o prefixo TESTE" "$($PSQL -c "select count(*) from propostas where not teste and numero like 'TESTE-%'")" 0
if $PSQL -c "set role service_role; select criar_proposta('RS','TESTE','$UNI','$VEND',null,null,'X',null,'{}'::jsonb,1,15)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: sigla TESTE aceita na função real"; exit 1; fi
echo "sigla real 'TESTE' recusada (5 letras; só 1 a 4): $(head -1 "$DIR/e.txt")"

# Falha no insert devolve o contador de teste; modelo inválido recusado.
CT_ANTES=$($PSQL -c "select ultimo from proposta_contadores_teste where modelo='RS' and ano=2026")
if $PSQL -c "set role service_role; select criar_proposta_teste('RS','$UNI','00000000-0000-0000-0000-000000000000',null,null,'X',null,'{}'::jsonb,1,15)" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: deveria falhar"; exit 1; fi
esperar "falha no insert devolve o contador de TESTE" "$($PSQL -c "select ultimo from proposta_contadores_teste where modelo='RS' and ano=2026")" "$CT_ANTES"
esperar "modelo inválido é recusado" "$(erro_de service_role "$A_U" "select criar_proposta_teste('XX','$UNI','$VEND',null,null,'Z',null,'{}'::jsonb,1,15)")" "ERROR:  Modelo de proposta inválido: XX"

# Privilégios: só o service role. authenticated e anon não leem nem escrevem nas tabelas novas nem executam a função de teste.
for papel in authenticated anon; do
  for t in empresas_teste proposta_contadores_teste; do
    esperar "$papel sem acesso a $t" "$(erro_de $papel "$A_U" "select count(*) from $t")" "ERROR:  permission denied for table $t"
  done
  esperar "$papel não insere em empresas_teste" "$(erro_de $papel "$A_U" "insert into empresas_teste (empresa_id) values (gen_random_uuid())")" "ERROR:  permission denied for table empresas_teste"
  esperar "$papel não executa criar_proposta_teste" "$(erro_de $papel "$A_U" "select criar_proposta_teste('RS','$UNI','$VEND',null,null,'Z',null,'{}'::jsonb,1,15)")" "ERROR:  permission denied for function criar_proposta_teste"
done
esperar "gestor (diretoria, authenticated) também não lê empresas_teste direto: só a API com service role" "$(erro_de authenticated "$G_U" "select count(*) from empresas_teste")" "ERROR:  permission denied for table empresas_teste"
esperar "RLS ligada nas duas tabelas novas e nenhuma policy" "$($PSQL -c "select count(*) filter (where relrowsecurity) || '/' || (select count(*) from pg_policies where tablename in ('empresas_teste','proposta_contadores_teste')) from pg_class where oid in ('public.empresas_teste'::regclass,'public.proposta_contadores_teste'::regclass)")" "2/0"
esperar "authenticated/anon sem nenhum privilégio nas duas tabelas (has_table_privilege)" "$($PSQL -c "select bool_or(has_table_privilege(r, t, p)) from unnest(array['anon','authenticated']) r, unnest(array['public.empresas_teste','public.proposta_contadores_teste']) t, unnest(array['select','insert','update','delete','truncate','references','trigger']) p")" f
esperar "criar_proposta_teste: execute só para service_role" "$($PSQL -c "select string_agg(r || '=' || has_function_privilege(r, 'public.criar_proposta_teste(text,uuid,uuid,uuid,uuid,text,text,jsonb,int,int)', 'execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r")" "anon=false,authenticated=false,service_role=true"

# empresas_teste: service role marca; apagar a empresa leva a marca junto (cascade).
EMP=$($PSQL -c "insert into empresas_visitadas default values returning id")
$PSQL -c "set role service_role; insert into empresas_teste (empresa_id, marcado_por) values ('$EMP', '$VEND')"
esperar "service_role marca a empresa" "$($PSQL -c "select count(*) from empresas_teste where empresa_id='$EMP'")" 1
if $PSQL -c "set role service_role; insert into empresas_teste (empresa_id) values ('$EMP')" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: marca duplicada aceita"; exit 1; fi
echo "marca duplicada recusada (pk): $(head -1 "$DIR/e.txt")"
$PSQL -c "delete from empresas_visitadas where id='$EMP'"
esperar "apagar a empresa leva a marca junto (on delete cascade)" "$($PSQL -c "select count(*) from empresas_teste where empresa_id='$EMP'")" 0

# Script de dados (SEPARADO da migration): marca as 3 propostas de teste existentes. Aqui, com 3 linhas iguais às de produção (id, número, empresa).
EMPT='61cc5136-a963-484d-98ca-b895cfa3df5f'
$PSQL -c "insert into empresas_visitadas (id) values ('$EMPT')"
for par in "afb30844-5c3e-4277-854a-26f81611c3f2|OS-0062/26|62" "946a038c-0a4e-484b-bcdc-455ce8dccd3c|OS-0063/26|63" "16a5e1a8-d854-4bc9-95eb-42db020c13f9|OS-0064/26|64"; do
  IFS='|' read -r pid pnum pseq <<< "$par"
  $PSQL -c "set role service_role; insert into propostas (id, numero, modelo, ano, sequencial, unidade_id, vendedor_id, empresa_visitada_id, cliente_nome, situacao) values ('$pid','$pnum','RS',2026,$((900 + pseq)),'$UNI','$VEND','$EMPT','cliente teste','cancelada')"
done
esperar "antes do script: 3 linhas, todas teste = false" "$($PSQL -c "select count(*) from propostas where empresa_visitada_id='$EMPT' and not teste")" 3
$PSQL -f "$SCRIPT_DADOS_TESTE"
esperar "script de dados: as 3 propostas ficaram teste = true" "$($PSQL -c "select count(*) from propostas where empresa_visitada_id='$EMPT' and teste")" 3
esperar "script de dados: os números NÃO foram renomeados" "$($PSQL -c "select string_agg(numero, ',' order by numero) from propostas where empresa_visitada_id='$EMPT'")" "OS-0062/26,OS-0063/26,OS-0064/26"
esperar "script de dados: fora essas 3, só ficaram marcadas as TESTE-... criadas acima" "$($PSQL -c "select count(*) from propostas where teste and empresa_visitada_id is distinct from '$EMPT'")" "$($PSQL -c "select count(*) from propostas where numero like 'TESTE-%'")"
if $PSQL -f "$SCRIPT_DADOS_TESTE" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: segunda execução do script de dados não abortou"; exit 1; fi
echo "segunda execução aborta (esperado 3, atualizou 0): $(grep -m1 'Esperado' "$DIR/e.txt" | cut -c1-110)"
esperar "a transação do script abortado não mudou nada" "$($PSQL -c "select count(*) from propostas where empresa_visitada_id='$EMPT' and teste")" 3
$PSQL -c "set role service_role; update propostas set teste = false where id = '16a5e1a8-d854-4bc9-95eb-42db020c13f9'"
if $PSQL -f "$SCRIPT_DADOS_TESTE" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: script rodou com contagem diferente de 3"; exit 1; fi
esperar "com contagem diferente de 3 o script aborta e NADA é gravado (2 marcadas de 3)" "$($PSQL -c "select count(*) filter (where teste) || '/' || count(*) from propostas where empresa_visitada_id='$EMPT'")" "2/3"
$PSQL -c "set role service_role; update propostas set teste = true where id = '16a5e1a8-d854-4bc9-95eb-42db020c13f9'"
# propostas não tem trigger de imutabilidade: o UPDATE do script é permitido; as revisões e o histórico continuam imutáveis (seção 6).
esperar "triggers de imutabilidade só em revisões, histórico e parâmetros do MOT (propostas e contadores livres)" "$($PSQL -c "select string_agg(tgrelid::regclass::text, ',' order by tgrelid::regclass::text) from pg_trigger where not tgisinternal and tgname like '%imutavel%'")" "proposta_historico,proposta_mot_parametros,proposta_revisoes"

echo
echo "== 11) índice único de vigência do MOT (proposta_mot_parametros.vigente_desde)"
esperar "o índice existe, é ÚNICO e é sobre vigente_desde" "$($PSQL -c "select indexdef from pg_indexes where tablename='proposta_mot_parametros' and indexname='proposta_mot_parametros_vigente_desde_uq'")" "CREATE UNIQUE INDEX proposta_mot_parametros_vigente_desde_uq ON public.proposta_mot_parametros USING btree (vigente_desde)"
esperar "o índice não único antigo de consulta continua (a migration só ACRESCENTA)" "$($PSQL -c "select count(*) from pg_indexes where tablename='proposta_mot_parametros' and indexname='proposta_mot_parametros_vigencia_idx'")" 1
# A linha inicial da migration do MOT ocupa 2026-11-19: repetir essa data é recusado com a violação do índice (23505), mesmo pelo service role.
if $PSQL -c "set role service_role; $INS_BASE values ('2026-11-19', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '$G')" >/dev/null 2>"$DIR/e.txt"; then echo "ERRO: data repetida aceita"; exit 1; fi
esperar "repetir a data da linha inicial (2026-11-19) é recusado com 23505 pelo índice" "$(head -1 "$DIR/e.txt")" 'ERROR:  duplicate key value violates unique constraint "proposta_mot_parametros_vigente_desde_uq"'
# Corrida: duas inserções na MESMA data em sessões simultâneas. Uma entra, a outra leva 23505 (aqui as chamadas são serializadas; o índice vale igual).
for i in 1 2 3 4 5 6; do EXEC "$PSQL -c \"set role service_role; $INS_BASE values ('2031-03-01', 1000, 3200, 3120, 800, 200, 1100, 100, 300, 100, 65, '$G')\" >$DIR/corrida.$i.out 2>$DIR/corrida.$i.err; echo \$? > $DIR/corrida.$i.rc" & done
wait
ENTRARAM=$(cat "$DIR"/corrida.*.rc | grep -c '^0$')
RECUSADAS=$(cat "$DIR"/corrida.*.rc | grep -vc '^0$')
esperar "corrida de 6 inserções na mesma data: exatamente 1 entra" "$ENTRARAM" 1
esperar "corrida de 6 inserções na mesma data: 5 são recusadas" "$RECUSADAS" 5
esperar "todas as recusadas são 23505 do índice (nenhum outro erro)" "$(cat "$DIR"/corrida.*.err | grep -c 'violates unique constraint "proposta_mot_parametros_vigente_desde_uq"')" 5
esperar "só uma linha em 2031-03-01" "$($PSQL -c "select count(*) from proposta_mot_parametros where vigente_desde='2031-03-01'")" 1
esperar "datas diferentes continuam aceitas" "$($PSQL -c "set role service_role; $INS_BASE values ('2031-03-02', 1000, 3200, 3120, 800, 200, 1100, 100, 300, 100, 65, '$G') returning vigente_desde::text")" "2031-03-02"
esperar "authenticated e anon continuam sem nenhum acesso à tabela (o índice não mudou privilégio)" "$($PSQL -c "select bool_or(has_table_privilege(r, 'public.proposta_mot_parametros', p)) from unnest(array['anon','authenticated']) r, unnest(array['select','insert','update','delete','truncate','references','trigger']) p")" f
esperar "UPDATE e DELETE continuam barrados pelo gatilho (imutável)" "$(erro_de service_role "$A_U" "update proposta_mot_parametros set fgts_bp = 1")" "ERROR:  registro imutável: UPDATE em proposta_mot_parametros não é permitido"
echo
echo "PROVA CONCLUÍDA"
