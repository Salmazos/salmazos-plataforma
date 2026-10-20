-- Propostas comerciais (Comercial) — Fase 1: modelo R&S ativo; MOT e TS já aceitos pelo CHECK/contador.
-- NÃO APLICADA: aplicar manualmente (Supabase) e conferir por SELECT. Só cria objetos novos (nenhum DROP de
-- tabela/dado, nenhum TRUNCATE/DELETE); idempotente. Tudo dentro de uma única transação: se qualquer comando
-- falhar, nada fica criado.
--
-- Numeração oficial: <PREFIXO>-<sequencial 4 dígitos>/<ano 2 dígitos>, ex.: RS-0052/26. O sequencial é
-- por modelo + ano (ano em America/Sao_Paulo) e recomeça em 0001 a cada ano. Gerado só por criar_proposta():
-- o contador e a proposta são gravados na MESMA transação, então insert que falha devolve o contador
-- (sem buraco) e sessões concorrentes são serializadas pelo lock da linha do contador.
--
-- Ajuste do contador para continuar a numeração que já existia fora da plataforma (a próxima R&S de 2026
-- deve ser a 53). Rodar UMA vez, antes da primeira proposta de 2026, sem tela. Não regride o contador se
-- já houver propostas (greatest):
--   insert into proposta_contadores (modelo, ano, ultimo) values ('RS', 2026, 52)
--   on conflict (modelo, ano) do update set ultimo = greatest(proposta_contadores.ultimo, excluded.ultimo);
--
-- Propostas nunca são apagadas (só canceladas) e revisões/histórico são imutáveis, inclusive para o service
-- role (trigger). Limpeza legítima (ex.: dado de teste) só por SQL de superusuário, desligando o trigger:
--   alter table public.proposta_revisoes  disable trigger proposta_revisoes_imutavel;
--   alter table public.proposta_historico disable trigger proposta_historico_imutavel;
--   ... delete ...;
--   alter table public.proposta_revisoes  enable trigger proposta_revisoes_imutavel;
--   alter table public.proposta_historico enable trigger proposta_historico_imutavel;
-- (o trigger também barra o ON DELETE CASCADE vindo de propostas, de propósito.)

begin;

create table if not exists public.proposta_contadores (
  modelo text not null check (modelo in ('RS','MOT','TS')),
  ano    int  not null,
  ultimo int  not null default 0 check (ultimo >= 0),
  primary key (modelo, ano)
);

create table if not exists public.propostas (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null,
  modelo              text not null check (modelo in ('RS','MOT','TS')),
  ano                 int  not null,
  sequencial          int  not null check (sequencial > 0),
  revisao_atual       int  not null default 0 check (revisao_atual >= 0),
  situacao            text not null default 'rascunho'
                      check (situacao in ('rascunho','enviada','em_negociacao','aceita','recusada','vencida','cancelada')),
  unidade_id          uuid not null references public.unidades(id),
  vendedor_id         uuid not null references public.analistas_perfil(id),
  empresa_visitada_id uuid references public.empresas_visitadas(id) on delete set null,
  oportunidade_id     uuid references public.oportunidades(id) on delete set null,
  -- Dados editáveis da proposta em rascunho. CNPJ, endereço, condições e percentuais ficam no jsonb
  -- (validado por Zod no app); o banco só garante a forma.
  cliente_nome        text not null,
  aos_cuidados        text,
  conteudo            jsonb not null default '{}'::jsonb,
  template_versao     int  not null default 1,
  validade_dias       int  not null default 15 check (validade_dias between 1 and 90),
  validade_ate        date,
  valor_estimado      numeric,
  enviada_em          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint propostas_numero_uq unique (numero),
  constraint propostas_modelo_ano_seq_uq unique (modelo, ano, sequencial)
);
create index if not exists propostas_vendedor_idx on public.propostas (vendedor_id, situacao);
create index if not exists propostas_unidade_idx on public.propostas (unidade_id);
create index if not exists propostas_empresa_idx on public.propostas (empresa_visitada_id);
create index if not exists propostas_oportunidade_idx on public.propostas (oportunidade_id);
create index if not exists propostas_validade_idx on public.propostas (validade_ate) where situacao in ('enviada','em_negociacao');

-- Uma linha por versão entregue (Rev. 0 no primeiro envio, depois 1, 2…). `conteudo` é o SNAPSHOT COMPLETO do
-- documento (número, data, empresa, CNPJ, endereço, A/C, condições, validade, vendedor etc.): o PDF de uma
-- revisão é gerado só a partir dele, nunca de dados vivos. Somente inserção.
create table if not exists public.proposta_revisoes (
  id                uuid primary key default gen_random_uuid(),
  proposta_id       uuid not null references public.propostas(id) on delete cascade,
  revisao           int  not null check (revisao >= 0),
  conteudo          jsonb not null,
  template_versao   int  not null,
  vendedor_nome     text,
  vendedor_telefone text,
  criado_por        uuid references public.analistas_perfil(id),
  created_at        timestamptz not null default now(),
  constraint proposta_revisoes_uq unique (proposta_id, revisao)
);

-- Histórico de mudanças de situação. autor_id nulo = mudança automática (vencimento). Somente inserção.
create table if not exists public.proposta_historico (
  id          uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  de          text,
  para        text not null,
  autor_id    uuid references public.analistas_perfil(id),
  observacao  text,
  created_at  timestamptz not null default now()
);
create index if not exists proposta_historico_proposta_idx on public.proposta_historico (proposta_id, created_at);

-- Imutabilidade vale para qualquer papel, inclusive service role (que bypassa RLS e privilégios de coluna).
create or replace function public.proposta_registro_imutavel() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'registro imutável: % em % não é permitido', tg_op, tg_table_name using errcode = '42501';
end;
$$;
revoke execute on function public.proposta_registro_imutavel() from public, anon, authenticated;

drop trigger if exists proposta_revisoes_imutavel on public.proposta_revisoes;
create trigger proposta_revisoes_imutavel before update or delete on public.proposta_revisoes
  for each row execute function public.proposta_registro_imutavel();
drop trigger if exists proposta_historico_imutavel on public.proposta_historico;
create trigger proposta_historico_imutavel before update or delete on public.proposta_historico
  for each row execute function public.proposta_registro_imutavel();

-- Privilégios: anon nada; authenticated só o que as policies usam; contador só service role.
-- Proposta nunca é apagada (sem DELETE para ninguém além de superusuário).
revoke all on public.proposta_contadores from anon, authenticated;
revoke all on public.propostas           from anon, authenticated;
revoke all on public.proposta_revisoes   from anon, authenticated;
revoke all on public.proposta_historico  from anon, authenticated;
grant select, insert, update on public.propostas          to authenticated;
grant select, insert         on public.proposta_revisoes  to authenticated;
grant select, insert         on public.proposta_historico to authenticated;

-- RLS no mesmo molde de oportunidades: vendedor vê/edita as próprias; gestor (diretoria/superuser) só lê.
alter table public.proposta_contadores enable row level security;  -- sem policy: só service role
alter table public.propostas           enable row level security;
alter table public.proposta_revisoes   enable row level security;
alter table public.proposta_historico  enable row level security;

drop policy if exists propostas_vendedor_all on public.propostas;  -- nome de uma versão anterior (FOR ALL incluía DELETE)
drop policy if exists propostas_vendedor_select on public.propostas;
create policy propostas_vendedor_select on public.propostas for select to authenticated
  using (vendedor_id = (select public.meu_analista_id()));
drop policy if exists propostas_vendedor_insert on public.propostas;
create policy propostas_vendedor_insert on public.propostas for insert to authenticated
  with check (vendedor_id = (select public.meu_analista_id()));
drop policy if exists propostas_vendedor_update on public.propostas;
create policy propostas_vendedor_update on public.propostas for update to authenticated
  using (vendedor_id = (select public.meu_analista_id()))
  with check (vendedor_id = (select public.meu_analista_id()));
drop policy if exists propostas_gestor_select on public.propostas;
create policy propostas_gestor_select on public.propostas for select to authenticated
  using ((select public.is_gestor_comercial()));

drop policy if exists proposta_revisoes_vendedor_select on public.proposta_revisoes;
create policy proposta_revisoes_vendedor_select on public.proposta_revisoes for select to authenticated
  using (exists (select 1 from public.propostas p where p.id = proposta_id and p.vendedor_id = (select public.meu_analista_id())));
drop policy if exists proposta_revisoes_vendedor_insert on public.proposta_revisoes;
create policy proposta_revisoes_vendedor_insert on public.proposta_revisoes for insert to authenticated
  with check (exists (select 1 from public.propostas p where p.id = proposta_id and p.vendedor_id = (select public.meu_analista_id())));
drop policy if exists proposta_revisoes_gestor_select on public.proposta_revisoes;
create policy proposta_revisoes_gestor_select on public.proposta_revisoes for select to authenticated
  using ((select public.is_gestor_comercial()));

drop policy if exists proposta_historico_vendedor_select on public.proposta_historico;
create policy proposta_historico_vendedor_select on public.proposta_historico for select to authenticated
  using (exists (select 1 from public.propostas p where p.id = proposta_id and p.vendedor_id = (select public.meu_analista_id())));
drop policy if exists proposta_historico_vendedor_insert on public.proposta_historico;
create policy proposta_historico_vendedor_insert on public.proposta_historico for insert to authenticated
  with check (exists (select 1 from public.propostas p where p.id = proposta_id and p.vendedor_id = (select public.meu_analista_id())));
drop policy if exists proposta_historico_gestor_select on public.proposta_historico;
create policy proposta_historico_gestor_select on public.proposta_historico for select to authenticated
  using ((select public.is_gestor_comercial()));

-- Cria a proposta em rascunho já com o número oficial. Contador e proposta na mesma transação.
-- Não é SECURITY DEFINER: roda com o privilégio de quem chama (service role, via rpc).
create or replace function public.criar_proposta(
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

  insert into proposta_contadores as c (modelo, ano, ultimo)
  values (p_modelo, v_ano, 1)
  on conflict (modelo, ano) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_seq;

  insert into propostas (
    numero, modelo, ano, sequencial, unidade_id, vendedor_id, empresa_visitada_id, oportunidade_id,
    cliente_nome, aos_cuidados, conteudo, template_versao, validade_dias
  ) values (
    p_modelo || '-' || lpad(v_seq::text, 4, '0') || '/' || lpad((v_ano % 100)::text, 2, '0'),
    p_modelo, v_ano, v_seq, p_unidade_id, p_vendedor_id, p_empresa_visitada_id, p_oportunidade_id,
    p_cliente_nome, p_aos_cuidados, coalesce(p_conteudo, '{}'::jsonb), p_template_versao, p_validade_dias
  ) returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.criar_proposta(text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.criar_proposta(text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int) to service_role;

commit;
