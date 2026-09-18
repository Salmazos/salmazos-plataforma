-- Dedup por dia do popup "Vencimento de Contrato" (mão de obra temporária, 90/180/270
-- dias) — mesmo padrão de funcionario_aso_popup_visualizacoes: um "visto" por usuário por
-- dia (não por funcionário), reaberto no dia seguinte se ainda houver algo pendente. Usado
-- tanto pelo popup do painel interno quanto pelo popup do Portal do Cliente (mesma tabela,
-- usuario_id nunca colide entre os dois porque são pessoas distintas).
create table public.funcionario_vencimento_mot_popup_visualizacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  data_referencia date not null,
  visualizado_em timestamptz not null default now(),
  unique (usuario_id, data_referencia)
);

alter table public.funcionario_vencimento_mot_popup_visualizacoes enable row level security;

create policy "Usuario le seu proprio registro vencimento_mot_popup"
  on public.funcionario_vencimento_mot_popup_visualizacoes
  for select
  using (usuario_id = auth.uid());

create policy "Usuario insere seu proprio registro vencimento_mot_popup"
  on public.funcionario_vencimento_mot_popup_visualizacoes
  for insert
  with check (usuario_id = auth.uid());

create policy "Service role acesso total vencimento_mot_popup_visualizacoes"
  on public.funcionario_vencimento_mot_popup_visualizacoes
  for all
  using (true)
  with check (true);
