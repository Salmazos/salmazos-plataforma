-- ============================================================================
-- Dados pessoais e filhos de funcionários SEM admissão digital (legados e cadastros manuais).
--
-- Contexto: a Gestão de Pessoas (RH e portal) lê sexo, nascimento, grau de instrução e filhos de
-- admissao_dados_pessoais / admissao_dependentes. Funcionário sem admissao_id (cadastro manual) não
-- tem essas linhas e aparece como "Não informado". Estas duas tabelas guardam o que o RH completar
-- pela tela do funcionário.
--
-- PRECEDÊNCIA (nunca misturar as duas fontes para o mesmo funcionário):
--   admissao_id NÃO nulo  -> valem admissao_dados_pessoais / admissao_dependentes (esta migração não muda isso)
--   admissao_id nulo      -> vale funcionario_perfil / funcionario_filhos; sem registro = "Não informado"
-- O trigger funcionario_so_legado() faz o banco recusar linha aqui para funcionário que tem admissão.
--
-- Filhos: "Sem filhos declarados" exige confirmação explícita (filhos_informado_em). Sem confirmação e
-- sem nenhum filho cadastrado, o legado continua "Não informado" (nunca é tratado como "sem filhos").
--
-- RLS: service_role total e analistas (mesmo padrão de funcionario_asos). SEM política de cliente de
-- propósito: o portal nunca lê estas linhas pela chave pública; só recebe agregados montados no servidor.
--
-- É ADITIVA: não altera nenhuma tabela existente, e o código funciona antes e depois dela (tabela
-- ausente = vazio). Idempotente (IF NOT EXISTS / DROP ... IF EXISTS antes de recriar trigger e política).
--
-- ROLLBACK (antes de haver dado digitado; depois, exporte as duas tabelas antes):
--   drop table if exists public.funcionario_filhos;
--   drop table if exists public.funcionario_perfil;
--   drop function if exists public.funcionario_so_legado();
-- ============================================================================

create table if not exists public.funcionario_perfil (
  funcionario_id        uuid primary key references public.funcionarios(id) on delete cascade,
  sexo                  text check (sexo in ('M', 'F')),
  data_nascimento       date check (data_nascimento between date '1900-01-01' and date '2100-12-31'),
  grau_instrucao        text check (grau_instrucao in (
                          'fundamental_incompleto', 'fundamental_completo',
                          'medio_incompleto', 'medio_completo',
                          'superior_incompleto', 'superior_completo', 'pos_graduacao')),
  filhos_informado_em   timestamptz,
  filhos_informado_por  uuid,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  atualizado_por        uuid
);

create table if not exists public.funcionario_filhos (
  id               uuid primary key default gen_random_uuid(),
  funcionario_id   uuid not null references public.funcionarios(id) on delete cascade,
  nome             text not null check (char_length(btrim(nome)) between 1 and 120),
  data_nascimento  date not null check (data_nascimento between date '1900-01-01' and date '2100-12-31'),
  criado_em        timestamptz not null default now(),
  criado_por       uuid,
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid
);

create index if not exists funcionario_filhos_funcionario_id_idx on public.funcionario_filhos (funcionario_id);

-- "não futuro" fica na aplicação (current_date não é imutável para CHECK).

drop trigger if exists funcionario_perfil_atualizado_em on public.funcionario_perfil;
create trigger funcionario_perfil_atualizado_em
  before update on public.funcionario_perfil
  for each row execute function public.set_atualizado_em();

drop trigger if exists funcionario_filhos_atualizado_em on public.funcionario_filhos;
create trigger funcionario_filhos_atualizado_em
  before update on public.funcionario_filhos
  for each row execute function public.set_atualizado_em();

-- Só legado: funcionário com admissão digital não pode ter linha nestas tabelas.
create or replace function public.funcionario_so_legado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.funcionarios f where f.id = new.funcionario_id and f.admissao_id is not null) then
    raise exception 'Funcionario com admissao digital: os dados pessoais vem da admissao (funcionario_id=%)', new.funcionario_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists funcionario_perfil_so_legado on public.funcionario_perfil;
create trigger funcionario_perfil_so_legado
  before insert or update of funcionario_id on public.funcionario_perfil
  for each row execute function public.funcionario_so_legado();

drop trigger if exists funcionario_filhos_so_legado on public.funcionario_filhos;
create trigger funcionario_filhos_so_legado
  before insert or update of funcionario_id on public.funcionario_filhos
  for each row execute function public.funcionario_so_legado();

alter table public.funcionario_perfil enable row level security;
alter table public.funcionario_filhos enable row level security;

drop policy if exists "Service role total funcionario_perfil" on public.funcionario_perfil;
create policy "Service role total funcionario_perfil" on public.funcionario_perfil
  for all to service_role using (true) with check (true);
drop policy if exists "analistas_all" on public.funcionario_perfil;
create policy "analistas_all" on public.funcionario_perfil
  for all to authenticated using ((select public.is_analista())) with check ((select public.is_analista()));

drop policy if exists "Service role total funcionario_filhos" on public.funcionario_filhos;
create policy "Service role total funcionario_filhos" on public.funcionario_filhos
  for all to service_role using (true) with check (true);
drop policy if exists "analistas_all" on public.funcionario_filhos;
create policy "analistas_all" on public.funcionario_filhos
  for all to authenticated using ((select public.is_analista())) with check ((select public.is_analista()));

-- Nenhuma política de cliente (cliente_le_proprios) aqui, de propósito.
