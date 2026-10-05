-- Avisos ao cliente (sino e popup no portal) — BLOCO 2: "Candidato enviado ao cliente".
-- Depende de migration_avisos_cliente_bloco1.sql (já aplicada: grupo 'avisos_cliente' no CHECK, tabelas
-- portal_avisos e portal_avisos_estado). ADITIVA e idempotente: só insere o evento e os 2 canais; sem tabela
-- nova, sem alterar constraint, sem mexer em nenhuma linha existente. Sem custo.

-- ── 1. Evento novo (grupo avisos_cliente; sem lista de pessoas) ──────────────
-- Dispara em POST /api/encaminhamentos (ação "Encaminhar" do Kanban), no primeiro envio e quando um candidato
-- já avaliado é enviado de novo. Recebem todos os usuários do portal do cliente, então NÃO há linhas em
-- aviso_destinatarios para este evento.
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('candidato_enviado_cliente', 'avisos_cliente', 'Candidato enviado ao cliente', array['sino', 'popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: sino e popup ligados ────────────────────────────
-- O código só avisa quando existe a linha do canal com ativo = true (sem linha = nada é enviado).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('candidato_enviado_cliente', 'sino',  true),
  ('candidato_enviado_cliente', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 3. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
-- Os 2 eventos do grupo Avisos ao cliente (esperado: indicacao_decidida_cliente e candidato_enviado_cliente,
-- cada um com {sino,popup}):
--   select evento, grupo, descricao, canais_suportados from public.aviso_eventos
--   where grupo = 'avisos_cliente' order by evento;
--
-- Canais ligados (esperado: 4 linhas, todas com ativo = true):
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('indicacao_decidida_cliente', 'candidato_enviado_cliente') order by evento, canal;
--
-- Sem lista de pessoas para o evento novo (esperado: 0 linhas):
--   select count(*) from public.aviso_destinatarios where evento = 'candidato_enviado_cliente';
--
-- Nada mudou no bloco 1 (esperado: as linhas de indicacao_decidida_cliente continuam iguais às de antes):
--   select evento, canal, ativo, atualizado_em from public.aviso_eventos_canais
--   where evento = 'indicacao_decidida_cliente' order by canal;
--
-- Depois de usar (avisos gravados para o evento novo; um por envio, com a chave de deduplicação):
--   select a.created_at, c.nome as cliente, a.titulo, a.mensagem, a.link, a.canal_sino, a.canal_popup, a.chave_dedup
--   from public.portal_avisos a join public.clientes c on c.id = a.cliente_id
--   where a.evento = 'candidato_enviado_cliente' order by a.created_at desc limit 20;
