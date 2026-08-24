-- Categorias customizadas de Documentos, específicas por cliente (ex: "Indicadores") —
-- complementam as 5 categorias fixas (CLIENTE_CATEGORIAS, hardcoded no client), que
-- continuam existindo pra todo cliente sem precisar de registro aqui. chave é gerada por
-- slugify(label) no servidor (ver src/lib/utils.ts) — o UNIQUE(cliente_id, chave) evita
-- duplicar pasta com o mesmo nome pro mesmo cliente (cliente diferente pode ter uma pasta
-- de chave igual sem problema).
create table public.documentos_categorias_customizadas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  chave text not null,
  label text not null,
  criado_por_user_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (cliente_id, chave)
);

create index documentos_categorias_customizadas_cliente_id_idx on public.documentos_categorias_customizadas (cliente_id);

alter table public.documentos_categorias_customizadas enable row level security;

create policy "Autenticados leem categorias customizadas" on public.documentos_categorias_customizadas for select to authenticated using (true);
create policy "Autenticados inserem categorias customizadas" on public.documentos_categorias_customizadas for insert to authenticated with check (true);
create policy "Service role total categorias customizadas" on public.documentos_categorias_customizadas for all to service_role using (true) with check (true);
