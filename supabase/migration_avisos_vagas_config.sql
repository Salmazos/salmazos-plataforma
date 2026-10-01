create table public.aviso_vaga_config (
  evento text primary key check (evento in ('vaga_criada','solicitacao_vaga','vaga_fechada','vaga_cancelada','vaga_reativada')),
  email_ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create table public.aviso_vaga_email_destinatarios (
  id uuid primary key default gen_random_uuid(),
  evento text not null check (evento in ('vaga_criada','solicitacao_vaga','vaga_fechada','vaga_cancelada','vaga_reativada')),
  nome text not null,
  email text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index aviso_vaga_email_unico on public.aviso_vaga_email_destinatarios (evento, lower(email));
create table public.aviso_vaga_plataforma_destinatarios (
  id uuid primary key default gen_random_uuid(),
  evento text not null check (evento in ('vaga_criada','solicitacao_vaga','vaga_fechada','vaga_cancelada','vaga_reativada')),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (evento, usuario_id)
);
alter table public.aviso_vaga_config enable row level security;
alter table public.aviso_vaga_email_destinatarios enable row level security;
alter table public.aviso_vaga_plataforma_destinatarios enable row level security;
-- Sem policies de propósito: só o service_role (que ignora RLS) acessa. Usuários autenticados, inclusive do portal do cliente, não leem nem gravam.
insert into public.aviso_vaga_config (evento) values ('vaga_criada'),('solicitacao_vaga'),('vaga_fechada'),('vaga_cancelada'),('vaga_reativada');
