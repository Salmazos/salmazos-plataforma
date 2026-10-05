-- Avisos configuráveis de PÓS-VENDA R&S para a equipe comercial (sino + popup + e-mail).
-- Depende de migration_avisos_unificados.sql, migration_avisos_fase1b.sql e migration_avisos_decisao_cliente_popup.sql
-- (já aplicadas): reaproveita a função avisos_restaurar_padrao (com permite_vazio). NÃO cria coluna, tabela, função,
-- trigger nem policy: pos_venda_notificado_em (candidatos_vagas) e pos_venda_rs_popup_visualizacoes (o "visto" por dia do
-- popup de pós-venda) já existem. ADITIVA e idempotente.
--
-- Semântica (no código):
--   SINO  : sem linha de canal ou erro de leitura = LIGADO; só ativo = false desliga TUDO. Quem recebe: os destinatários de
--           sempre (responsável comercial do cliente ou, sem ele, o time comercial da unidade) MAIS a lista do canal sino.
--   POPUP : sem linha de canal ou erro de leitura = NÃO mostra (PopupPosVendaRSHoje). Sem lista própria: segue as linhas
--           nominais do sino.
--   E-MAIL: canal ligado SEM destinatários cadastrados = modo "legado" = comportamento de hoje (os mesmos destinatários de
--           sempre, mesmo assunto e template). Com lista, usa a lista.
-- Os tipos gravados em notificacoes_analista/email_logs (pos_venda_rs) NÃO mudam.

-- ── 1. O evento (grupo vagas) ────────────────────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('pos_venda_rs_7dias', 'vagas',
   'Pós-venda R&S: 7 dias depois do início do candidato contratado, nas 3 primeiras vagas de R&S do cliente. Avisa a equipe comercial. O cliente não recebe nada.',
   array['email', 'sino', 'popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: e-mail, sino e popup ligados ────────────────────
-- E-mail ligado sem lista = legado (igual a hoje). Não sobrescreve escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('pos_venda_rs_7dias', 'email', true),
  ('pos_venda_rs_7dias', 'sino',  true),
  ('pos_venda_rs_7dias', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: 1 evento, grupo vagas, canais_suportados {email,sino,popup}
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento = 'pos_venda_rs_7dias';
-- Esperado: 3 linhas (email, popup, sino), todas ativo = true
--   select evento, canal, ativo from public.aviso_eventos_canais where evento = 'pos_venda_rs_7dias' order by canal;
-- Esperado: 0 (sem destinatários = e-mail no modo legado; sino = os de sempre)
--   select count(*) from public.aviso_destinatarios where evento = 'pos_venda_rs_7dias';
