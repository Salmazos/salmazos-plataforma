#!/usr/bin/env bash
# Prova, num Postgres DESCARTÁVEL (nunca o Supabase de produção), o que o banco em memória do harness não consegue: as migrações da
# comissão (Fase 1 e Fase 2) aplicam limpas, o trigger torna o ledger imutável (e congela o lançamento fechado), os índices únicos
# barram marcação dupla, os CHECKs valem e o fechamento mensal é transacional, idempotente e respeita as regras de seleção.
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
do $$ begin create role anon; exception when duplicate_object then null; end $$;
-- Como no Supabase: função nova em public já nasce com EXECUTE explícito para anon, authenticated e service_role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
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


# ══════════════════════════════ FASE 2: fechamento mensal e pagamento ══════════════════════════════
# O CHECK novo (fechado_em e fechamento_id andam juntos) não admite as linhas de teste da Fase 1 com fechado_em solto; na produção a
# Fase 1 nunca preencheu fechado_em. Esvazia o ledger de TESTE (TRUNCATE não dispara o trigger de linha) e aplica a Fase 2.
$P -c "truncate public.comissao_lancamentos" >/dev/null
# Uma linha no formato da Fase 1 (fechado_em nulo) já existente quando a migração roda: o CHECK novo precisa aceitá-la (produção: 0 lançamentos).
$P -c "insert into cobrancas_rs(id,status) values ('c1000020-0000-4000-8000-000000000020','validada')" >/dev/null
$P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao) values ('c1000020-0000-4000-8000-000000000020','$B','comissao','prevista','2026-01-01',400,5,20)" >/dev/null
$P -f "$RAIZ/supabase/migration_comissao_fase2.sql" >/dev/null 2>&1 && echo "OK    migração da Fase 2 aplica limpa sobre a Fase 1" || { echo "FALHA migração da Fase 2 não aplica"; exit 1; }


CUR=$($P -c "select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date")
PREV=$($P -c "select ('$CUR'::date - interval '1 month')::date")
PREV2=$($P -c "select ('$CUR'::date - interval '2 month')::date")
FUT=$($P -c "select ('$CUR'::date + interval '1 month')::date")
U=$($P -c "select id from unidades limit 1")
B2=$($P -c "insert into comissao_beneficiarios(analista_perfil_id,percentual) select id,7.5 from analistas_perfil where nome_completo<>'Giovanni Prado' limit 1 returning id" 2>/dev/null)
[ -z "$B2" ] && B2=$($P -c "insert into analistas_perfil(nome_completo,unidade_id) values ('Rebecca Zambonini','$U') returning id" >/dev/null; $P -c "insert into comissao_beneficiarios(analista_perfil_id,percentual) select id,7.5 from analistas_perfil where nome_completo='Rebecca Zambonini' returning id")
for i in 3 4 5 6 7 8 9; do $P -c "insert into cobrancas_rs(id,status) values ('c100000$i-0000-4000-8000-00000000000$i','validada') on conflict do nothing" >/dev/null; done
CB() { echo "c100000$1-0000-4000-8000-00000000000$1"; }
lanc() { # lanc <cobranca n> <beneficiario> <status> <competencia> <valor>  -> id
  $P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao) values ('$(CB $1)','$2','comissao','$3','$4',400,5,$5) returning id"
}
fechar() { $P -c "select public.comissao_fechar_mes('$1'::date,'$U'::uuid,null,${2:-null},${3:-null})"; }
campo() { echo "$1" | sed -n "s/.*\"$2\": *\"\?\([^,\"}]*\).*/\1/p"; }
afirmar() { # afirmar "descrição" "esperado" "obtido"
  if [ "$2" = "$3" ]; then echo "OK    $1"; else echo "FALHA $1 (esperado '$2', veio '$3')"; falhas=1; fi
}

afirmar "CHECK novo aceita a linha da Fase 1 que já existia (fechado_em e fechamento_id nulos)" "1" "$($P -c "select count(*) from comissao_lancamentos where fechado_em is null and fechamento_id is null")"
for fn in "public.comissao_fechar_mes(date,uuid,uuid,integer,numeric)" "public.comissao_lancamentos_guard()" "public.comissao_fechamentos_guard()"; do
  afirmar "EXECUTE de $fn: anon=false authenticated=false service_role=true" "false|false|true" "$($P -c "select has_function_privilege('anon','$fn','execute')||'|'||has_function_privilege('authenticated','$fn','execute')||'|'||has_function_privilege('service_role','$fn','execute')")"
  afirmar "  ...e PUBLIC sem EXECUTE (proacl não tem '=X')" "0" "$($P -c "select count(*) from pg_proc where oid='$fn'::regprocedure and proacl::text like '%{=X%' or oid='$fn'::regprocedure and proacl::text like '%,=X%'")"
done
afirmar "search_path fixo ('') nas 3 funções" "3" "$($P -c "select count(*) from pg_proc where proname in ('comissao_fechar_mes','comissao_lancamentos_guard','comissao_fechamentos_guard') and exists (select 1 from unnest(proconfig) c where c = 'search_path=' || chr(34) || chr(34))")"
afirmar "nenhuma das 3 é SECURITY DEFINER (rodam com o privilégio de quem chama)" "0" "$($P -c "select count(*) from pg_proc where proname in ('comissao_fechar_mes','comissao_lancamentos_guard','comissao_fechamentos_guard') and prosecdef")"

R=$(fechar "$PREV"); afirmar "sem nada confirmado: 'nada_para_fechar' (não cria fechamento vazio)" nada_para_fechar "$(campo "$R" codigo)"
L_CONF=$(lanc 3 "$B" confirmada "$PREV" 20)
L_PREV=$(lanc 4 "$B" prevista "$PREV" 20)
L_RETRO=$(lanc 5 "$B2" retroativo_pendente "$PREV" 30)
R=$(fechar "$PREV"); afirmar "retroativo_pendente de competência <= mês BLOQUEIA o fechamento" bloqueado "$(campo "$R" codigo)"
$P -c "update comissao_lancamentos set status='contestada' where id='$L_RETRO'" >/dev/null 2>&1 && echo "INFO  (retroativo_pendente -> contestada não é transição válida; segue)" || true
$P -c "update comissao_lancamentos set status='recusada' where id='$L_RETRO'" >/dev/null
L_CONT=$(lanc 6 "$B2" prevista "$PREV" 30); $P -c "update comissao_lancamentos set status='contestada' where id='$L_CONT'" >/dev/null
R=$(fechar "$PREV"); afirmar "contestada de competência <= mês BLOQUEIA o fechamento" bloqueado "$(campo "$R" codigo)"
$P -c "update comissao_lancamentos set status='prevista' where id='$L_CONT'" >/dev/null
R=$(fechar "$PREV" 5 999); afirmar "prévia desatualizada (qtd/total esperados diferentes): aborta TUDO ('mudou_desde_a_previa')" mudou_desde_a_previa "$(campo "$R" codigo)"
afirmar "  ...e nada foi gravado" "0" "$($P -c "select count(*) from comissao_fechamentos")"
R=$(fechar "$PREV" 1 20); afirmar "fecha o mês (entra só a CONFIRMADA; prevista/recusada/contestada-resolvida ficam de fora)" true "$(campo "$R" ok)"
FECH=$(campo "$R" fechamento_id)
afirmar "  ...total 20,00 e 1 lançamento" "20.00|1" "$($P -c "select total||'|'||qtd_lancamentos from comissao_fechamentos where id='$FECH'")"
afirmar "  ...lançamentos fechados apontam para o fechamento" "1" "$($P -c "select count(*) from comissao_lancamentos where fechamento_id='$FECH' and fechado_em is not null")"
afirmar "  ...prevista NÃO foi fechada" "" "$($P -c "select fechamento_id from comissao_lancamentos where id='$L_PREV'")"
R2=$(fechar "$PREV"); afirmar "fechar de novo (duplo clique): devolve o MESMO fechamento (idempotente)" "$FECH" "$(campo "$R2" fechamento_id)"
afirmar "  ...sem duplicar" "1" "$($P -c "select count(*) from comissao_fechamentos")"

esperar BLOQUEOU "lançamento fechado: mudar status" "update comissao_lancamentos set status='cancelada' where id='$L_CONF'"
esperar BLOQUEOU "lançamento fechado: mudar valor" "update comissao_lancamentos set valor_comissao=1, base_valor=1 where id='$L_CONF'"
esperar BLOQUEOU "lançamento fechado: mexer nos metadados (nota de decisão)" "update comissao_lancamentos set resolucao_nota='x' where id='$L_CONF'"
esperar BLOQUEOU "lançamento fechado: desfazer o fechamento" "update comissao_lancamentos set fechado_em=null, fechamento_id=null where id='$L_CONF'"
esperar BLOQUEOU "lançamento fechado: trocar de fechamento" "update comissao_lancamentos set fechamento_id=gen_random_uuid() where id='$L_CONF'"
esperar BLOQUEOU "lançamento fechado: DELETE" "delete from comissao_lancamentos where id='$L_CONF'"
esperar BLOQUEOU "preencher só fechado_em (sem fechamento_id)" "update comissao_lancamentos set fechado_em=now() where id='$L_PREV'"
esperar BLOQUEOU "fechar uma comissão que NÃO está confirmada (prevista)" "update comissao_lancamentos set fechado_em=now(), fechamento_id='$FECH' where id='$L_PREV'"
esperar BLOQUEOU "fechar mudando outro campo na mesma operação" "update comissao_lancamentos set fechado_em=now(), fechamento_id='$FECH', status='confirmada', valor_comissao=999 where id='$L_PREV'"

# Mês seguinte: a prevista foi confirmada DEPOIS do fechamento do mês dela -> entra no PRÓXIMO fechamento, competência original preservada.
$P -c "update comissao_lancamentos set status='confirmada' where id='$L_PREV'" >/dev/null
L_CUR=$(lanc 7 "$B" confirmada "$CUR" 20)
# Estorno do mês corrente sobre um original já FECHADO (entra) e sobre um original que ainda NÃO conta (prevista: fica de fora).
L_OUTRA=$(lanc 8 "$B2" prevista "$CUR" 30)
$P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,valor_comissao,lancamento_origem_id,motivo) values ('$(CB 3)','$B','estorno','confirmada','$CUR',-5,'$L_CONF','devolveu parte')" >/dev/null
$P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,valor_comissao,lancamento_origem_id,motivo) values ('$(CB 8)','$B2','estorno','confirmada','$CUR',-10,'$L_OUTRA','ajuste em original ainda previsto')" >/dev/null
R=$(fechar "$FUT"); afirmar "mês futuro não fecha" mes_futuro "$(campo "$R" codigo)"
R=$(fechar "$PREV2"); afirmar "mês anterior a um fechamento já feito não fecha (o posterior já varreu o confirmado)" fechamento_posterior "$(campo "$R" codigo)"
R=$(fechar "$CUR"); afirmar "fecha o mês corrente" true "$(campo "$R" ok)"
FECH2=$(campo "$R" fechamento_id)
afirmar "  ...entram: a atrasada de $PREV (20) + a do mês (20) + o estorno de original fechado (−5) = 35,00 em 3 lançamentos" "35.00|3" "$($P -c "select total||'|'||qtd_lancamentos from comissao_fechamentos where id='$FECH2'")"
afirmar "  ...a atrasada preserva a competência original" "$PREV" "$($P -c "select competencia from comissao_lancamentos where id='$L_PREV'")"
afirmar "  ...estorno de original que ainda não conta (prevista) FICA DE FORA" "0" "$($P -c "select count(*) from comissao_lancamentos where tipo='estorno' and valor_comissao=-10 and fechamento_id is not null")"
afirmar "  ...o fechamento anterior não mudou" "20.00|1" "$($P -c "select total||'|'||qtd_lancamentos from comissao_fechamentos where id='$FECH'")"

# Total negativo/zero é aceito (só ajustes sobre originais fechados).
$P -c "update comissao_lancamentos set status='confirmada' where id='$L_OUTRA'" >/dev/null
L_Z=$(lanc 9 "$B" confirmada "$CUR" 20)
# (já fechou o corrente; um estorno novo cai no PRÓXIMO fechamento: simula o mês seguinte inserindo competência futura não é possível; valida pelo total negativo abaixo)

# ── outra unidade: o fechamento é por unidade; total NEGATIVO é aceito (só um estorno sobre original já fechado) ──
U2=$($P -c "insert into unidades(slug) values ('sbc') returning id")
P2=$($P -c "insert into analistas_perfil(nome_completo,unidade_id) values ('Beneficiaria SBC','$U2') returning id")
B3=$($P -c "insert into comissao_beneficiarios(analista_perfil_id,percentual,unidade_id) values ('$P2',5,'$U2') returning id")
CBX=c1000010-0000-4000-8000-000000000010
$P -c "insert into cobrancas_rs(id,status) values ('$CBX','validada')" >/dev/null
LU2=$($P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao,unidade_id) values ('$CBX','$B3','comissao','confirmada','$PREV',400,5,20,'$U2') returning id")
RU=$($P -c "select public.comissao_fechar_mes('$PREV'::date,'$U2'::uuid,null)"); afirmar "unidade 2: fecha o próprio mês sem misturar com a unidade 1" "20.00|1" "$($P -c "select total||'|'||qtd_lancamentos from comissao_fechamentos where id='$(campo "$RU" fechamento_id)'")"
$P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,valor_comissao,lancamento_origem_id,motivo,unidade_id) values ('$CBX','$B3','estorno','confirmada','$CUR',-5,'$LU2','cliente devolveu','$U2')" >/dev/null
RN=$($P -c "select public.comissao_fechar_mes('$CUR'::date,'$U2'::uuid,null)"); afirmar "total NEGATIVO (só um estorno) é aceito: −5,00 em 1 lançamento" "-5.00|1" "$($P -c "select total||'|'||qtd_lancamentos from comissao_fechamentos where id='$(campo "$RN" fechamento_id)'")"
afirmar "fechamentos: 1 da unidade 1 no mês anterior + 1 no corrente; 2 da unidade 2" "2|2" "$($P -c "select (select count(*) from comissao_fechamentos where unidade_id='$U')||'|'||(select count(*) from comissao_fechamentos where unidade_id='$U2')")"

# ── retroativo ANTIGO de mês já fechado continua bloqueando o fechamento seguinte ──
U3=$($P -c "insert into unidades(slug) values ('u3') returning id")
P3=$($P -c "insert into analistas_perfil(nome_completo,unidade_id) values ('Beneficiario U3','$U3') returning id")
B4=$($P -c "insert into comissao_beneficiarios(analista_perfil_id,percentual,unidade_id) values ('$P3',5,'$U3') returning id")
$P -c "insert into cobrancas_rs(id,status) values ('c1000011-0000-4000-8000-000000000011','validada'),('c1000012-0000-4000-8000-000000000012','validada'),('c1000013-0000-4000-8000-000000000013','validada')" >/dev/null
$P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao,unidade_id) values ('c1000011-0000-4000-8000-000000000011','$B4','comissao','confirmada','$PREV2',400,5,20,'$U3')" >/dev/null
RA=$($P -c "select public.comissao_fechar_mes('$PREV2'::date,'$U3'::uuid,null)"); afirmar "unidade 3: fecha o mês antigo" true "$(campo "$RA" ok)"
RETRO=$($P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao,unidade_id) values ('c1000012-0000-4000-8000-000000000012','$B4','comissao','retroativo_pendente','$PREV2',400,5,20,'$U3') returning id")
$P -c "insert into comissao_lancamentos(cobranca_id,beneficiario_id,tipo,status,competencia,base_valor,percentual_aplicado,valor_comissao,unidade_id) values ('c1000013-0000-4000-8000-000000000013','$B4','comissao','confirmada','$PREV',400,5,20,'$U3')" >/dev/null
RB=$($P -c "select public.comissao_fechar_mes('$PREV'::date,'$U3'::uuid,null)"); afirmar "retroativo de mês JÁ FECHADO (competência antiga) bloqueia o fechamento do mês seguinte" bloqueado "$(campo "$RB" codigo)"
afirmar "  ...e o bloqueio aponta o lançamento certo" "$RETRO" "$(echo "$RB" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p')"
$P -c "update comissao_lancamentos set status='recusada' where id='$RETRO'" >/dev/null
RC=$($P -c "select public.comissao_fechar_mes('$PREV'::date,'$U3'::uuid,null)"); afirmar "resolvido o retroativo, o mês seguinte fecha" true "$(campo "$RC" ok)"

# ── fechamentos: imutáveis, pagamento uma única vez ──
esperar BLOQUEOU "fechamento: DELETE" "delete from comissao_fechamentos where id='$FECH'"
esperar BLOQUEOU "fechamento: mudar total" "update comissao_fechamentos set total=1 where id='$FECH'"
esperar BLOQUEOU "fechamento: mudar competência" "update comissao_fechamentos set competencia='$PREV2' where id='$FECH'"
esperar BLOQUEOU "fechamento: pagamento sem quem registrou/quando (CHECK)" "update comissao_fechamentos set pago_em=current_date where id='$FECH'"
esperar PERMITIU "fechamento: registrar pagamento (data + quando)" "update comissao_fechamentos set pago_em=current_date, pago_registrado_em=now() where id='$FECH'"
esperar BLOQUEOU "fechamento: pagamento já registrado não se altera" "update comissao_fechamentos set pago_em=current_date-1 where id='$FECH'"
esperar BLOQUEOU "fechamento: pagamento não se desfaz" "update comissao_fechamentos set pago_em=null, pago_registrado_em=null where id='$FECH'"
esperar BLOQUEOU "fechamento: mês do mesmo (competência, unidade) não duplica" "insert into comissao_fechamentos(competencia,unidade_id,total,qtd_lancamentos) values ('$PREV','$U',1,1)"
esperar BLOQUEOU "função de fechar: authenticated NÃO executa" "set role authenticated; select public.comissao_fechar_mes('$CUR'::date,'$U'::uuid,null)"
esperar BLOQUEOU "função de fechar: anon NÃO executa" "set role anon; select public.comissao_fechar_mes('$CUR'::date,'$U'::uuid,null)"
R=$($P -c "select public.comissao_fechar_mes('$CUR'::date,'a0a0a0a0-0000-4000-8000-000000000000'::uuid,null)"); afirmar "unidade que não existe: 'unidade_invalida' (nada gravado)" unidade_invalida "$(campo "$R" codigo)"
R=$($P -c "select public.comissao_fechar_mes('$CUR'::date,null,null)"); afirmar "unidade nula: 'unidade_invalida'" unidade_invalida "$(campo "$R" codigo)"
R=$($P -c "select public.comissao_fechar_mes('$CUR'::date + 3,'$U'::uuid,null)" 2>&1); afirmar "competência que não é dia 1: erro claro" "1" "$(echo "$R" | grep -c 'competência deve ser o 1º dia do mês')"
[ "$($P -c "select count(*) from pg_policies where tablename='comissao_fechamentos' and roles <> '{service_role}'")" = "0" ] && echo "OK    RLS: comissao_fechamentos só service_role" || { echo "FALHA RLS fechamentos"; falhas=1; }

[ $falhas -eq 0 ] && echo "TUDO OK" || echo "HÁ FALHAS"
exit $falhas
