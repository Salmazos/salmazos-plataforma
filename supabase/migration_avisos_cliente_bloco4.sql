-- Avisos ao cliente (sino e popup no portal) — BLOCO 4 (último): "Solicitação de vaga decidida" e
-- "Pedido do cliente decidido".
-- Depende de migration_avisos_cliente_bloco1.sql a bloco3.sql (já aplicadas: grupo 'avisos_cliente' no CHECK,
-- tabelas portal_avisos e portal_avisos_estado, eventos dos blocos 1 a 3).
-- ADITIVA e idempotente: só insere os 2 eventos e os 4 canais; sem tabela nova, sem alterar constraint, sem
-- mexer em nenhuma linha existente. Sem custo.

-- ── 1. Eventos novos (grupo avisos_cliente; sem lista de pessoas) ────────────
-- solicitacao_vaga_decidida_cliente: a Salmazos aprovou ou recusou uma solicitação de vaga do cliente.
--   Dispara em POST /api/vagas/from-solicitacao (aprovada) e PATCH /api/solicitacoes-vagas/[id]/recusar (recusada).
-- pedido_vaga_decidido_cliente: a Salmazos aprovou ou recusou um pedido do cliente (alteração de solicitação,
--   encerramento ou reativação de vaga). Dispara em POST /api/solicitacoes-vagas/[id]/alteracao e
--   POST /api/vagas/[id]/solicitacao-status.
-- Recebem todos os usuários do portal do cliente, então NÃO há linhas em aviso_destinatarios para estes eventos.
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('solicitacao_vaga_decidida_cliente', 'avisos_cliente', 'Solicitação de vaga decidida',  array['sino', 'popup']),
  ('pedido_vaga_decidido_cliente',      'avisos_cliente', 'Pedido do cliente decidido',    array['sino', 'popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: sino e popup ligados nos dois eventos ───────────
-- O código só avisa quando existe a linha do canal com ativo = true (sem linha = nada é enviado).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('solicitacao_vaga_decidida_cliente', 'sino',  true),
  ('solicitacao_vaga_decidida_cliente', 'popup', true),
  ('pedido_vaga_decidido_cliente',      'sino',  true),
  ('pedido_vaga_decidido_cliente',      'popup', true)
on conflict (evento, canal) do nothing;

-- ── 3. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
-- O grupo Avisos ao cliente passa a ter 6 eventos (os 4 anteriores mais os 2 novos, todos com {sino,popup}):
--   select evento, grupo, descricao, canais_suportados from public.aviso_eventos
--   where grupo = 'avisos_cliente' order by evento;
--
-- Canais ligados dos 2 eventos novos (esperado: 4 linhas, todas com ativo = true):
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('solicitacao_vaga_decidida_cliente', 'pedido_vaga_decidido_cliente')
--   order by evento, canal;
--
-- Sem lista de pessoas para os eventos novos (esperado: 0):
--   select count(*) from public.aviso_destinatarios
--   where evento in ('solicitacao_vaga_decidida_cliente', 'pedido_vaga_decidido_cliente');
--
-- Nada mudou nos eventos dos blocos 1 a 3 (esperado: 8 linhas, as mesmas de antes):
--   select evento, canal, ativo, atualizado_em from public.aviso_eventos_canais
--   where evento in ('indicacao_decidida_cliente', 'candidato_enviado_cliente',
--                    'entrevista_agendada_cliente', 'entrevista_remarcada_cliente')
--   order by evento, canal;
--
-- Depois de usar (avisos gravados pelos eventos novos, com a chave de deduplicação que traz o instante da decisão):
--   select a.created_at, c.nome as cliente, a.evento, a.titulo, a.mensagem, a.link, a.canal_sino, a.canal_popup, a.chave_dedup
--   from public.portal_avisos a join public.clientes c on c.id = a.cliente_id
--   where a.evento in ('solicitacao_vaga_decidida_cliente', 'pedido_vaga_decidido_cliente')
--   order by a.created_at desc limit 20;
