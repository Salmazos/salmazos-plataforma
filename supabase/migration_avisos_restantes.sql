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
   array['sino', 'email']),
  ('lembrete_comercial', 'vagas',
   'Lembrete diário do Comercial (empresas esperando retorno): avisa o vendedor e a lista; popup do vendedor.',
   array['sino', 'popup']),
  ('supervisao_cliente_atrasada', 'vagas',
   'Supervisão de cliente atrasada: avisa diretoria, supervisor responsável e a lista; e-mail ao supervisor.',
   array['sino', 'email', 'popup']),
  ('conta_receber_hortolandia_atrasada', 'vagas',
   'Faturamento Unidades atrasado (conta a receber vencida): avisa a diretoria e a lista.',
   array['sino', 'popup']),
  ('fee_rs_nao_configurado', 'vagas',
   'Vaga de R&S sem taxa (%) configurada (aprovação do cliente e geração de cobrança): avisa a equipe da unidade e a lista.',
   array['sino']),
  ('aniversario_mes_seguinte', 'vagas',
   'Lista mensal de aniversariantes do mês seguinte (contatos de clientes): e-mail à equipe da unidade ou à lista.',
   array['email']),
  ('aniversario_tres_dias', 'vagas',
   'Faltam 3 dias para o aniversário de um contato de cliente: sino geral da unidade, e-mail e lista.',
   array['sino', 'email']),
  ('aniversario_no_dia', 'vagas',
   'Aniversário de um contato de cliente: sino geral da unidade, e-mail, lista e popup do dia.',
   array['sino', 'email', 'popup'])
on conflict (evento) do nothing;

-- ── 2. Liga/desliga inicial: todos os canais de cada evento ligados ──────────
-- Não sobrescreve escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('candidato_transferido', 'sino', true),
  ('candidato_curriculo_atualizado', 'sino', true),
  ('funcionario_nao_criado', 'sino', true),
  ('lembrete_agendamento_pendente_analista', 'sino', true),
  ('lembrete_agendamento_pendente_analista', 'email', true),
  ('lembrete_comercial', 'sino', true),
  ('lembrete_comercial', 'popup', true),
  ('supervisao_cliente_atrasada', 'sino', true),
  ('supervisao_cliente_atrasada', 'email', true),
  ('supervisao_cliente_atrasada', 'popup', true),
  ('conta_receber_hortolandia_atrasada', 'sino', true),
  ('conta_receber_hortolandia_atrasada', 'popup', true),
  ('fee_rs_nao_configurado', 'sino', true),
  ('aniversario_mes_seguinte', 'email', true),
  ('aniversario_tres_dias', 'sino', true),
  ('aniversario_tres_dias', 'email', true),
  ('aniversario_no_dia', 'sino', true),
  ('aniversario_no_dia', 'email', true),
  ('aniversario_no_dia', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── Conferência (somente leitura) ────────────────────────────────────────────
-- Esperado: 11 eventos, grupo vagas, com os canais_suportados acima
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento in ('candidato_transferido', 'candidato_curriculo_atualizado', 'funcionario_nao_criado', 'lembrete_agendamento_pendente_analista', 'lembrete_comercial', 'supervisao_cliente_atrasada', 'conta_receber_hortolandia_atrasada', 'fee_rs_nao_configurado', 'aniversario_mes_seguinte', 'aniversario_tres_dias', 'aniversario_no_dia') order by evento;
-- Esperado: 19 linhas, todas ativo = true
--   select evento, canal, ativo from public.aviso_eventos_canais where evento in ('candidato_transferido', 'candidato_curriculo_atualizado', 'funcionario_nao_criado', 'lembrete_agendamento_pendente_analista', 'lembrete_comercial', 'supervisao_cliente_atrasada', 'conta_receber_hortolandia_atrasada', 'fee_rs_nao_configurado', 'aniversario_mes_seguinte', 'aniversario_tres_dias', 'aniversario_no_dia') order by evento, canal;
-- Esperado: 0 (sem destinatários = e-mail no modo legado; sino = os de sempre)
--   select count(*) from public.aviso_destinatarios where evento in ('candidato_transferido', 'candidato_curriculo_atualizado', 'funcionario_nao_criado', 'lembrete_agendamento_pendente_analista', 'lembrete_comercial', 'supervisao_cliente_atrasada', 'conta_receber_hortolandia_atrasada', 'fee_rs_nao_configurado', 'aniversario_mes_seguinte', 'aniversario_tres_dias', 'aniversario_no_dia');
