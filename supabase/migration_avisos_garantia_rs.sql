-- Avisos configuráveis de GARANTIA R&S para a equipe interna (sino + popup + e-mail).
-- Depende de migration_avisos_unificados.sql, migration_avisos_fase1b.sql e migration_avisos_decisao_cliente_popup.sql
-- (já aplicadas): reaproveita a tabela notificacao_popup_vistos e a função avisos_restaurar_padrao (com permite_vazio).
-- ADITIVA e idempotente. Sem tabela nova.
--
-- Semântica (no código):
--   SINO  : sem linha de canal ou erro de leitura = LIGADO; só ativo = false desliga TUDO (responsável, lista e linha geral).
--           Quem recebe: o responsável do candidato (sempre) MAIS a lista do canal sino; sem os dois, a linha geral da unidade.
--   POPUP : sem linha de canal ou erro de leitura = NÃO mostra. Sem lista própria: segue as linhas nominais do sino.
--   E-MAIL: canal ligado SEM destinatários cadastrados = modo "legado" = comportamento de hoje (vencendo: todos os
--           analistas da unidade exceto diretoria e superuser; acionada: todos os analistas da unidade). Com lista, usa a lista.
-- Os tipos gravados em notificacoes_analista/email_logs (alerta_garantia_rs e garantia_acionada) NÃO mudam.

-- ── 1. Os 2 eventos (grupo vagas) ────────────────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('garantia_rs_vencendo', 'vagas',
   'Garantia R&S no último dia (vencimento): avisa a equipe interna. O cliente não recebe nada.',
   array['email', 'sino', 'popup']),
  ('garantia_rs_acionada', 'vagas',
   'Garantia R&S acionada (reposição gratuita iniciada, nova vaga aberta): avisa a equipe interna. O cliente não recebe nada.',
   array['email', 'sino', 'popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: e-mail, sino e popup ligados nos 2 eventos ──────
-- E-mail ligado sem lista = legado (igual a hoje). Não sobrescreve escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('garantia_rs_vencendo', 'email', true),
  ('garantia_rs_vencendo', 'sino',  true),
  ('garantia_rs_vencendo', 'popup', true),
  ('garantia_rs_acionada', 'email', true),
  ('garantia_rs_acionada', 'sino',  true),
  ('garantia_rs_acionada', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 3. Carimbo do alerta "vencendo" (evita repetir o aviso na janela de recuperação do cron) ──
alter table public.candidatos_vagas add column if not exists garantia_alerta_enviado_em timestamptz;

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: 2 eventos, grupo vagas, canais_suportados {email,sino,popup}
--   select evento, grupo, canais_suportados from public.aviso_eventos
--    where evento in ('garantia_rs_vencendo','garantia_rs_acionada') order by evento;
-- Esperado: 6 linhas, todas ativo = true
--   select evento, canal, ativo from public.aviso_eventos_canais
--    where evento in ('garantia_rs_vencendo','garantia_rs_acionada') order by evento, canal;
-- Esperado: 1 linha (timestamp with time zone)
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'candidatos_vagas' and column_name = 'garantia_alerta_enviado_em';
-- Esperado: 0 (sem destinatários = e-mail no modo legado; sino = responsável + linha geral)
--   select count(*) from public.aviso_destinatarios
--    where evento in ('garantia_rs_vencendo','garantia_rs_acionada');
