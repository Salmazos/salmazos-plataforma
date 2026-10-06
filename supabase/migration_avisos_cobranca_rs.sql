-- Avisos internos da Cobrança R&S unificados em Configurações > Avisos (grupo Vagas): cobrança gerada (aprovação e
-- reenvio manual), validada pela diretoria, paga, cancelada e atrasada.
-- ADITIVA e idempotente: só inserts em aviso_eventos e aviso_eventos_canais. NENHUMA coluna, tabela, função, trigger,
-- policy ou constraint nova (o CHECK de grupo já aceita 'vagas'; o de canal já aceita email e sino) e NENHUMA alteração
-- em cobrancas_rs.
--
-- Semântica (no código):
--   E-MAIL: canal ligado SEM destinatários cadastrados = modo "legado" = o comportamento de hoje de cada aviso.
--           Com lista no canal, usa só a lista. Desligado = ninguém. Sem linha de canal ou erro de leitura = legado.
--   SINO  (só o atraso): sem linha de canal ou erro de leitura = LIGADO; só ativo = false desliga tudo. Quem recebe:
--           os de sempre (diretoria/superuser e o revisor com acesso) MAIS a lista do canal sino, uma linha por usuário.
-- Os tipos gravados em notificacoes_analista/email_logs NÃO mudam. Sem popup novo: os 3 popups de cobrança não mudam.

-- ── 1. Eventos novos (grupo vagas) ───────────────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('cobranca_rs_gerada', 'vagas',
   'Cobrança R&S aprovada e enviada (e reenvio manual do aviso): e-mail interno para a diretoria e o revisor.',
   array['email']),
  ('cobranca_rs_validada', 'vagas',
   'Cobrança R&S validada pela diretoria (vencimento definido pela primeira vez): e-mail ao revisor da cobrança.',
   array['email']),
  ('cobranca_rs_paga', 'vagas',
   'Cobrança R&S marcada como paga: e-mail ao revisor da cobrança (sem diretoria e superuser).',
   array['email']),
  ('cobranca_rs_cancelada', 'vagas',
   'Cobrança R&S cancelada com justificativa: e-mail interno para a diretoria e o revisor.',
   array['email']),
  ('cobranca_rs_atrasada', 'vagas',
   'Cobrança R&S validada e vencida sem pagamento (cron diário, repete a cada 2 dias até pagar): sino e e-mail.',
   array['sino', 'email'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: todos os canais de cada evento ligados ──────────
-- Não sobrescreve escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('cobranca_rs_gerada', 'email', true),
  ('cobranca_rs_validada', 'email', true),
  ('cobranca_rs_paga', 'email', true),
  ('cobranca_rs_cancelada', 'email', true),
  ('cobranca_rs_atrasada', 'sino', true),
  ('cobranca_rs_atrasada', 'email', true)
on conflict (evento, canal) do nothing;

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: 5 eventos, grupo vagas, com os canais_suportados acima
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento in ('cobranca_rs_gerada', 'cobranca_rs_validada', 'cobranca_rs_paga', 'cobranca_rs_cancelada', 'cobranca_rs_atrasada') order by evento;
-- Esperado: 6 linhas, todas ativo = true
--   select evento, canal, ativo from public.aviso_eventos_canais where evento in ('cobranca_rs_gerada', 'cobranca_rs_validada', 'cobranca_rs_paga', 'cobranca_rs_cancelada', 'cobranca_rs_atrasada') order by evento, canal;
-- Esperado: 0 (sem destinatários = e-mail no modo legado; sino = os de sempre)
--   select count(*) from public.aviso_destinatarios where evento in ('cobranca_rs_gerada', 'cobranca_rs_validada', 'cobranca_rs_paga', 'cobranca_rs_cancelada', 'cobranca_rs_atrasada');
