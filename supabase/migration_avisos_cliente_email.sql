-- E-mails ao cliente com interruptor "E-mail" em Configurações > Avisos (aba "Avisos ao cliente").
-- Depende de migration_avisos_unificados.sql e migration_avisos_cliente_bloco1.sql (grupo 'avisos_cliente' no
-- CHECK de aviso_eventos) — já aplicadas. O CHECK de canal de aviso_eventos_canais já aceita 'email'.
-- ADITIVA e idempotente: só insere 7 eventos e 7 linhas de canal; sem tabela nova, sem alterar constraint,
-- sem mexer em linha existente, sem mudança de RLS (as tabelas já são só service_role). Sem custo.
--
-- Semântica do canal e-mail DESTES eventos (INVERSA à de sino/popup): o e-mail já era enviado antes do
-- interruptor, então SEM linha de canal ou erro de leitura = LIGADO. Só ativo = false desliga. Por isso a
-- linha só existe para registrar a escolha: ativo = true nos 5 que seguem como hoje e ativo = false nos 2 que
-- o sino e o popup do bloco 4 já cobrem. O ON CONFLICT DO NOTHING nunca sobrescreve uma escolha futura.
--
-- Quem recebe (no código, não no banco): o e-mail de login de cada usuário do portal do cliente, um e-mail por
-- pessoa; cliente sem usuário no portal ou erro de leitura = clientes.contato_email. NÃO há linhas em
-- aviso_destinatarios para estes eventos.

-- ── 1. Eventos (grupo avisos_cliente; canal único: e-mail; sem lista de pessoas) ──
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('email_cliente_candidato_entrevista',     'avisos_cliente', 'E-mail ao cliente: candidato em entrevista com o cliente (etapa do Kanban)',            array['email']),
  ('email_cliente_lembrete_entrevista_hoje', 'avisos_cliente', 'E-mail ao cliente: lembrete diário das entrevistas de hoje (cron)',                     array['email']),
  ('email_cliente_vaga_aprovada',            'avisos_cliente', 'E-mail ao cliente: solicitação de vaga aprovada (vaga criada)',                         array['email']),
  ('email_cliente_vaga_status_decidido',     'avisos_cliente', 'E-mail ao cliente: pedido de encerramento ou reativação de vaga decidido',              array['email']),
  ('email_cliente_solicitacao_recusada',     'avisos_cliente', 'E-mail ao cliente: solicitação de vaga recusada (com o motivo)',                        array['email']),
  ('email_cliente_alteracao_decidida',       'avisos_cliente', 'E-mail ao cliente: pedido de alteração de solicitação decidido (aprovado ou recusado)', array['email']),
  ('email_cliente_lembrete_agendamento',     'avisos_cliente', 'E-mail ao cliente: lembrete para confirmar a data da entrevista (cron)',                array['email'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial do canal e-mail ──────────────────────────────────
-- 5 ligados (comportamento de hoje) e 2 desligados (vaga aprovada; pedido de encerramento/reativação decidido).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('email_cliente_candidato_entrevista',     'email', true),
  ('email_cliente_lembrete_entrevista_hoje', 'email', true),
  ('email_cliente_vaga_aprovada',            'email', false),
  ('email_cliente_vaga_status_decidido',     'email', false),
  ('email_cliente_solicitacao_recusada',     'email', true),
  ('email_cliente_alteracao_decidida',       'email', true),
  ('email_cliente_lembrete_agendamento',     'email', true)
on conflict (evento, canal) do nothing;

-- ── 3. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
-- O grupo Avisos ao cliente passa a ter 13 eventos (6 de sino/popup + 7 de e-mail com {email}):
--   select evento, grupo, descricao, canais_suportados from public.aviso_eventos
--   where grupo = 'avisos_cliente' order by evento;
--
-- Os 7 interruptores (esperado: 7 linhas, ativo = false só em email_cliente_vaga_aprovada e
-- email_cliente_vaga_status_decidido):
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento like 'email_cliente_%' order by evento;
--
-- Sem lista de pessoas para os eventos novos (esperado: 0):
--   select count(*) from public.aviso_destinatarios where evento like 'email_cliente_%';
--
-- Nada mudou nos 6 eventos de sino/popup (esperado: 12 linhas, as mesmas de antes):
--   select evento, canal, ativo, atualizado_em from public.aviso_eventos_canais
--   where evento like '%\_cliente' escape '\' and evento not like 'email\_cliente\_%' escape '\' order by evento, canal;
--
-- Quem receberia hoje em cada cliente (usuários do portal; cliente sem linha aqui cai no contato_email):
--   select c.nome, count(*) as usuarios_portal, string_agg(u.email, ', ' order by u.email) as logins
--   from public.cliente_usuarios cu
--   join public.clientes c on c.id = cu.cliente_id
--   join auth.users u on u.id = cu.user_id
--   group by c.nome order by c.nome;
