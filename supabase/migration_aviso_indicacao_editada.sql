-- Aviso interno "cliente editou uma indicação direta de candidato" (portal > Minhas Indicações).
-- Depende de migration_avisos_unificados.sql e migration_avisos_fase1b.sql (grupo 'portal_cliente').
-- SOMENTE ADIÇÃO e IDEMPOTENTE: nenhuma tabela nem constraint é alterada; só duas inserções com
-- on conflict do nothing — pode rodar mais de uma vez.
--
-- Canais: e-mail e sino (sem popup, decisão de negócio). Sem linhas em aviso_destinatarios de propósito:
-- com o canal ligado e a lista vazia o resolvedor cai no padrão "analistas ativos da unidade do cliente"
-- (mesmo comportamento de indicacao_candidato_recebida sem configuração); a lista pode ser definida em
-- Configurações > Avisos.

insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('indicacao_candidato_editada_cliente', 'portal_cliente', 'Cliente editou uma indicação direta de candidato', array['email', 'sino'])
on conflict (evento) do nothing;

insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('indicacao_candidato_editada_cliente', 'email', true),
  ('indicacao_candidato_editada_cliente', 'sino',  true)
on conflict (evento, canal) do nothing;

-- Conferência (esperado: 1 evento e 2 canais ligados):
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento = 'indicacao_candidato_editada_cliente';
--   select evento, canal, ativo from public.aviso_eventos_canais where evento = 'indicacao_candidato_editada_cliente' order by canal;
--
-- Desfazer (se precisar): delete from public.aviso_eventos_canais where evento = 'indicacao_candidato_editada_cliente';
--                         delete from public.aviso_eventos where evento = 'indicacao_candidato_editada_cliente';
