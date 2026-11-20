-- Propostas de TESTE como categoria própria: sequência de número separada, flag na proposta e empresa marcada como "de teste".
-- NÃO APLICADA: aplicar manualmente (Supabase) e conferir por SELECT. APLICAR ANTES do deploy do código: a lista de Propostas passa a filtrar por
-- propostas.teste e a criação passa a consultar empresas_teste. Aditiva e idempotente; uma única transação (se algo falhar, nada fica criado).
-- Nenhum DROP de dado, TRUNCATE ou DELETE. Única alteração de objeto existente: a restrição de unicidade (modelo, ano, sequencial) vira
-- (modelo, ano, sequencial, teste), que é MAIS FROUXA para as reais (continuam únicas entre si) e permite sequencial 1 de teste e real no mesmo ano.
-- criar_proposta (assinatura de 11 argumentos usada pelo app) NÃO é tocada: propostas reais seguem exatamente como hoje.
--
-- Pressupõe migration_propostas.sql e migration_propostas_mot.sql já aplicadas.
--
-- Número de teste: TESTE-0001/26 (R&S), TESTE-MOT-0001/26, TESTE-TS-0001/26. Não colide com número real: a sigla real é sempre 1 a 4 letras
-- (criar_proposta recusa o resto), e "TESTE" tem 5. O contador de teste é próprio (proposta_contadores_teste): o contador real não anda.
--
-- O UPDATE que marca as 3 propostas de teste já existentes (OS-0062, OS-0063, OS-0064) NÃO está aqui: é o script supabase/dados_propostas_teste_marcar_existentes.sql.

begin;

-- 1) Flag na proposta, fixada na criação. Default false: nada muda para as propostas existentes.
alter table public.propostas add column if not exists teste boolean not null default false;

-- 2) Unicidade por (modelo, ano, sequencial, teste).
alter table public.propostas drop constraint if exists propostas_modelo_ano_seq_uq;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'propostas_modelo_ano_seq_teste_uq' and conrelid = 'public.propostas'::regclass
  ) then
    alter table public.propostas add constraint propostas_modelo_ano_seq_teste_uq unique (modelo, ano, sequencial, teste);
  end if;
end $$;

-- 3) Empresa marcada como "de teste" (só a diretoria marca, pela API com service role). Sem policy e sem nenhum privilégio para anon/authenticated:
-- a empresa_visitada tem policy ALL para qualquer analista, então a flag NÃO fica na tabela dela (qualquer analista a alteraria direto no PostgREST).
create table if not exists public.empresas_teste (
  empresa_id  uuid primary key references public.empresas_visitadas(id) on delete cascade,
  marcado_por uuid references public.analistas_perfil(id),
  created_at  timestamptz not null default now()
);
revoke all on public.empresas_teste from public, anon, authenticated;
alter table public.empresas_teste enable row level security;

-- 4) Contador próprio das propostas de teste (mesma proteção do contador real: só service role).
create table if not exists public.proposta_contadores_teste (
  modelo text not null check (modelo in ('RS','MOT','TS')),
  ano    int  not null,
  ultimo int  not null default 0 check (ultimo >= 0),
  primary key (modelo, ano)
);
revoke all on public.proposta_contadores_teste from public, anon, authenticated;
alter table public.proposta_contadores_teste enable row level security;

-- 5) Cria a proposta de teste em rascunho com número TESTE-... e o contador de teste, na MESMA transação (insert que falha devolve o contador).
-- Mesmos atributos de criar_proposta: plpgsql, SECURITY INVOKER, search_path = public, pg_temp, execute só para service_role.
create or replace function public.criar_proposta_teste(
  p_modelo text,
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

  insert into proposta_contadores_teste as c (modelo, ano, ultimo)
  values (p_modelo, v_ano, 1)
  on conflict (modelo, ano) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_seq;

  insert into propostas (
    numero, modelo, ano, sequencial, teste, unidade_id, vendedor_id, empresa_visitada_id, oportunidade_id,
    cliente_nome, aos_cuidados, conteudo, template_versao, validade_dias
  ) values (
    -- R&S: TESTE-0001/26. MOT e TS: TESTE-MOT-0001/26, TESTE-TS-0001/26.
    case when p_modelo = 'RS' then 'TESTE-' else 'TESTE-' || p_modelo || '-' end
      || lpad(v_seq::text, 4, '0') || '/' || lpad((v_ano % 100)::text, 2, '0'),
    p_modelo, v_ano, v_seq, true, p_unidade_id, p_vendedor_id, p_empresa_visitada_id, p_oportunidade_id,
    p_cliente_nome, p_aos_cuidados, coalesce(p_conteudo, '{}'::jsonb), p_template_versao, p_validade_dias
  ) returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.criar_proposta_teste(text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.criar_proposta_teste(text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) to service_role;

commit;
