-- Fase 2 do módulo de Departamento Pessoal: Rescisões. Cada rescisão pertence a um único
-- funcionário (FK obrigatória, cascade — igual ao padrão já usado em admissao_dados_pessoais/
-- admissao_documentos/admissao_dependentes -> admissoes: uma rescisão não tem significado
-- próprio fora do funcionário a que pertence).
-- Modalidade confirmada contra a planilha de referência (Planilha de Rescisões - 2026.xlsx,
-- abas Janeiro-Julho): variações de grafia (espaço, gênero: "Efetivado"/"Efetivada",
-- "Desligado"/"Desligada pela empresa") mas só 3 categorias reais.
create table public.rescisoes (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  empresa text not null,
  data_desligamento date not null,
  modalidade text not null check (modalidade = any (array['pedido_demissao', 'desligamento_pela_empresa', 'efetivado'])),
  entrevista_desligamento boolean not null default false,
  funcionario_assinou boolean not null default false,
  valor_rescisao numeric not null,
  data_pagamento_rescisao date not null,
  valor_guia numeric,
  data_pagamento_guia date,
  pensao numeric,
  farmacia numeric,
  -- Nunca preenchido na planilha de referência (nenhuma linha real tinha esse campo
  -- marcado) — default false reflete o estado real de uso, não uma suposição.
  faturado boolean not null default false,
  -- Upload sempre opcional — nunca bloqueia o lançamento da rescisão nem o faturamento.
  aso_documento_path text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index rescisoes_funcionario_id_idx on public.rescisoes (funcionario_id);
create index rescisoes_empresa_idx on public.rescisoes (empresa);
create index rescisoes_faturado_idx on public.rescisoes (faturado);
create index rescisoes_data_desligamento_idx on public.rescisoes (data_desligamento);

alter table public.rescisoes enable row level security;

create policy "Autenticados leem rescisoes" on public.rescisoes for select to authenticated using (true);
create policy "Autenticados inserem rescisoes" on public.rescisoes for insert to authenticated with check (true);
create policy "Autenticados atualizam rescisoes" on public.rescisoes for update to authenticated using (true) with check (true);
create policy "Service role total rescisoes" on public.rescisoes for all to service_role using (true) with check (true);

-- Reaproveita a função genérica já criada na Fase 1 (funcionarios) — atualiza
-- NEW.atualizado_em em qualquer tabela que tenha essa coluna, não precisa de uma nova.
create trigger rescisoes_atualizado_em
before update on public.rescisoes
for each row execute function public.set_atualizado_em();
