-- Avisos unificados — Fase 3, bloco 1: pedidos do cliente no portal + popup de solicitação de vaga.
-- Depende de migration_avisos_unificados.sql, migration_avisos_fase1b.sql e migration_avisos_fase1c.sql
-- (já aplicadas; os CHECKs de canal e de grupo já aceitam 'popup' e 'portal_cliente', então nenhum
-- CHECK precisa ser alterado). SOMENTE ADIÇÃO e idempotente: nenhuma tabela antiga é alterada ou
-- apagada. A única linha existente que muda é aviso_eventos.canais_suportados de 'solicitacao_vaga',
-- que ganha 'popup' (e só se ainda não tiver).
--
-- As cargas só são criadas quando o par (evento, canal) ainda NÃO tem nenhuma linha em
-- aviso_destinatarios. Assim, rodar de novo depois que alguém editou as listas na tela NÃO recoloca
-- quem foi removido. Sem custo: só linhas em tabelas existentes e uma tabela nova pequena.

-- ── 1. Novos eventos (grupo portal_cliente) ──────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('solicitacao_alteracao_pedida', 'portal_cliente', 'Cliente pediu alteração numa solicitação de vaga',                              array['email','sino','popup']),
  ('vaga_reativacao_pedida',       'portal_cliente', 'Cliente pediu reativação de vaga',                                              array['email','sino','popup']),
  ('vaga_pausa_pedida',            'portal_cliente', 'Cliente pediu pausa ou encerramento de vaga',                                   array['email','sino','popup']),
  ('agendamento_cliente',          'portal_cliente', 'Cliente agendou entrevista (quando o candidato não tem responsável)',            array['email','sino'])
on conflict (evento) do nothing;

-- ── 2. solicitacao_vaga passa a suportar o canal popup (só se ainda não suporta) ──
update public.aviso_eventos
   set canais_suportados = canais_suportados || array['popup']
 where evento = 'solicitacao_vaga'
   and not ('popup' = any (canais_suportados));

-- ── 3. Liga/desliga inicial: tudo ligado ─────────────────────────────────────
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('solicitacao_vaga',             'popup', true),
  ('solicitacao_alteracao_pedida', 'email', true),
  ('solicitacao_alteracao_pedida', 'sino',  true),
  ('solicitacao_alteracao_pedida', 'popup', true),
  ('vaga_reativacao_pedida',       'email', true),
  ('vaga_reativacao_pedida',       'sino',  true),
  ('vaga_reativacao_pedida',       'popup', true),
  ('vaga_pausa_pedida',            'email', true),
  ('vaga_pausa_pedida',            'sino',  true),
  ('vaga_pausa_pedida',            'popup', true),
  ('agendamento_cliente',          'email', true),
  ('agendamento_cliente',          'sino',  true)
on conflict (evento, canal) do nothing;

-- ── 4. Carga de e-mail e sino: CÓPIA das listas já configuradas de solicitacao_vaga ──
-- (e-mail: Andreza, Giovanni e Rebecca; sino: os 7 usuários do sino de solicitação — sem listar nomes).
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, email, nome, ativo)
select n.evento, d.canal, d.tipo_destinatario, d.usuario_id, d.email, d.nome, d.ativo
from public.aviso_destinatarios d
cross join (values
  ('solicitacao_alteracao_pedida'),
  ('vaga_reativacao_pedida'),
  ('vaga_pausa_pedida'),
  ('agendamento_cliente')
) as n(evento)
where d.evento = 'solicitacao_vaga'
  and d.canal in ('email', 'sino')
  and not exists (
    select 1 from public.aviso_destinatarios x where x.evento = n.evento and x.canal = d.canal
  )
on conflict do nothing;

-- ── 5. Carga do popup: quem vê o popup de solicitação HOJE ───────────────────
-- Hoje o popup de solicitação aparece para todo analista ativo que atende a unidade (GET
-- /api/solicitacoes-vagas/pendentes-popup). "Atende a unidade" aqui = tem acesso a todas as unidades
-- (sócios) OU é da unidade de algum cliente. Hoje isso dá 8 pessoas (4 sócios, Giovanni, Rebecca,
-- Susana de Monte Mor e Edivan); Victor e a Susana de SBC ficam de fora porque SBC não tem cliente.
-- Os três pedidos do cliente recebem a mesma carga. O filtro de unidade continua sendo aplicado em
-- tempo de leitura (cada pessoa só vê os pedidos da própria unidade; sócios veem todos).
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo)
select n.evento, 'popup', 'usuario', p.user_id, true
from public.analistas_perfil p
cross join (values
  ('solicitacao_vaga'),
  ('solicitacao_alteracao_pedida'),
  ('vaga_reativacao_pedida'),
  ('vaga_pausa_pedida')
) as n(evento)
where p.ativo = true
  and p.user_id is not null
  and exists (select 1 from auth.users u where u.id = p.user_id)
  and (
    p.acesso_todas_unidades = true
    or exists (select 1 from public.clientes c where c.unidade_id = p.unidade_id)
  )
  and not exists (
    select 1 from public.aviso_destinatarios x where x.evento = n.evento and x.canal = 'popup'
  )
on conflict do nothing;

-- ── 6. "Já dispensado" do popup "Pedidos do cliente", por usuário, tipo e pedido ──
-- Sem FK para a fila: o pedido_id aponta para tabelas diferentes conforme o tipo
-- ('alteracao' → solicitacao_vaga_alteracoes.id; 'reativacao' e 'pausa' → vaga_solicitacoes_status.id),
-- e uma FK só caberia numa delas. Linhas de pedidos antigos ficam sem efeito (só são consultadas para
-- os pedidos pendentes); só usuario_id tem FK, com cascade.
create table if not exists public.pedido_cliente_popup_vistos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo_pedido text not null check (tipo_pedido in ('alteracao', 'reativacao', 'pausa')),
  pedido_id uuid not null,
  visto_em timestamptz not null default now(),
  unique (usuario_id, tipo_pedido, pedido_id)
);

alter table public.pedido_cliente_popup_vistos enable row level security;
revoke all on public.pedido_cliente_popup_vistos from anon, authenticated;
drop policy if exists "Service role total pedido_cliente_popup_vistos" on public.pedido_cliente_popup_vistos;
create policy "Service role total pedido_cliente_popup_vistos"
  on public.pedido_cliente_popup_vistos for all to service_role using (true) with check (true);

-- ── 7. Conferência (só leitura; rodar ANTES e DEPOIS) ────────────────────────
-- ANTES — quem a carga do popup vai incluir (esperado: 8 pessoas; sem Victor e sem a Susana de SBC):
--   select p.nome_completo, p.nivel_acesso, u.nome as unidade, p.acesso_todas_unidades
--   from public.analistas_perfil p
--   left join public.unidades u on u.id = p.unidade_id
--   where p.ativo = true and p.user_id is not null
--     and exists (select 1 from auth.users a where a.id = p.user_id)
--     and (p.acesso_todas_unidades = true
--          or exists (select 1 from public.clientes c where c.unidade_id = p.unidade_id))
--   order by p.nome_completo;
--
-- ANTES — as listas de solicitacao_vaga que serão copiadas (esperado: e-mail 3, sino 7):
--   select d.canal, coalesce(p.nome_completo, d.nome) as quem, d.ativo
--   from public.aviso_destinatarios d
--   left join public.analistas_perfil p on p.user_id = d.usuario_id
--   where d.evento = 'solicitacao_vaga' and d.canal in ('email', 'sino')
--   order by d.canal, quem;
--
-- DEPOIS — contagem por evento e canal (esperado: 3 pedidos = e-mail 3, sino 7, popup 8;
--          agendamento_cliente = e-mail 3, sino 7; solicitacao_vaga ganha popup 8):
--   select evento, canal, count(*) total, count(*) filter (where ativo) ativos
--   from public.aviso_destinatarios
--   where evento in ('solicitacao_vaga','solicitacao_alteracao_pedida','vaga_reativacao_pedida','vaga_pausa_pedida','agendamento_cliente')
--   group by 1, 2 order by 1, 2;
--
-- DEPOIS — quem entrou em cada canal:
--   select d.evento, d.canal, coalesce(p.nome_completo, d.nome) as quem, d.ativo
--   from public.aviso_destinatarios d
--   left join public.analistas_perfil p on p.user_id = d.usuario_id
--   where d.evento in ('solicitacao_vaga','solicitacao_alteracao_pedida','vaga_reativacao_pedida','vaga_pausa_pedida','agendamento_cliente')
--   order by d.evento, d.canal, quem;
--
-- DEPOIS — canais ligados e canais suportados:
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('solicitacao_vaga','solicitacao_alteracao_pedida','vaga_reativacao_pedida','vaga_pausa_pedida','agendamento_cliente')
--   order by 1, 2;
--   select evento, grupo, canais_suportados from public.aviso_eventos
--   where evento in ('solicitacao_vaga','solicitacao_alteracao_pedida','vaga_reativacao_pedida','vaga_pausa_pedida','agendamento_cliente');
--
-- DEPOIS — a tabela de "visto" existe, com RLS e sem acesso para anon/authenticated:
--   select relname, relrowsecurity from pg_class where relname = 'pedido_cliente_popup_vistos';
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'pedido_cliente_popup_vistos';   -- esperado: só service_role (sem anon/authenticated)
