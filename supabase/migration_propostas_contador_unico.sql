-- Contador ÚNICO de numeração das propostas REAIS: uma só sequência por ano, para todas as modalidades (R&S, MOT e TS), que zera na virada do ano.
-- APLICADA em 25/11/2026 (Supabase, conferida por SELECT). Nenhum DROP de tabela, TRUNCATE ou DELETE; nenhuma tabela ou linha existente é alterada;
-- idempotente; tudo numa única transação (se qualquer comando falhar, nada fica criado). Pressupõe supabase/migration_propostas.sql, migration_propostas_sigla.sql,
-- migration_propostas_mot.sql e migration_propostas_teste.sql já aplicadas (usa propostas, proposta_contadores e a criar_proposta de 11 argumentos).
--
-- (a) proposta_contador_unico (ano, ultimo), PK (ano): o contador das propostas REAIS. criar_proposta passa a usá-lo no lugar de proposta_contadores
--     (modelo, ano). A marca da modalidade continua no número: SIGLA-nnnn/aa (R&S), SIGLA-MOT-nnnn/aa e SIGLA-TS-nnnn/aa; só o sequencial deixa de ser por
--     modalidade. As três modalidades em sequência recebem números consecutivos (hoje: 72, 73, 74...).
-- (b) Semente CALCULADA na hora de aplicar (nunca um número fixo), para o ano corrente em São Paulo:
--       ultimo = greatest(max(ultimo) de proposta_contadores nesse ano, max(sequencial) das propostas reais (teste = false) nesse ano, 0)
--     e só se a linha do ano ainda não existir. Em 25/11/2026 isso dá 71 (RS=71, MOT=71, maior sequencial real emitido = 65): a próxima proposta real de
--     QUALQUER modalidade sai como 72. Os números já emitidos não mudam; as lacunas (62 a 64, que viraram propostas de teste, e 66 a 71, do ajuste manual do
--     contador) ficam como estão.
-- (c) Virada de ano automática: criar_proposta calcula o ano em America/Sao_Paulo a cada chamada e a linha do ano novo nasce com 1 pelo "on conflict": a primeira
--     proposta de 2027 sai SIGLA-0001/27. Quem criar às 23:59 de 31/12 ainda sai /26.
-- (d) criar_proposta (11 argumentos): create or replace, MESMA assinatura, MESMO retorno, SECURITY INVOKER, search_path = public, pg_temp, execute só para
--     service_role. Troca SÓ o contador (mantém a validação de modelo e de sigla e o formato do número). Contador e proposta na MESMA transação: insert que
--     falha devolve o contador (sem buraco), e criações simultâneas são serializadas pelo lock da linha do contador (nunca repetem número).
-- (e) NÃO ALTERADOS: criar_proposta_teste (a sequência TESTE-... continua por modalidade; evita o conflito com os sequenciais 62, 63 e 64 de OS-0062/63/64,
--     propostas de teste, no índice propostas_modelo_ano_seq_teste_uq), proposta_contadores e proposta_contadores_teste (ficam congelados como histórico:
--     nada mais lê nem escreve neles para as propostas reais).
-- (f) Rede de segurança: índice único parcial propostas_ano_seq_real_uq (ano, sequencial) where not teste: dois números reais nunca repetem o sequencial no ano.
--     Conferência feita por SELECT em 25/11/2026, ANTES de incluí-lo: não há violação. Propostas reais existentes (9, todas R&S, ano 2026, uma por sequencial):
--       ES-0054/26 (54), ES-0055/26 (55), ES-0056/26 (56), LM-0057/26 (57), LM-0058/26 (58), ES-0059/26 (59), ES-0060/26 (60), ES-0061/26 (61), LM-0065/26 (65).
--     A consulta que prova (esperado: 0 linhas; se devolver alguma, o índice NÃO é criado e esta migration falha inteira, sem alterar nada):
--       select ano, sequencial, count(*) from public.propostas where not teste group by 1, 2 having count(*) > 1;

begin;

create table if not exists public.proposta_contador_unico (
  ano     int primary key,
  ultimo  int not null default 0 check (ultimo >= 0)
);

-- Só service role (que bypassa a RLS): anon e authenticated não têm nenhum privilégio, nem select. RLS ligada e sem policy.
revoke all on public.proposta_contador_unico from public, anon, authenticated;
alter table public.proposta_contador_unico enable row level security;
grant select, insert, update on public.proposta_contador_unico to service_role;

-- Semente do ano corrente (São Paulo), calculada agora; só se a linha do ano ainda não existir (reaplicar não regride nem altera o contador).
insert into public.proposta_contador_unico (ano, ultimo)
select a.ano,
       greatest(
         coalesce((select max(c.ultimo) from public.proposta_contadores c where c.ano = a.ano), 0),
         coalesce((select max(p.sequencial) from public.propostas p where p.ano = a.ano and not p.teste), 0),
         0
       )
from (select extract(year from (now() at time zone 'America/Sao_Paulo'))::int as ano) a
on conflict (ano) do nothing;

-- Rede de segurança: sequencial real único por ano, em qualquer modalidade.
create unique index if not exists propostas_ano_seq_real_uq on public.propostas (ano, sequencial) where not teste;

-- criar_proposta: igual à de produção, trocando só o contador (proposta_contador_unico, por ano) no lugar de proposta_contadores (por modelo e ano).
create or replace function public.criar_proposta(
  p_modelo text,
  p_sigla text,
  p_unidade_id uuid,
  p_vendedor_id uuid,
  p_empresa_visitada_id uuid,
  p_oportunidade_id uuid,
  p_cliente_nome text,
  p_aos_cuidados text,
  p_conteudo jsonb,
  p_template_versao int,
  p_validade_dias int
) returns public.propostas
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ano int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  v_seq int;
  v_linha public.propostas;
begin
  if p_modelo not in ('RS','MOT','TS') then
    raise exception 'Modelo de proposta inválido: %', p_modelo using errcode = '22023';
  end if;
  if p_sigla is null or p_sigla !~ '^[A-Z]{1,4}$' then
    raise exception 'Sigla de proposta inválida: %', coalesce(p_sigla, '(nula)') using errcode = '22023';
  end if;

  insert into proposta_contador_unico as c (ano, ultimo)
  values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_seq;

  insert into propostas (
    numero, modelo, ano, sequencial, unidade_id, vendedor_id, empresa_visitada_id, oportunidade_id,
    cliente_nome, aos_cuidados, conteudo, template_versao, validade_dias
  ) values (
    -- R&S: SIGLA-0072/26 (inalterado). MOT e TS: SIGLA-MOT-0073/26, SIGLA-TS-0074/26. O sequencial é ÚNICO por ano, para todas as modalidades.
    case when p_modelo = 'RS' then p_sigla || '-' else p_sigla || '-' || p_modelo || '-' end
      || lpad(v_seq::text, 4, '0') || '/' || lpad((v_ano % 100)::text, 2, '0'),
    p_modelo, v_ano, v_seq, p_unidade_id, p_vendedor_id, p_empresa_visitada_id, p_oportunidade_id,
    p_cliente_nome, p_aos_cuidados, coalesce(p_conteudo, '{}'::jsonb), p_template_versao, p_validade_dias
  ) returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.criar_proposta(text, text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.criar_proposta(text, text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) to service_role;

commit;

-- Conferência depois de aplicar (rodar um por vez):
--   1) Semente (esperado: 1 linha, ano 2026, ultimo 71):
--        select ano, ultimo from public.proposta_contador_unico order by ano;
--   2) Próximo número, SEM consumir o contador (esperado: 72, para qualquer modalidade):
--        select ultimo + 1 as proximo_sequencial from public.proposta_contador_unico where ano = extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
--   3) RLS ligada (esperado: true):
--        select relrowsecurity from pg_class where oid = 'public.proposta_contador_unico'::regclass;
--   4) Sem privilégio para anon e authenticated, só service_role (esperado: anon f, authenticated f, service_role t):
--        select r as papel, has_table_privilege(r, 'public.proposta_contador_unico', 'select') as pode_ler
--          from unnest(array['anon','authenticated','service_role']) r;
--   (extra) Índice e função (esperado: 1 índice com "where (not teste)"; criar_proposta continua sem execute para anon/authenticated):
--        select indexdef from pg_indexes where indexname = 'propostas_ano_seq_real_uq';
--        select r, has_function_privilege(r, 'public.criar_proposta(text,text,uuid,uuid,uuid,uuid,text,text,jsonb,integer,integer)', 'execute')
--          from unnest(array['anon','authenticated','service_role']) r;
