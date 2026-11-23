-- FÉRIAS (aviso de vencimento), etapa 2D: registro do aviso de "vencido".
-- Depois da data-limite o cron diário (/api/cron/ferias-avisos) avisa UMA vez ("Férias VENCIDAS, risco de pagamento em dobro") e repete um lembrete a cada
-- 7 dias enquanto o período seguir sem férias programadas, em gozo ou gozadas. Esta coluna guarda o instante do último aviso ou lembrete de vencido, para o cron
-- saber se já avisou e quando foi a última vez. aviso_90_em / aviso_60_em / aviso_30_em continuam significando só os marcos de 90, 60 e 30 dias.
--
-- ADITIVA e idempotente: uma coluna nula, sem default, sem backfill, sem índice, sem policy nova (a RLS de ferias_periodos já cobre a coluna nova).
-- Nenhuma linha existente muda. Sem custo.
-- Sem esta coluna o cron NÃO envia nem marca nada e registra o motivo (migração pendente); a lista e as ações da aba Férias respondem "ainda não disponível".

alter table public.ferias_periodos add column if not exists aviso_vencido_em timestamptz;

comment on column public.ferias_periodos.aviso_vencido_em is
  'Instante do último aviso ou lembrete de VENCIDO (data-limite passada, sem férias lançadas). Nulo = ainda não avisou. O cron repete o lembrete quando passam 7 dias ou mais. Zerado ao programar, junto com aviso_90_em / aviso_60_em / aviso_30_em.';

-- Conferência (só leitura; rodar DEPOIS de aplicar):
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'ferias_periodos' and column_name = 'aviso_vencido_em';   -- 1 linha: timestamptz, YES, sem default
--   select count(*) from public.ferias_periodos where aviso_vencido_em is not null;                          -- 0
--
-- DESFAZER (se precisar):
--   alter table public.ferias_periodos drop column if exists aviso_vencido_em;
