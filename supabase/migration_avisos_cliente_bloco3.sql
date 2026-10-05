-- Avisos ao cliente (sino e popup no portal) — BLOCO 3: "Entrevista agendada" e "Entrevista remarcada".
-- Depende de migration_avisos_cliente_bloco1.sql e migration_avisos_cliente_bloco2.sql (já aplicadas: grupo
-- 'avisos_cliente' no CHECK, tabelas portal_avisos e portal_avisos_estado, eventos dos blocos 1 e 2).
-- ADITIVA e idempotente: só insere os 2 eventos e os 4 canais; sem tabela nova, sem alterar constraint, sem
-- mexer em nenhuma linha existente. Sem custo.

-- ── 1. Eventos novos (grupo avisos_cliente; sem lista de pessoas) ────────────
-- entrevista_agendada_cliente : a Salmazos definiu a data de uma entrevista que ainda estava sem data.
-- entrevista_remarcada_cliente: a Salmazos mudou a data ou o horário de uma entrevista que já tinha data.
-- Disparam em POST /api/encaminhamentos (reenvio de um encaminhamento ainda aberto) e em
-- PATCH /api/encaminhamentos/[id]. Recebem todos os usuários do portal do cliente, então NÃO há linhas em
-- aviso_destinatarios para estes eventos.
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('entrevista_agendada_cliente',  'avisos_cliente', 'Entrevista agendada',  array['sino', 'popup']),
  ('entrevista_remarcada_cliente', 'avisos_cliente', 'Entrevista remarcada', array['sino', 'popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: sino e popup ligados nos dois eventos ───────────
-- O código só avisa quando existe a linha do canal com ativo = true (sem linha = nada é enviado).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('entrevista_agendada_cliente',  'sino',  true),
  ('entrevista_agendada_cliente',  'popup', true),
  ('entrevista_remarcada_cliente', 'sino',  true),
  ('entrevista_remarcada_cliente', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 3. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
-- O grupo Avisos ao cliente passa a ter 4 eventos (esperado: indicacao_decidida_cliente,
-- candidato_enviado_cliente, entrevista_agendada_cliente e entrevista_remarcada_cliente, todos com {sino,popup}):
--   select evento, grupo, descricao, canais_suportados from public.aviso_eventos
--   where grupo = 'avisos_cliente' order by evento;
--
-- Canais ligados (esperado: 8 linhas, todas com ativo = true):
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('indicacao_decidida_cliente', 'candidato_enviado_cliente',
--                    'entrevista_agendada_cliente', 'entrevista_remarcada_cliente')
--   order by evento, canal;
--
-- Sem lista de pessoas para os eventos novos (esperado: 0):
--   select count(*) from public.aviso_destinatarios
--   where evento in ('entrevista_agendada_cliente', 'entrevista_remarcada_cliente');
--
-- Nada mudou nos blocos 1 e 2 (esperado: as linhas dos dois eventos antigos continuam iguais às de antes):
--   select evento, canal, ativo, atualizado_em from public.aviso_eventos_canais
--   where evento in ('indicacao_decidida_cliente', 'candidato_enviado_cliente') order by evento, canal;
--
-- Depois de usar (avisos gravados pelos eventos novos, com a chave de deduplicação):
--   select a.created_at, c.nome as cliente, a.evento, a.mensagem, a.link, a.canal_sino, a.canal_popup, a.chave_dedup
--   from public.portal_avisos a join public.clientes c on c.id = a.cliente_id
--   where a.evento in ('entrevista_agendada_cliente', 'entrevista_remarcada_cliente')
--   order by a.created_at desc limit 20;
