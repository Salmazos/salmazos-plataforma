-- Avisos unificados — Fase 1 (vagas, rescisão, ASO periódico).
-- SOMENTE ADIÇÃO: nenhuma tabela antiga é alterada ou apagada. O código novo lê estas tabelas e,
-- se não houver nada para o evento/canal (ou se estas tabelas ainda não existirem), cai na lógica
-- antiga, então o comportamento atual não muda. Rodar uma única vez; é idempotente nas cópias.

-- ── 1. Catálogo de eventos ───────────────────────────────────────────────────
create table if not exists public.aviso_eventos (
  evento text primary key,
  grupo text not null check (grupo in ('vagas','rescisao','aso')),
  descricao text not null,
  canais_suportados text[] not null default array['email','sino']
);

insert into public.aviso_eventos (evento, grupo, descricao) values
  ('vaga_criada',                  'vagas',    'Nova vaga criada'),
  ('vaga_reativada',               'vagas',    'Vaga reativada'),
  ('vaga_fechada',                 'vagas',    'Vaga fechada'),
  ('vaga_cancelada',               'vagas',    'Vaga cancelada'),
  ('solicitacao_vaga',             'vagas',    'Solicitação de vaga pelo cliente'),
  ('rescisao_lancamento',          'rescisao', 'Rescisão lançada'),
  ('rescisao_vencimento_rescisao', 'rescisao', 'Pagamento de rescisão vence hoje'),
  ('rescisao_vencimento_guia',     'rescisao', 'Pagamento de guia vence hoje'),
  ('aso_periodico_sem_registro',   'aso',      'ASO periódico sem registro'),
  ('aso_periodico_vencendo',       'aso',      'ASO periódico vencendo'),
  ('aso_periodico_atrasado',       'aso',      'ASO periódico em atraso')
on conflict (evento) do nothing;

-- ── 2. Liga/desliga por evento e canal ───────────────────────────────────────
create table if not exists public.aviso_eventos_canais (
  evento text not null references public.aviso_eventos(evento) on delete cascade,
  canal text not null check (canal in ('email','sino','popup')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (evento, canal)
);

-- ── 3. Destinatários por evento e canal ──────────────────────────────────────
create table if not exists public.aviso_destinatarios (
  id uuid primary key default gen_random_uuid(),
  evento text not null references public.aviso_eventos(evento) on delete cascade,
  canal text not null check (canal in ('email','sino','popup')),
  tipo_destinatario text not null check (tipo_destinatario in ('usuario','email')),
  usuario_id uuid references auth.users(id) on delete cascade,
  email text,
  nome text,
  copia boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint aviso_destinatarios_consistencia check (
    (tipo_destinatario = 'usuario' and usuario_id is not null and email is null)
    or (tipo_destinatario = 'email' and email is not null and usuario_id is null)
  )
);

create unique index if not exists aviso_destinatarios_unico
  on public.aviso_destinatarios (evento, canal, coalesce(usuario_id::text, lower(email)));

-- ── 4. Segurança: só service_role (que ignora RLS) acessa ────────────────────
alter table public.aviso_eventos enable row level security;
alter table public.aviso_eventos_canais enable row level security;
alter table public.aviso_destinatarios enable row level security;

revoke all on public.aviso_eventos from anon, authenticated;
revoke all on public.aviso_eventos_canais from anon, authenticated;
revoke all on public.aviso_destinatarios from anon, authenticated;

drop policy if exists "Service role total aviso_eventos" on public.aviso_eventos;
create policy "Service role total aviso_eventos" on public.aviso_eventos for all to service_role using (true) with check (true);
drop policy if exists "Service role total aviso_eventos_canais" on public.aviso_eventos_canais;
create policy "Service role total aviso_eventos_canais" on public.aviso_eventos_canais for all to service_role using (true) with check (true);
drop policy if exists "Service role total aviso_destinatarios" on public.aviso_destinatarios;
create policy "Service role total aviso_destinatarios" on public.aviso_destinatarios for all to service_role using (true) with check (true);

-- ── 5. Cópia do liga/desliga atual ───────────────────────────────────────────
-- Vagas, e-mail: aviso_vaga_config.email_ativo (evento sem linha = ligado, como no código).
insert into public.aviso_eventos_canais (evento, canal, ativo)
select e.evento, 'email', coalesce(c.email_ativo, true)
from public.aviso_eventos e
left join public.aviso_vaga_config c on c.evento = e.evento
where e.grupo = 'vagas'
on conflict (evento, canal) do nothing;

-- Rescisão, e-mail: configuracoes_gerais.rescisao_avisos_email_ativo (ausente = desligado, como no código).
insert into public.aviso_eventos_canais (evento, canal, ativo)
select e.evento, 'email',
  coalesce((select g.valor from public.configuracoes_gerais g where g.chave = 'rescisao_avisos_email_ativo') = 'true', false)
from public.aviso_eventos e
where e.grupo = 'rescisao'
on conflict (evento, canal) do nothing;

-- ASO, e-mail: hoje não há interruptor (sempre envia para os ativos) = ligado.
insert into public.aviso_eventos_canais (evento, canal, ativo)
select e.evento, 'email', true
from public.aviso_eventos e
where e.grupo = 'aso'
on conflict (evento, canal) do nothing;

-- Sino: nenhum grupo tem interruptor hoje = ligado.
insert into public.aviso_eventos_canais (evento, canal, ativo)
select e.evento, 'sino', true
from public.aviso_eventos e
on conflict (evento, canal) do nothing;

-- ── 6. Cópia das listas atuais (preserva ativo, nome, e-mail e usuario_id) ───
-- Vagas, e-mail: por evento.
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, email, nome, ativo, criado_em)
select evento, 'email', 'email', lower(email), nome, ativo, criado_em
from public.aviso_vaga_email_destinatarios
on conflict do nothing;

-- Vagas, sino: por evento (tabela antiga não tem "ativo": todas as linhas valem).
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo, criado_em)
select evento, 'sino', 'usuario', usuario_id, true, criado_em
from public.aviso_vaga_plataforma_destinatarios
on conflict do nothing;

-- Rescisão: a mesma lista global replicada nos 3 eventos.
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, email, nome, ativo, criado_em)
select e.evento, 'email', 'email', lower(d.email), d.nome, d.ativo, d.criado_em
from public.aviso_eventos e
cross join public.rescisao_avisos_email_destinatarios d
where e.grupo = 'rescisao'
on conflict do nothing;

insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo, criado_em)
select e.evento, 'sino', 'usuario', d.usuario_id, true, d.criado_em
from public.aviso_eventos e
cross join public.rescisao_avisos_plataforma_destinatarios d
where e.grupo = 'rescisao'
on conflict do nothing;

-- ASO: a mesma lista global replicada nos 3 eventos.
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, email, nome, ativo, criado_em)
select e.evento, 'email', 'email', lower(d.email), d.nome, d.ativo, d.criado_em
from public.aviso_eventos e
cross join public.funcionario_aso_avisos_email_destinatarios d
where e.grupo = 'aso'
on conflict do nothing;

insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo, criado_em)
select e.evento, 'sino', 'usuario', d.usuario_id, true, d.criado_em
from public.aviso_eventos e
cross join public.funcionario_aso_avisos_plataforma_destinatarios d
where e.grupo = 'aso'
on conflict do nothing;

-- ── 7. Conferência (rodar depois; só leitura) ────────────────────────────────
-- ANTES (tabelas antigas): contagem total / ativos por evento.
--   select evento, 'email' canal, count(*) total, count(*) filter (where ativo) ativos from public.aviso_vaga_email_destinatarios group by evento
--   union all select evento, 'sino', count(*), count(*) from public.aviso_vaga_plataforma_destinatarios group by evento
--   union all select 'rescisao_*', 'email', count(*), count(*) filter (where ativo) from public.rescisao_avisos_email_destinatarios
--   union all select 'rescisao_*', 'sino', count(*), count(*) from public.rescisao_avisos_plataforma_destinatarios
--   union all select 'aso_*', 'email', count(*), count(*) filter (where ativo) from public.funcionario_aso_avisos_email_destinatarios
--   union all select 'aso_*', 'sino', count(*), count(*) from public.funcionario_aso_avisos_plataforma_destinatarios
--   order by 1, 2;
--
-- DEPOIS (tabelas novas): deve bater (rescisão e ASO aparecem iguais nos 3 eventos do grupo).
--   select evento, canal, count(*) total, count(*) filter (where ativo) ativos
--   from public.aviso_destinatarios group by evento, canal order by evento, canal;
--
-- Liga/desliga copiado (vagas: igual a aviso_vaga_config; rescisão: igual à chave; aso: true):
--   select evento, canal, ativo from public.aviso_eventos_canais order by evento, canal;
