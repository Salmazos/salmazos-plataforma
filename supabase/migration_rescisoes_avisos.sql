-- Fase 3: avisos de rescisão em 3 canais (e-mail, sino, popup de login), disparados em
-- até 3 momentos por rescisão (lançamento, vencimento da rescisão, vencimento da guia).

-- Idempotência dos disparos via cron (vencimento) — o de lançamento é síncrono e único
-- por natureza (só acontece na criação), não precisa de coluna própria.
alter table public.rescisoes
  add column ultimo_aviso_vencimento_rescisao_enviado_em timestamptz,
  add column ultimo_aviso_vencimento_guia_enviado_em timestamptz;

-- Deep-link do sino pra rescisão — mesmo padrão de solicitacao_vaga_id já usado pra
-- notificação de solicitação de vaga.
alter table public.notificacoes_analista
  add column rescisao_id uuid references public.rescisoes(id) on delete set null;

-- Duas listas independentes de destinatários por rescisão, escolhidas no lançamento.
-- Tabela única com coluna `canal` em vez de duas tabelas ou colunas array — mais simples
-- de manter, e já é o padrão usado pra listas de destinatário de notificação neste projeto
-- (ver sla_destinatarios).
create table public.rescisao_destinatarios (
  id uuid primary key default gen_random_uuid(),
  rescisao_id uuid not null references public.rescisoes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  canal text not null check (canal = any (array['email', 'plataforma'])),
  criado_em timestamptz not null default now(),
  unique (rescisao_id, usuario_id, canal)
);

create index rescisao_destinatarios_rescisao_id_idx on public.rescisao_destinatarios (rescisao_id);

alter table public.rescisao_destinatarios enable row level security;
create policy "Autenticados leem rescisao_destinatarios" on public.rescisao_destinatarios for select to authenticated using (true);
create policy "Autenticados inserem rescisao_destinatarios" on public.rescisao_destinatarios for insert to authenticated with check (true);
create policy "Service role total rescisao_destinatarios" on public.rescisao_destinatarios for all to service_role using (true) with check (true);

-- Popup de login: reaproveita EXATAMENTE o mecanismo já usado em aniversario_popup_visualizacoes
-- (mesma forma: usuario_id + data_referencia únicos, mesma RLS restrita ao próprio dono) — só o
-- conteúdo (avisos de rescisão via notificacoes_analista, não aniversariantes) é diferente.
create table public.rescisao_popup_visualizacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  data_referencia date not null,
  visualizado_em timestamptz not null default now(),
  unique (usuario_id, data_referencia)
);

alter table public.rescisao_popup_visualizacoes enable row level security;
create policy "Usuario le seu proprio registro rescisao popup" on public.rescisao_popup_visualizacoes for select to authenticated using (usuario_id = auth.uid());
create policy "Usuario insere seu proprio registro rescisao popup" on public.rescisao_popup_visualizacoes for insert to authenticated with check (usuario_id = auth.uid());
create policy "Service role acesso total rescisao popup visualizacoes" on public.rescisao_popup_visualizacoes for all to service_role using (true) with check (true);
