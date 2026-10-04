-- Avisos unificados — Fase 1c: "Cliente enviou indicação direta de candidato" (e-mail, sino e popup).
-- Depende de migration_avisos_unificados.sql e migration_avisos_fase1b.sql (já aplicadas; os CHECKs de
-- canal já aceitam 'popup' e o de grupo já aceita 'portal_cliente'). SOMENTE ADIÇÃO e idempotente:
-- nenhuma tabela antiga é alterada ou apagada.

-- ── 1. Novo evento (3 canais) ────────────────────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('indicacao_candidato_recebida', 'portal_cliente', 'Cliente enviou indicação direta de candidato', array['email','sino','popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: tudo ligado ─────────────────────────────────────
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('indicacao_candidato_recebida', 'email', true),
  ('indicacao_candidato_recebida', 'sino',  true),
  ('indicacao_candidato_recebida', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 3. Carga: os analistas ativos com e-mail (os mesmos que notifyAllAnalysts usa hoje) ──
-- O filtro de unidade NÃO entra na carga: continua sendo regra fixa aplicada em tempo de envio
-- (só recebe quem atende a unidade do cliente), como nos avisos de Vagas.
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo)
select 'indicacao_candidato_recebida', c.canal, 'usuario', p.user_id, true
from public.analistas_perfil p
cross join (values ('email'), ('sino'), ('popup')) as c(canal)
where p.ativo = true
  and p.email is not null
  and p.user_id is not null
  and exists (select 1 from auth.users u where u.id = p.user_id)
on conflict do nothing;

-- ── 4. "Já dispensado" do popup, por usuário e indicação ─────────────────────
create table if not exists public.indicacao_candidato_popup_vistos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  solicitacao_indicacao_id uuid not null references public.solicitacoes_indicacao_candidato(id) on delete cascade,
  visto_em timestamptz not null default now(),
  unique (usuario_id, solicitacao_indicacao_id)
);

alter table public.indicacao_candidato_popup_vistos enable row level security;
revoke all on public.indicacao_candidato_popup_vistos from anon, authenticated;
drop policy if exists "Service role total indicacao_candidato_popup_vistos" on public.indicacao_candidato_popup_vistos;
create policy "Service role total indicacao_candidato_popup_vistos"
  on public.indicacao_candidato_popup_vistos for all to service_role using (true) with check (true);

-- ── 5. Conferência (rodar ANTES e DEPOIS; só leitura) ────────────────────────
-- ANTES: quem a carga vai incluir (deve ser igual à lista que recebe o e-mail hoje: 10 pessoas).
--   select p.nome_completo, p.nivel_acesso, p.unidade_id, p.acesso_todas_unidades
--   from public.analistas_perfil p
--   where p.ativo = true and p.email is not null and p.user_id is not null
--     and exists (select 1 from auth.users u where u.id = p.user_id)
--   order by p.nome_completo;
--
-- DEPOIS: quem entrou em cada canal (esperado: 10 linhas em email, 10 em sino, 10 em popup).
--   select d.canal, p.nome_completo, d.ativo
--   from public.aviso_destinatarios d
--   left join public.analistas_perfil p on p.user_id = d.usuario_id
--   where d.evento = 'indicacao_candidato_recebida'
--   order by d.canal, p.nome_completo;
--
--   select canal, count(*) from public.aviso_destinatarios
--   where evento = 'indicacao_candidato_recebida' group by canal order by canal;
--
--   select canal, ativo from public.aviso_eventos_canais where evento = 'indicacao_candidato_recebida';
