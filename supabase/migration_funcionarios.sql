-- Fase 1 do módulo de Departamento Pessoal: controle de funcionários (hoje mantido
-- numa planilha manual). Tabela nova, desacoplada de admissoes/candidatos: admissao_id
-- é nullable de propósito, porque o DP precisa popular o histórico retroativo de
-- funcionários que nunca passaram pelo fluxo de admissão digital da plataforma.
-- nome_completo/cargo/empresa/data_admissao são DUPLICADOS de admissoes/admissao_dados_pessoais
-- em vez de só um join, exatamente por causa disso: um registro manual não tem admissao_id
-- pra puxar via join, então esses campos precisam existir de forma independente aqui.
create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  admissao_id uuid references public.admissoes(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  nome_completo text not null,
  cargo text,
  empresa text,
  data_admissao date,
  status text not null default 'ativo' check (status = any (array['ativo', 'desligado'])),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Uma admissão só pode gerar um funcionário (evita duplicar se o webhook/rota de
-- gerar-pdf rodar mais de uma vez pra mesma admissão).
create unique index funcionarios_admissao_id_unique on public.funcionarios (admissao_id) where admissao_id is not null;
create index funcionarios_cliente_id_idx on public.funcionarios (cliente_id);
create index funcionarios_status_idx on public.funcionarios (status);

alter table public.funcionarios enable row level security;

create policy "Autenticados leem funcionarios" on public.funcionarios for select to authenticated using (true);
create policy "Autenticados inserem funcionarios" on public.funcionarios for insert to authenticated with check (true);
create policy "Autenticados atualizam funcionarios" on public.funcionarios for update to authenticated using (true) with check (true);
create policy "Service role total funcionarios" on public.funcionarios for all to service_role using (true) with check (true);

create function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger funcionarios_atualizado_em
before update on public.funcionarios
for each row execute function public.set_atualizado_em();

-- Libera o papel 'dp' (Departamento Pessoal) em app_metadata.role / analistas_perfil.nivel_acesso.
-- Ninguém usa esse papel ainda (a Andreza, que hoje faz esse trabalho, continua como
-- 'diretoria' e já tem acesso) — isso só abre caminho pra quando a empresa contratar
-- uma pessoa dedicada ao DP, sem precisar dar acesso de diretoria/supervisor completo.
alter table public.analistas_perfil drop constraint analistas_perfil_nivel_acesso_check;
alter table public.analistas_perfil add constraint analistas_perfil_nivel_acesso_check
  check (nivel_acesso = any (array['superuser', 'diretoria', 'supervisor', 'analista', 'dp']));
