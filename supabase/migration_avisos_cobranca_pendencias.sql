-- Avisos de Cobrança R&S: (A) rascunho recém-criado, aguardando revisão; (B) cobrança parada em "Aguardando validação".
--   cobranca_rs_pendente_revisao      — só SINO. Quando o rascunho nasce (status pendente_revisao): avisa diretoria, superuser e quem
--                                       tem acesso configurado à Cobrança R&S (cobranca_rs_analistas_acesso), menos o gerador, que já
--                                       cai no modal de revisão. Mais a lista do canal.
--   cobranca_rs_aguardando_validacao  — SINO e E-MAIL. Lembrete do cron lembrete-cobranca-atraso (sem cron novo) para cobrança em
--                                       aprovada_enviada, sem vencimento, enviada há 2 dias ou mais; repete a cada 2 dias até validar.
-- ADITIVA e idempotente: inserts em aviso_eventos e aviso_eventos_canais (on conflict do nothing) e UMA coluna nova, nullable, sem
-- default e sem índice, para o carimbo do lembrete. Nenhuma outra mudança de schema; nenhum destinatário criado (0 destinatários =
-- legado: sino para os de sempre, e-mail para os de sempre). Nenhum dado de cobrancas_rs é alterado.
--
-- Deploy ANTES desta migration é seguro: sem as linhas de canal o sino fica ligado (sem linha = ligado, e o aviso cai no legado) e,
-- sem a coluna, o bloco novo do cron é pulado com log (erro 42703) e o lembrete de atraso segue normal.

-- ── 1. Coluna do carimbo do lembrete de "Aguardando validação" ───────────────
alter table public.cobrancas_rs add column if not exists ultimo_lembrete_validacao_em timestamptz;

-- ── 2. Eventos novos (grupo vagas) ───────────────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('cobranca_rs_pendente_revisao', 'vagas',
   'Cobrança R&S recém-criada (rascunho pendente de revisão): sino para quem tem acesso à Cobrança R&S, menos quem gerou.',
   array['sino']),
  ('cobranca_rs_aguardando_validacao', 'vagas',
   'Cobrança R&S parada em Aguardando validação (sem vencimento definido há 2 dias ou mais, repete a cada 2 dias): sino e e-mail.',
   array['sino', 'email'])
on conflict (evento) do nothing;

-- ── 3. Liga/desliga inicial dos canais ───────────────────────────────────────
-- Não sobrescreve escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('cobranca_rs_pendente_revisao', 'sino', true),
  ('cobranca_rs_aguardando_validacao', 'sino', true),
  ('cobranca_rs_aguardando_validacao', 'email', true)
on conflict (evento, canal) do nothing;

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: 1 linha (timestamptz, nullable, sem default)
--   select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'cobrancas_rs' and column_name = 'ultimo_lembrete_validacao_em';
-- Esperado: 2 eventos, grupo vagas, com os canais_suportados acima
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento in ('cobranca_rs_pendente_revisao', 'cobranca_rs_aguardando_validacao') order by evento;
-- Esperado: 3 linhas, todas ativo = true
--   select evento, canal, ativo from public.aviso_eventos_canais where evento in ('cobranca_rs_pendente_revisao', 'cobranca_rs_aguardando_validacao') order by evento, canal;
-- Esperado: 0 (sem destinatários = legado)
--   select count(*) from public.aviso_destinatarios where evento in ('cobranca_rs_pendente_revisao', 'cobranca_rs_aguardando_validacao');
