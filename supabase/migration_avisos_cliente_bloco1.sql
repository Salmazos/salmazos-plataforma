-- Avisos ao cliente (sino e popup no portal) — BLOCO 1: infraestrutura + primeiro evento
-- (decisão da indicação direta).
-- Depende de migration_avisos_unificados.sql, migration_avisos_fase1b.sql, migration_avisos_fase1c.sql e
-- migration_avisos_fase3_bloco1.sql (já aplicadas). ADITIVA e idempotente: nenhuma tabela, coluna ou linha
-- existente é apagada ou alterada. A única mudança em objeto existente é ALARGAR o CHECK de grupo de
-- aviso_eventos (acrescenta 'avisos_cliente'; os 4 grupos atuais continuam válidos).
-- Sem custo: duas tabelas pequenas (estimativa < 120 avisos por mês no total) e nenhuma rotina agendada.

-- ── 1. Grupo novo "Avisos ao cliente": alarga o CHECK de grupo ───────────────
-- Soltar e recriar é idempotente. Nenhuma linha existente viola o novo CHECK (ele só aceita mais um valor).
alter table public.aviso_eventos drop constraint if exists aviso_eventos_grupo_check;
alter table public.aviso_eventos
  add constraint aviso_eventos_grupo_check
  check (grupo in ('vagas', 'rescisao', 'aso', 'portal_cliente', 'avisos_cliente'));

-- ── 2. Primeiro evento: indicação direta decidida pela Salmazos ──────────────
-- Canais sino e popup. Sem lista de pessoas: quem recebe é todo usuário do portal do cliente
-- (cliente_usuarios), então NÃO há linhas em aviso_destinatarios para este evento.
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('indicacao_decidida_cliente', 'avisos_cliente', 'Indicação direta decidida pela Salmazos', array['sino', 'popup'])
on conflict (evento) do nothing;

-- ── 3. Liga/desliga inicial: sino e popup ligados ────────────────────────────
-- O código só envia quando existe a linha do canal com ativo = true (sem linha = nada é enviado).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('indicacao_decidida_cliente', 'sino',  true),
  ('indicacao_decidida_cliente', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 4. Avisos do portal: um por cliente e por ocorrência ─────────────────────
-- O texto já vem pronto do servidor (só dado que o cliente já enxerga). chave_dedup tem sufixo de versão:
-- repetir a MESMA ocorrência não duplica o aviso; um reenvio legítimo usa outra versão.
-- canal_sino / canal_popup guardam como cada canal estava ligado quando o aviso foi criado.
create table if not exists public.portal_avisos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  evento text not null references public.aviso_eventos(evento),
  titulo text not null,
  mensagem text not null,
  link text not null check (link like '/portal/%'),
  referencia_tipo text,
  referencia_id uuid,
  chave_dedup text not null unique,
  canal_sino boolean not null default true,
  canal_popup boolean not null default false,
  created_at timestamptz not null default now(),
  check (canal_sino or canal_popup)
);

-- A consulta do portal é sempre "os avisos deste cliente, dos mais novos para os mais antigos".
create index if not exists idx_portal_avisos_cliente_criado on public.portal_avisos (cliente_id, created_at desc);

-- ── 5. Estado por usuário do portal: lido e popup visto ──────────────────────
-- As linhas nascem quando o usuário marca (não há uma linha por usuário a cada aviso). Cada usuário marca
-- por conta própria. Apaga em cascata com o aviso e com o usuário.
create table if not exists public.portal_avisos_estado (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.portal_avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lida_em timestamptz,
  popup_visto_em timestamptz,
  unique (aviso_id, user_id)
);

-- O unique já cobre a busca por aviso; este índice cobre a busca/exclusão em cascata por usuário.
create index if not exists idx_portal_avisos_estado_user on public.portal_avisos_estado (user_id);

-- ── 6. RLS: só service_role (a leitura passa pelas rotas api/portal/*, com cliente_id vindo do servidor) ──
alter table public.portal_avisos enable row level security;
alter table public.portal_avisos_estado enable row level security;
revoke all on public.portal_avisos from anon, authenticated;
revoke all on public.portal_avisos_estado from anon, authenticated;

drop policy if exists "Service role total portal_avisos" on public.portal_avisos;
create policy "Service role total portal_avisos"
  on public.portal_avisos for all to service_role using (true) with check (true);

drop policy if exists "Service role total portal_avisos_estado" on public.portal_avisos_estado;
create policy "Service role total portal_avisos_estado"
  on public.portal_avisos_estado for all to service_role using (true) with check (true);

-- ── 7. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
-- Evento e canais (esperado: 1 evento no grupo avisos_cliente com {sino,popup}; sino e popup ligados):
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento = 'indicacao_decidida_cliente';
--   select evento, canal, ativo from public.aviso_eventos_canais where evento = 'indicacao_decidida_cliente' order by canal;
--
-- O CHECK de grupo aceita o valor novo e os antigos:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'aviso_eventos_grupo_check';
--
-- Sem lista de pessoas para o evento (esperado: 0 linhas):
--   select count(*) from public.aviso_destinatarios where evento = 'indicacao_decidida_cliente';
--
-- Tabelas criadas, com RLS ligada (esperado: relrowsecurity = true nas duas):
--   select relname, relrowsecurity from pg_class where relname in ('portal_avisos', 'portal_avisos_estado');
--
-- Sem acesso para anon/authenticated (esperado: só service_role aparece):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('portal_avisos', 'portal_avisos_estado') order by 1, 2, 3;
--
-- Índices (esperado: idx_portal_avisos_cliente_criado, idx_portal_avisos_estado_user e os únicos):
--   select tablename, indexname from pg_indexes where tablename in ('portal_avisos', 'portal_avisos_estado') order by 1, 2;
--
-- Clientes com pelo menos um usuário no portal (quem poderá ver os avisos; hoje 6 clientes / 10 usuários):
--   select count(distinct cliente_id) clientes, count(*) usuarios from public.cliente_usuarios;
