-- Link público de solicitação de vaga: tabela dos links e colunas de origem/perfil/aceite em solicitacoes_vagas.
-- Já aplicado em produção; arquivo só registra o schema (nada aqui precisa ser rodado de novo, e rodar é inofensivo: tudo é idempotente).

-- Links públicos de solicitação: token, validade (expira_em), revogação, contador de usos e as condições comerciais que valem para quem usar o link (o snapshot aceito vai para solicitacoes_vagas.condicoes_aceitas).
create table if not exists solicitacao_vaga_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  unidade_id uuid not null,
  nome_empresa text,
  criado_por_user_id uuid,
  criado_por_nome text,
  expira_em timestamptz not null,
  revogado_em timestamptz,
  usos integer not null default 0,
  created_at timestamptz not null default now(),
  condicoes jsonb,
  clausulas_adicionais jsonb not null default '[]'::jsonb
);

-- O link é lido e gravado só pelas rotas (service role); sem política para os demais papéis, o RLS os bloqueia.
alter table solicitacao_vaga_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'solicitacao_vaga_links' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on solicitacao_vaga_links for all to service_role using (true) with check (true);
  end if;
end $$;

-- Solicitações do portal (cliente já cadastrado) e do link (cliente novo, sem cadastro) convivem na mesma tabela; 'portal' como padrão mantém as linhas antigas válidas.
alter table solicitacoes_vagas add column if not exists origem text not null default 'portal';
alter table solicitacoes_vagas add column if not exists link_id uuid;
alter table solicitacoes_vagas add column if not exists dados_empresa jsonb;
alter table solicitacoes_vagas add column if not exists perfil_extra jsonb;
alter table solicitacoes_vagas add column if not exists aceite_taxa_cancelamento_em timestamptz;
alter table solicitacoes_vagas add column if not exists aceite_ip text;
alter table solicitacoes_vagas add column if not exists condicoes_aceitas jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_vagas_origem_check' and conrelid = 'public.solicitacoes_vagas'::regclass) then
    alter table solicitacoes_vagas add constraint solicitacoes_vagas_origem_check check (origem in ('portal', 'link_publico'));
  end if;
  -- SET NULL: apagar um link não pode apagar as solicitações que ele já gerou.
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_vagas_link_id_fkey' and conrelid = 'public.solicitacoes_vagas'::regclass) then
    alter table solicitacoes_vagas add constraint solicitacoes_vagas_link_id_fkey foreign key (link_id) references solicitacao_vaga_links(id) on delete set null;
  end if;
end $$;
