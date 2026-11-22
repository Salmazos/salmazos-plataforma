-- FÉRIAS (aviso de vencimento) — controle do prazo de férias dos funcionários da Salmazos.
-- A contabilidade terceirizada faz todos os cálculos e lançamentos de férias (valores, faltas, dias de direito,
-- fracionamento). A plataforma só AVISA quem está perto de vencer, para o RH programar junto com a contabilidade, e
-- guarda a situação preenchida pelo RH: a_programar → programada → em_gozo → gozada.
--
-- Quem entra (regra do código, não do banco): funcionarios.status = 'ativo' E (tipo_servico = 'terceirizacao' OU
-- efetivado_em IS NOT NULL). MOT sem efetivação fica fora; analistas (analistas_perfil) ficam fora nesta fase.
--
-- ADITIVA e idempotente: 2 tabelas novas, índices, trigger de atualizado_em, RLS com policy só do service role, o grupo
-- 'ferias' no CHECK de aviso_eventos e o evento 'ferias_vencimento' (dado, não schema). Nenhuma tabela existente é
-- alterada (além do CHECK de grupo de aviso_eventos, que só ganha um valor). Nenhuma linha existente muda.
-- Sem custo: tabelas pequenas (um período por funcionário por ano), nenhum add-on, nenhuma extensão nova.
--
-- Dado sensível? Não há dado de saúde nem valor: só datas e situação. Mesmo assim SEM policy para analistas nem para
-- cliente do portal: todo acesso do app passa pelo service role, depois do gate de RH (podeAcessarFuncionarios) e do
-- recorte por unidade (checarAcessoFuncionarioRH). Não replica o "analistas_all" de funcionarios de propósito.
--
-- REGRAS DE DATA (calculadas no app, src/lib/feriasRegras.ts; o banco só confere a ordem):
--  - data-base = coalesce(ferias_config.data_base_ajustada, funcionarios.data_admissao). A efetivação NÃO entra na conta.
--  - período n começa no (n-1)º aniversário da data-base e termina na véspera do n-ésimo aniversário
--    (aquisitivo_fim = início do período n+1 - 1 dia: períodos sem lacuna e sem sobreposição).
--  - 29/02: em ano não bissexto o aniversário cai em 28/02 (decisão do Olver); em ano bissexto volta a 29/02.
--    Cada aniversário é calculado a partir da data-base (nunca encadeado), então 29/02/2024 dá 28/02/2025 e 29/02/2028.
--  - data_limite = aquisitivo_fim + 12 meses (data limite para TIRAR as férias; depois disso há pagamento em dobro).
--    A soma de meses segue o calendário (dia 29/30/31 vira o último dia do mês quando o mês é menor).
--  - admissão futura: sem período ("ainda não iniciou"). Admissão sem data: sem período ("informar data-base").
--  - admissão divergente da admissão digital: vale funcionarios.data_admissao; o RH ajusta a data-base se precisar.
--  - "Saldo inicial pendente": só existe quando o funcionário JÁ TEM pelo menos um período aquisitivo terminado e
--    ferias_config.saldo_inicial_confirmado_em é nulo. Aparece cinza e NADA vira vencido nem dispara aviso sozinho.
--    Quem ainda não tem período terminado (menos de 12 meses de casa) não precisa de saldo: vale "nenhum", calculado na
--    hora pelo app, sem gravar nada. Informar o saldo (fim do último período aquisitivo já quitado, ou "nenhum")
--    marca como gozada, com origem 'saldo_inicial', os períodos que terminam até essa data.

-- ── 1. ferias_config: data-base e saldo inicial por funcionário ──────────────
create table if not exists public.ferias_config (
  funcionario_id uuid primary key references public.funcionarios(id) on delete cascade,
  -- Nula = usa funcionarios.data_admissao. Preenchida = ajuste do RH (intervalo entre contratos, admissão divergente, legado).
  data_base_ajustada date,
  ajustado_por uuid,                 -- auth.users.id (sem FK, como criado_por nas demais tabelas do RH)
  ajustado_em timestamptz,
  motivo text,                       -- obrigatório quando há ajuste (ver CHECK abaixo)
  -- Nulo = sem saldo informado: "Saldo inicial pendente" quando já há período terminado (com menos de 12 meses de casa vale "nenhum" calculado
  -- na hora, sem gravar). Preenchido = a contabilidade já informou (inclusive "nenhum").
  saldo_inicial_confirmado_em timestamptz,
  saldo_inicial_confirmado_por uuid,
  -- Fim do último período aquisitivo quitado que foi informado (nulo = "nenhum"). Guardado para conferência e auditoria.
  saldo_inicial_quitado_ate date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ferias_config_ajuste_completo_check
    check (
      data_base_ajustada is null
      or (nullif(btrim(motivo), '') is not null and ajustado_por is not null and ajustado_em is not null)
    ),
  constraint ferias_config_saldo_quitado_check
    check (saldo_inicial_quitado_ate is null or saldo_inicial_confirmado_em is not null)
);

comment on table public.ferias_config is
  'Férias (aviso de vencimento): data-base ajustada pelo RH e saldo inicial informado pela contabilidade, por funcionário.';
comment on column public.ferias_config.data_base_ajustada is
  'Nula = usa funcionarios.data_admissao. Ajuste do RH exige motivo, autor e data (CHECK).';
comment on column public.ferias_config.saldo_inicial_confirmado_em is
  'Nulo = sem saldo informado. Havendo período terminado, é "Saldo inicial pendente": sem aviso e sem vencido até a contabilidade informar o último período quitado (ou "nenhum"). Sem período terminado, vale "nenhum" calculado na hora.';

-- ── 2. ferias_periodos: um período aquisitivo por funcionário e ano ──────────
create table if not exists public.ferias_periodos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  numero integer not null,
  aquisitivo_inicio date not null,
  aquisitivo_fim date not null,        -- véspera do aniversário seguinte da data-base
  data_limite date not null,           -- aquisitivo_fim + 12 meses: último dia para TIRAR as férias
  situacao text not null default 'a_programar',
  gozo_inicio date,
  gozo_fim date,
  observacao text,
  origem text not null default 'gerado',
  -- Controle dos avisos de 90/60/30 dias (cron da etapa 2D): uma vez por marco, gravado só depois do envio confirmado.
  aviso_90_em timestamptz,
  aviso_60_em timestamptz,
  aviso_30_em timestamptz,
  atualizado_por uuid,                 -- auth.users.id de quem mexeu por último (nulo = gerado pelo sistema)
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  -- Mesma unidade do funcionário (copiada na geração): o recorte por unidade do RH filtra por aqui.
  unidade_id uuid not null default public.unidade_padrao() references public.unidades(id),
  constraint ferias_periodos_funcionario_numero_unico unique (funcionario_id, numero),
  constraint ferias_periodos_numero_check check (numero >= 1),
  constraint ferias_periodos_situacao_check
    check (situacao = any (array['a_programar', 'programada', 'em_gozo', 'gozada'])),
  constraint ferias_periodos_origem_check
    check (origem = any (array['gerado', 'saldo_inicial'])),
  constraint ferias_periodos_datas_check
    check (aquisitivo_fim > aquisitivo_inicio and data_limite > aquisitivo_fim),
  constraint ferias_periodos_gozo_ordem_check
    check (gozo_fim is null or gozo_inicio is null or gozo_fim >= gozo_inicio),
  -- a_programar não tem datas de gozo; programada/em_gozo/gozada têm as duas, exceto o que veio do saldo inicial
  -- (a contabilidade informa só "quitado até", sem as datas do gozo).
  constraint ferias_periodos_gozo_coerente_check
    check (
      (situacao = 'a_programar' and gozo_inicio is null and gozo_fim is null)
      or (situacao <> 'a_programar' and origem = 'saldo_inicial')
      or (situacao <> 'a_programar' and gozo_inicio is not null and gozo_fim is not null)
    ),
  constraint ferias_periodos_saldo_inicial_gozada_check
    check (origem <> 'saldo_inicial' or situacao = 'gozada')
);

comment on table public.ferias_periodos is
  'Férias (aviso de vencimento): período aquisitivo por funcionário, com data-limite, situação preenchida pelo RH e controle dos avisos de 90/60/30 dias.';
comment on column public.ferias_periodos.data_limite is
  'aquisitivo_fim + 12 meses. Passada essa data sem gozo, há pagamento em dobro (principal alerta).';
comment on column public.ferias_periodos.origem is
  'gerado = criado pelo sistema a partir da data-base; saldo_inicial = quitado, informado pela contabilidade na implantação.';
comment on column public.ferias_periodos.aviso_90_em is
  'Quando o aviso de 90 dias foi enviado (nulo = ainda não). Zerado ao programar, para os avisos voltarem se a data programada passar sem gozo.';

-- A tela e o cron (2D) só olham períodos ainda não gozados, por data-limite.
create index if not exists ferias_periodos_abertos_limite_idx
  on public.ferias_periodos (data_limite) where situacao <> 'gozada';
create index if not exists ferias_periodos_unidade_idx
  on public.ferias_periodos (unidade_id);

-- ── 3. atualizado_em automático (mesma função de funcionarios/rescisoes) ─────
drop trigger if exists ferias_config_atualizado_em on public.ferias_config;
create trigger ferias_config_atualizado_em
  before update on public.ferias_config
  for each row execute function public.set_atualizado_em();

drop trigger if exists ferias_periodos_atualizado_em on public.ferias_periodos;
create trigger ferias_periodos_atualizado_em
  before update on public.ferias_periodos
  for each row execute function public.set_atualizado_em();

-- ── 4. RLS: só o service role (mesmo padrão de "Service role total funcionario_mot_eventos") ──
alter table public.ferias_config enable row level security;
alter table public.ferias_periodos enable row level security;

drop policy if exists "Service role total ferias_config" on public.ferias_config;
create policy "Service role total ferias_config" on public.ferias_config
  for all to service_role
  using (true)
  with check (true);

drop policy if exists "Service role total ferias_periodos" on public.ferias_periodos;
create policy "Service role total ferias_periodos" on public.ferias_periodos
  for all to service_role
  using (true)
  with check (true);

-- ── 5. Evento de aviso (aparece em Configurações > Avisos quando a 2D acrescentar o grupo no catálogo do código) ──
-- Só o REGISTRO: nenhum cron dispara este evento ainda (etapa 2D) e nenhum destinatário é criado aqui.
-- Novo grupo 'ferias' no CHECK de aviso_eventos (os 5 grupos atuais continuam válidos; nenhuma linha muda).
alter table public.aviso_eventos drop constraint if exists aviso_eventos_grupo_check;
alter table public.aviso_eventos
  add constraint aviso_eventos_grupo_check
  check (grupo = any (array['vagas', 'rescisao', 'aso', 'portal_cliente', 'avisos_cliente', 'ferias']));

insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('ferias_vencimento', 'ferias', 'Férias a vencer (90, 60 e 30 dias antes da data-limite)', array['sino', 'popup'])
on conflict (evento) do nothing;

insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('ferias_vencimento', 'sino',  true),
  ('ferias_vencimento', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 6. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
--   select table_name, row_security from (
--     select c.relname as table_name, c.relrowsecurity as row_security
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relname in ('ferias_config', 'ferias_periodos')) t;               -- 2 linhas, row_security = true
--   select tablename, policyname, cmd, roles from pg_policies
--   where tablename in ('ferias_config', 'ferias_periodos');                                            -- 2 linhas, só service_role
--   select count(*) from public.ferias_periodos;                                                         -- 0 (nada é gerado pela migration)
--   select evento, grupo, canais_suportados from public.aviso_eventos where evento = 'ferias_vencimento'; -- 1 linha
--   select evento, canal, ativo from public.aviso_eventos_canais where evento = 'ferias_vencimento';      -- 2 linhas
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'aviso_eventos_grupo_check';     -- inclui 'ferias'
--
-- DESFAZER (se precisar; as tabelas novas não têm dependentes):
--   delete from public.aviso_eventos where evento = 'ferias_vencimento';   -- apaga canais e destinatários em cascata
--   drop table if exists public.ferias_periodos;
--   drop table if exists public.ferias_config;
--   -- (o CHECK de grupo pode continuar com 'ferias': inofensivo)
