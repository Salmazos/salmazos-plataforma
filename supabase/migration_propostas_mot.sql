-- Propostas de Mão de Obra Temporária (MOT): contador próprio, número com o modelo e percentuais da planilha de verbas.
-- NÃO APLICADA: aplicar manualmente (Supabase) e conferir por SELECT. Nenhum DROP, TRUNCATE, DELETE ou alteração de tabela/dado
-- existente; idempotente; tudo numa única transação (se qualquer comando falhar, nada fica criado). Pressupõe
-- supabase/migration_propostas.sql (e a sobrecarga de 11 argumentos de criar_proposta) já aplicadas.
--
-- (a) Contador MOT: o próximo número do MOT em 2026 é o 72 (o modelo Word já enviado usa 071/26). `greatest` nunca regride o
--     contador se já houver propostas MOT.
-- (b) criar_proposta: ÚNICA mudança é o formato do número. R&S fica exatamente como era (SIGLA-0062/26); os demais modelos levam o
--     modelo no número (SIGLA-MOT-0072/26, SIGLA-TS-0001/26). Isso resolve a colisão de numero_uq que a migration_propostas.sql
--     registrou como risco: um número de MOT/TS nunca é igual ao de R&S, mesmo com a mesma sigla e o mesmo sequencial.
--     Assinatura, retorno, linguagem, search_path, NÃO-security-definer, grants e a regra do contador ficam como estão em produção.
--     Produção (conferido por SELECT em 19/11/2026): função em plpgsql, SECURITY INVOKER, search_path = public, pg_temp,
--     execute só para postgres e service_role.
-- (c) proposta_mot_parametros: percentuais da planilha de verbas, em pontos-base inteiros (31,2% = 3120; 0,65% = 65). Só inserção:
--     cada mudança é uma linha nova com vigente_desde; a regra de leitura é "a vigência mais recente com vigente_desde <= hoje"
--     (parametros_mot_vigentes). Authenticated não tem nenhum privilégio (nem select): leitura e escrita só pela API com service
--     role, que confere se quem altera é diretoria/superuser. Cada proposta MOT grava no snapshot os percentuais que usou.

begin;

-- (a) Contador MOT 2026 em 71: a próxima proposta MOT é a 72.
insert into public.proposta_contadores (modelo, ano, ultimo) values ('MOT', 2026, 71)
on conflict (modelo, ano) do update set ultimo = greatest(proposta_contadores.ultimo, excluded.ultimo);

-- (b) Formato do número por modelo.
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
    -- R&S: SIGLA-0062/26 (inalterado). MOT e TS: SIGLA-MOT-0072/26, SIGLA-TS-0001/26.
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

-- (c) Percentuais da planilha de verbas (pontos-base inteiros, 0 a 10000 = 0% a 100%).
create table if not exists public.proposta_mot_parametros (
  id                      uuid primary key default gen_random_uuid(),
  vigente_desde           date not null,
  taxa_administrativa_bp  int  not null check (taxa_administrativa_bp  between 0 and 10000),
  encargos_tributarios_bp int  not null check (encargos_tributarios_bp between 0 and 10000),
  inss_patronal_bp        int  not null check (inss_patronal_bp        between 0 and 10000),
  fgts_bp                 int  not null check (fgts_bp                 between 0 and 10000),
  ret_iss_bp              int  not null check (ret_iss_bp              between 0 and 10000),
  ret_inss_bp             int  not null check (ret_inss_bp             between 0 and 10000),
  ret_ir_bp               int  not null check (ret_ir_bp               between 0 and 10000),
  ret_cofins_bp           int  not null check (ret_cofins_bp           between 0 and 10000),
  ret_csll_bp             int  not null check (ret_csll_bp             between 0 and 10000),
  ret_pis_bp              int  not null check (ret_pis_bp              between 0 and 10000),
  -- Nulo na linha inicial (carga da migração); depois, quem alterou (diretoria/superuser, conferido pela API).
  alterado_por            uuid references public.analistas_perfil(id),
  created_at              timestamptz not null default now()
);
create index if not exists proposta_mot_parametros_vigencia_idx on public.proposta_mot_parametros (vigente_desde desc, created_at desc);

-- Somente inserção, para qualquer papel (inclusive service role): reaproveita o gatilho de proposta_historico/proposta_revisoes.
drop trigger if exists proposta_mot_parametros_imutavel on public.proposta_mot_parametros;
create trigger proposta_mot_parametros_imutavel before update or delete on public.proposta_mot_parametros
  for each row execute function public.proposta_registro_imutavel();

-- Authenticated e anon: nenhum privilégio, nem select. RLS ligada e sem policy: só o service role (que a bypassa) lê e escreve.
revoke all on public.proposta_mot_parametros from public, anon, authenticated;
alter table public.proposta_mot_parametros enable row level security;

-- Linha inicial (PARAMETROS_MOT_INICIAIS de src/lib/propostaMotCalculo.ts), só se a tabela ainda estiver vazia.
insert into public.proposta_mot_parametros (
  vigente_desde, taxa_administrativa_bp, encargos_tributarios_bp, inss_patronal_bp, fgts_bp,
  ret_iss_bp, ret_inss_bp, ret_ir_bp, ret_cofins_bp, ret_csll_bp, ret_pis_bp
)
select date '2026-11-19', 1000, 3200, 3120, 800, 200, 1100, 100, 300, 100, 65
where not exists (select 1 from public.proposta_mot_parametros);

-- Regra de leitura num só lugar: a vigência mais recente com vigente_desde <= hoje (empate no mesmo dia: a criada por último).
-- Sem linha vigente (hoje antes da primeira vigência) devolve nenhuma linha: quem chama decide (a API recusa, não inventa).
create or replace function public.parametros_mot_vigentes(
  p_hoje date default ((now() at time zone 'America/Sao_Paulo')::date)
) returns setof public.proposta_mot_parametros
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.proposta_mot_parametros
  where vigente_desde <= p_hoje
  order by vigente_desde desc, created_at desc
  limit 1
$$;

revoke all on function public.parametros_mot_vigentes(date) from public, anon, authenticated;
grant execute on function public.parametros_mot_vigentes(date) to service_role;

commit;
