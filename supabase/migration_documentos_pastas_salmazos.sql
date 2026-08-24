-- Árvore de pastas com aninhamento múltiplo (recursivo), só pra aba "Salmazos" de
-- Documentos. Estruturalmente diferente de documentos_categorias_customizadas (aba
-- Clientes, flat, escopada por cliente_id) — por isso tabela própria, sem reaproveitar
-- aquela.
create table public.documentos_pastas_salmazos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  parent_id uuid references public.documentos_pastas_salmazos(id) on delete cascade,
  criado_por_user_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index documentos_pastas_salmazos_parent_id_idx on public.documentos_pastas_salmazos (parent_id);

alter table public.documentos_pastas_salmazos enable row level security;

create policy "Autenticados leem pastas salmazos" on public.documentos_pastas_salmazos for select to authenticated using (true);
create policy "Autenticados inserem pastas salmazos" on public.documentos_pastas_salmazos for insert to authenticated with check (true);
create policy "Service role total pastas salmazos" on public.documentos_pastas_salmazos for all to service_role using (true) with check (true);

-- Seed: as 4 categorias fixas de sempre (SALMAZOS_CATEGORIAS, hardcoded no client até
-- aqui) viram pastas de raiz de verdade. IDs literais e determinísticos (não gerados) só
-- pra poder referenciar no backfill de documentos.pasta_id logo abaixo, na mesma migração.
insert into public.documentos_pastas_salmazos (id, nome, parent_id) values
  ('00000000-0000-4000-8000-000000000001', 'Manuais e Procedimentos', null),
  ('00000000-0000-4000-8000-000000000002', 'Políticas da Empresa', null),
  ('00000000-0000-4000-8000-000000000003', 'Formulários', null),
  ('00000000-0000-4000-8000-000000000004', 'Treinamentos', null);

-- categoria deixa de ser universal: só se aplica a documentos tipo='cliente' daqui pra
-- frente (tipo='salmazos' passa a usar pasta_id). Continua obrigatória pra tipo='cliente'
-- via checagem no servidor (POST /api/documentos), não mais via NOT NULL do banco.
alter table public.documentos alter column categoria drop not null;
alter table public.documentos add column pasta_id uuid references public.documentos_pastas_salmazos(id) on delete set null;
create index documentos_pasta_id_idx on public.documentos (pasta_id);

update public.documentos set pasta_id = '00000000-0000-4000-8000-000000000001' where tipo = 'salmazos' and categoria = 'manuais';
update public.documentos set pasta_id = '00000000-0000-4000-8000-000000000002' where tipo = 'salmazos' and categoria = 'politicas';
update public.documentos set pasta_id = '00000000-0000-4000-8000-000000000003' where tipo = 'salmazos' and categoria = 'formularios';
update public.documentos set pasta_id = '00000000-0000-4000-8000-000000000004' where tipo = 'salmazos' and categoria = 'treinamentos';
