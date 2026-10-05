-- Avisos restantes unificados em Configurações > Avisos (grupo Vagas): transferência de responsável, currículo
-- atualizado, funcionário não criado, lembretes (agendamento, comercial), supervisão atrasada, Faturamento Hortolândia
-- atrasado, taxa de R&S não configurada e aniversários de contatos de clientes.
-- ADITIVA e idempotente: só inserts em aviso_eventos e aviso_eventos_canais. NENHUMA coluna, tabela, função, trigger,
-- policy ou constraint nova (o CHECK de grupo já aceita 'vagas'; o de canal já aceita email, sino e popup).
-- O evento agendamento_cliente (grupo portal_cliente) JÁ existe e não é recriado aqui.
--
-- Semântica (no código):
--   SINO  : sem linha de canal ou erro de leitura = LIGADO; só ativo = false desliga TUDO (inclusive a linha geral).
--           Quem recebe: os destinatários de sempre de cada aviso MAIS a lista do canal sino.
--   POPUP : sem linha de canal ou erro de leitura = NÃO mostra (os popups já existentes só ganham esse interruptor).
--   E-MAIL: canal ligado SEM destinatários cadastrados = modo "legado" = comportamento de hoje. Com lista, usa a lista.
-- Os tipos gravados em notificacoes_analista/email_logs NÃO mudam.

-- ── 1. Eventos novos (grupo vagas) ───────────────────────────────────────────
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('candidato_transferido', 'vagas',
   'Transferência do responsável de um candidato: avisa o responsável antigo, o novo e a lista.',
   array['sino']),
  ('candidato_curriculo_atualizado', 'vagas',
   'Currículo atualizado por um candidato já cadastrado: avisa o responsável do candidato e a lista.',
   array['sino']),
  ('funcionario_nao_criado', 'vagas',
   'Falha ao criar automaticamente o funcionário ao gerar o pacote de admissão: avisa a equipe e a lista.',
   array['sino']),
  ('lembrete_agendamento_pendente_analista', 'vagas',
   'Lembrete ao analista enquanto o cliente não marca a entrevista: avisa o responsável do candidato e a lista.',
   array['sino', 'email'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: todos os canais de cada evento ligados ──────────
-- Não sobrescreve escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('candidato_transferido', 'sino', true),
  ('candidato_curriculo_atualizado', 'sino', true),
  ('funcionario_nao_criado', 'sino', true),
  ('lembrete_agendamento_pendente_analista', 'sino', true),
  ('lembrete_agendamento_pendente_analista', 'email', true)
on conflict (evento, canal) do nothing;

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: 4 eventos, grupo vagas, com os canais_suportados acima
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento in ('candidato_transferido', 'candidato_curriculo_atualizado', 'funcionario_nao_criado', 'lembrete_agendamento_pendente_analista') order by evento;
-- Esperado: 5 linhas, todas ativo = true
--   select evento, canal, ativo from public.aviso_eventos_canais where evento in ('candidato_transferido', 'candidato_curriculo_atualizado', 'funcionario_nao_criado', 'lembrete_agendamento_pendente_analista') order by evento, canal;
-- Esperado: 0 (sem destinatários = e-mail no modo legado; sino = os de sempre)
--   select count(*) from public.aviso_destinatarios where evento in ('candidato_transferido', 'candidato_curriculo_atualizado', 'funcionario_nao_criado', 'lembrete_agendamento_pendente_analista');
