-- ASO DEMISSIONAL na rescisão: anexar depois, controlar pendência e dar visibilidade ao cliente (portal > Rescindidos).
-- Depende de migration_rescisoes.sql, migration_avisos_fase1b.sql e migration_avisos_cliente_bloco1.sql (já aplicadas).
-- ADITIVA e idempotente: só ADD COLUMN IF NOT EXISTS (todas NULL, sem default, sem backfill — nenhuma rescisão tem ASO hoje)
-- e 2 eventos de aviso novos (dado, não schema). NENHUMA policy/RLS é criada, alterada ou removida; nenhuma constraint
-- existente muda (o grupo 'rescisao' e o grupo 'avisos_cliente' já são válidos no CHECK de aviso_eventos).
-- O ASO continua sendo dado de saúde: o arquivo segue no bucket privado admissao-docs (rescisoes-aso/...), só abre por
-- URL assinada curta. As colunas novas guardam só quem/quando/data do exame, nunca o conteúdo.
-- ASO PERIÓDICO (funcionario_asos) NÃO é tocado.
-- Sem custo: 5 colunas nulas e linhas de configuração: 2 eventos (aviso_eventos), 3 canais (aviso_eventos_canais) e os
-- destinatários do aviso interno (aviso_destinatarios; 0 a N linhas, uma por pessoa que já recebe os sinos de rescisão).

-- ── 1. Colunas novas em rescisoes ────────────────────────────────────────────
alter table public.rescisoes add column if not exists aso_demissional_anexado_em timestamptz null;
alter table public.rescisoes add column if not exists aso_demissional_anexado_por uuid null;
alter table public.rescisoes add column if not exists aso_demissional_data_exame date null;
-- Preenchida quando o cliente é avisado da 1ª anexação: garante "avisa só na primeira vez" (a troca do arquivo não avisa).
alter table public.rescisoes add column if not exists aso_demissional_aviso_cliente_em timestamptz null;
-- Dia (Brasília) do último aviso interno de "ASO pendente" que incluiu esta rescisão: evita repetir no mesmo dia.
alter table public.rescisoes add column if not exists ultimo_aviso_aso_pendente_enviado_em timestamptz null;

comment on column public.rescisoes.aso_demissional_anexado_em is 'Quando o ASO demissional foi anexado pela 1ª vez (a troca do arquivo não altera).';
comment on column public.rescisoes.aso_demissional_anexado_por is 'auth.users.id de quem anexou o ASO (sem FK, como criado_por).';
comment on column public.rescisoes.aso_demissional_data_exame is 'Data do exame demissional (opcional).';
comment on column public.rescisoes.aso_demissional_aviso_cliente_em is 'Quando o cliente foi avisado (sino) da 1ª anexação do ASO.';
comment on column public.rescisoes.ultimo_aviso_aso_pendente_enviado_em is 'Último aviso interno de ASO demissional pendente que incluiu esta rescisão.';

-- ── 2. Eventos de aviso (aparecem em Configurações > Avisos) ─────────────────
-- aso_demissional_anexado_cliente: aviso AO CLIENTE (sino e popup no portal) na 1ª anexação. Sem lista de pessoas:
--   recebe todo usuário do portal do cliente (mesmo padrão dos eventos do grupo avisos_cliente).
-- rescisao_aso_pendente: aviso INTERNO diário (cron rescisao-avisos) para a lista de "Avisos de Rescisão" quando há
--   rescisão sem ASO com 10+ dias desde o desligamento. Só sino (o popup de login deriva do sino, como nos demais
--   avisos de rescisão); sem e-mail.
--   CORTE: só rescisão com data_desligamento >= 2026-11-01 entra neste aviso (as anteriores não geram aviso interno, mas
--   seguem pendentes na tela). A data NÃO está neste SQL: é a constante ASO_DEMISSIONAL_CONTROLE_INICIO em
--   src/lib/asoDemissionalRegras.ts, ajustável sem migração. O aviso ao cliente (1ª anexação) vale para qualquer rescisão.
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('aso_demissional_anexado_cliente', 'avisos_cliente', 'ASO demissional anexado (aviso ao cliente)', array['sino', 'popup']),
  ('rescisao_aso_pendente',           'rescisao',       'ASO demissional pendente',                  array['sino'])
on conflict (evento) do nothing;

-- Liga/desliga inicial. O aviso ao cliente só sai com a linha do canal ativa (sem linha = desligado).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('aso_demissional_anexado_cliente', 'sino',  true),
  ('aso_demissional_anexado_cliente', 'popup', true),
  ('rescisao_aso_pendente',           'sino',  true)
on conflict (evento, canal) do nothing;

-- ── 3. Destinatários do aviso interno ────────────────────────────────────────
-- Parte da lista que hoje já recebe os avisos de sino de rescisão (união, sem repetir, de quem está ativo nos eventos
-- rescisao_lancamento / vencimento_rescisao / vencimento_guia / paga). Pode ser ajustada depois em Configurações > Avisos.
-- Sem destinatário nenhum o cron simplesmente não avisa ninguém.
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo)
select distinct 'rescisao_aso_pendente', 'sino', 'usuario', d.usuario_id, true
from public.aviso_destinatarios d
where d.evento in ('rescisao_lancamento', 'rescisao_vencimento_rescisao', 'rescisao_vencimento_guia', 'rescisao_paga')
  and d.canal = 'sino' and d.ativo = true and d.tipo_destinatario = 'usuario' and d.usuario_id is not null
  and not exists (
    select 1 from public.aviso_destinatarios x
    where x.evento = 'rescisao_aso_pendente' and x.canal = 'sino' and x.usuario_id = d.usuario_id
  );

-- ── 4. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'rescisoes'
--     and column_name in ('aso_demissional_anexado_em','aso_demissional_anexado_por','aso_demissional_data_exame',
--                         'aso_demissional_aviso_cliente_em','ultimo_aviso_aso_pendente_enviado_em');   -- 5 linhas
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('aso_demissional_anexado_cliente','rescisao_aso_pendente') order by 1, 2;            -- 3 linhas
--   select count(*) from public.rescisoes where aso_documento_path is null;                              -- = pendentes hoje (TODAS, inclusive anteriores a 01/11/2026: é o que a tela mostra, não o que o cron avisa)
--   -- Pendentes que o cron de fato avisaria (data de corte do código; 10+ dias só a partir de 11/11/2026 para as de 01/11):
--   select count(*) from public.rescisoes where aso_documento_path is null and data_desligamento >= date '2026-11-01';
--   -- Destinatários copiados para o aviso interno (vazia = o cron não avisa ninguém até alguém entrar em Configurações > Avisos):
--   select evento, canal, usuario_id, ativo from public.aviso_destinatarios
--   where evento = 'rescisao_aso_pendente' order by usuario_id;
--   -- Origem da cópia, para comparar (esperado: o destinatarios acima = união destes, sem repetir):
--   select distinct usuario_id from public.aviso_destinatarios
--   where evento in ('rescisao_lancamento','rescisao_vencimento_rescisao','rescisao_vencimento_guia','rescisao_paga')
--     and canal = 'sino' and ativo = true and tipo_destinatario = 'usuario' and usuario_id is not null;
