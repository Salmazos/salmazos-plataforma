-- Mudança de arquitetura: destinatários de aviso de rescisão deixam de ser configuráveis
-- por rescisão e passam a ser uma configuração GLOBAL, valendo para todos os lançamentos
-- automaticamente. rescisao_destinatarios (Fase 3 original) fica descontinuada — confirmado
-- vazia em produção, nenhum dado real perdido.
--
-- Duas tabelas novas em vez de adaptar a antiga: os dois canais agora têm formato de linha
-- fundamentalmente diferente. E-mail aceita endereço livre (não precisa ser usuário
-- cadastrado no painel — ex: alguém sem login). Plataforma exige usuario_id real (a
-- notificação/popup dependem disso). Uma tabela só com coluna `canal` discriminando exigiria
-- colunas condicionalmente nulas dependendo do canal (email nulo quando canal=plataforma e
-- vice-versa) — duas tabelas simples e focadas são mais fáceis de validar e manter.
drop table public.rescisao_destinatarios;

-- Mesmo padrão de sla_destinatarios (nome + email livre, ativo pra desabilitar sem apagar).
create table public.rescisao_avisos_email_destinatarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.rescisao_avisos_plataforma_destinatarios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.rescisao_avisos_email_destinatarios enable row level security;
create policy "Autenticados gerenciam rescisao_avisos_email" on public.rescisao_avisos_email_destinatarios for all to authenticated using (true) with check (true);
create policy "Service role total rescisao_avisos_email" on public.rescisao_avisos_email_destinatarios for all to service_role using (true) with check (true);

alter table public.rescisao_avisos_plataforma_destinatarios enable row level security;
create policy "Autenticados gerenciam rescisao_avisos_plataforma" on public.rescisao_avisos_plataforma_destinatarios for all to authenticated using (true) with check (true);
create policy "Service role total rescisao_avisos_plataforma" on public.rescisao_avisos_plataforma_destinatarios for all to service_role using (true) with check (true);
