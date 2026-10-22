-- Propostas: número com a sigla do vendedor (iniciais) em vez do modelo. NÃO APLICADA: aplicar manualmente (Supabase) e conferir por SELECT.
-- Só CRIA uma sobrecarga de criar_proposta (nenhum DROP, nenhuma alteração de tabela ou dado); idempotente. Pressupõe
-- supabase/migration_propostas.sql já aplicada. O mesmo texto está na versão canônica (migration_propostas.sql).

begin;

-- Sigla do número = iniciais do vendedor (calculadas pelo app, ex.: OS-0053/26). O contador continua UM por modelo+ano
-- (proposta_contadores), então o sequencial é o mesmo de antes; só o prefixo do texto muda.
-- ATENÇÃO (risco conhecido, não tratado agora): como o prefixo deixou de ser o modelo, duas propostas de MODELOS
-- diferentes com o mesmo sequencial e a mesma sigla (ex.: RS nº 60 e MOT nº 60 do mesmo vendedor, ou de quem tem as
-- mesmas iniciais) gerariam o mesmo texto e violariam propostas_numero_uq. A criação falharia (e o contador voltaria,
-- na mesma transação), bloqueando aquela sigla naquele modelo até o outro contador andar. Hoje só o R&S está ativo, então
-- não ocorre; resolver ANTES de ativar MOT ou TS (contador único por ano, ou o modelo de volta no número).
-- Sobrecarga: a versão sem p_sigla (acima) fica até o merge, para a prévia atual não quebrar. Depois do merge, rodar:
--   drop function if exists public.criar_proposta(text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int);
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

  insert into proposta_contadores as c (modelo, ano, ultimo)
  values (p_modelo, v_ano, 1)
  on conflict (modelo, ano) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_seq;

  insert into propostas (
    numero, modelo, ano, sequencial, unidade_id, vendedor_id, empresa_visitada_id, oportunidade_id,
    cliente_nome, aos_cuidados, conteudo, template_versao, validade_dias
  ) values (
    p_sigla || '-' || lpad(v_seq::text, 4, '0') || '/' || lpad((v_ano % 100)::text, 2, '0'),
    p_modelo, v_ano, v_seq, p_unidade_id, p_vendedor_id, p_empresa_visitada_id, p_oportunidade_id,
    p_cliente_nome, p_aos_cuidados, coalesce(p_conteudo, '{}'::jsonb), p_template_versao, p_validade_dias
  ) returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.criar_proposta(text, text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.criar_proposta(text, text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) to service_role;

commit;
