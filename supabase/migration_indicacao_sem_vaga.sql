-- Indicação direta de candidato SEM vaga aberta (Portal do Cliente > Indicar Candidato para Registro).
-- Hoje a indicação exige uma vaga aberta do cliente (solicitacoes_indicacao_candidato.vaga_id NOT NULL). Com esta migração o
-- cliente pode indicar mesmo sem vaga: a indicação nasce com vaga_id NULL, o analista da Salmazos recebe e decide — direcionar para
-- uma vaga existente do cliente ou criar a vaga a partir da indicação. Em ambos os casos a indicação passa a ter vaga_id e segue o
-- fluxo normal de aprovação já existente (candidato + candidatura + encaminhamento + admissão), sem duplicar essa lógica.
--
-- NÃO há status novo: "aguardando direcionamento" = status 'pendente' E vaga_id IS NULL. Assim nada que já filtra por 'pendente'
-- (contador e botão "Indicações" do painel, popup, sino, "Minhas Indicações", edição pelo cliente) precisa mudar de critério.
-- A indicação sem vaga NÃO cria candidatura (candidatos_vagas.vaga_id é NOT NULL e continua sendo), nem admissão, nem cobrança,
-- nem comissão: tudo isso só nasce quando ela ganha vaga e é aprovada.
--
-- ADITIVA e IDEMPOTENTE: relaxa um NOT NULL, acrescenta 5 colunas nulas/com default e 3 constraints novas; não altera nem apaga
-- nenhuma linha. As 23 indicações existentes (todas com vaga, todas aprovadas) satisfazem as constraints novas e ficam
-- exatamente como estão (sem backfill).
--
-- Ordem de deploy: aplicar esta migração ANTES do código que grava indicação sem vaga. Se o código subir antes, a rota recebe
-- 42703/23502 (coluna ausente / NOT NULL) e responde erro genérico (ver ehErroColunaAusente em src/lib/funcionarioEfetivacao.ts).

-- 1) vaga_id passa a aceitar NULL (a FK para vagas continua valendo quando preenchido).
alter table public.solicitacoes_indicacao_candidato
  alter column vaga_id drop not null;

-- 2) Colunas novas.
--    tipo_servico: o que o cliente escolheu na tela quando NÃO há vaga (MOT / Terceirização / R&S). Com vaga, a fonte continua
--      sendo vagas.tipo_servico; esta coluna fica NULL nas indicações com vaga.
--    sem_vaga_origem: true se a indicação NASCEU sem vaga (continua true depois de direcionada — serve para auditoria e métricas).
--    direcionada_em / direcionada_por / direcionamento_tipo: quem ligou a indicação a uma vaga, quando e como.
alter table public.solicitacoes_indicacao_candidato
  add column if not exists tipo_servico text,
  add column if not exists sem_vaga_origem boolean not null default false,
  add column if not exists direcionada_em timestamptz,
  add column if not exists direcionada_por text,
  add column if not exists direcionamento_tipo text;

-- 3) Constraints (criadas só se ainda não existirem).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'solicitacoes_indicacao_candidato_tipo_servico_check'
      and conrelid = 'public.solicitacoes_indicacao_candidato'::regclass
  ) then
    alter table public.solicitacoes_indicacao_candidato
      add constraint solicitacoes_indicacao_candidato_tipo_servico_check
      check (tipo_servico is null or tipo_servico = any (array['recrutamento_selecao', 'mao_obra_temporaria', 'terceirizacao']));
  end if;

  -- Indicação sem vaga TEM que dizer o tipo de serviço (é o que decide os campos que o analista vai pedir e para qual vaga
  -- ela pode ser direcionada). Com vaga, a coluna é livre.
  if not exists (
    select 1 from pg_constraint
    where conname = 'solicitacoes_indicacao_candidato_sem_vaga_tipo_check'
      and conrelid = 'public.solicitacoes_indicacao_candidato'::regclass
  ) then
    alter table public.solicitacoes_indicacao_candidato
      add constraint solicitacoes_indicacao_candidato_sem_vaga_tipo_check
      check (vaga_id is not null or tipo_servico is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'solicitacoes_indicacao_candidato_direcionamento_check'
      and conrelid = 'public.solicitacoes_indicacao_candidato'::regclass
  ) then
    alter table public.solicitacoes_indicacao_candidato
      add constraint solicitacoes_indicacao_candidato_direcionamento_check
      check (direcionamento_tipo is null or direcionamento_tipo = any (array['vaga_existente', 'vaga_criada']));
  end if;
end;
$$;

-- 4) Índice parcial da fila "aguardando direcionamento" (por unidade, mais antigas primeiro).
create index if not exists idx_solicitacoes_indicacao_sem_vaga
  on public.solicitacoes_indicacao_candidato (unidade_id, created_at)
  where vaga_id is null and status = 'pendente';

-- RLS: sem mudança. A tabela já tem RLS ligada e só a policy do service_role (migration_indicacao_direta_candidato_rls.sql);
-- as colunas novas herdam isso e todo acesso do app passa pelo servidor (cliente do portal filtrado por cliente_id).

-- Conferência depois de aplicar (esperado: vaga_id is_nullable = YES; 5 colunas novas; 3 constraints; 0 indicações sem vaga):
--   select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='solicitacoes_indicacao_candidato' and column_name in ('vaga_id','tipo_servico','sem_vaga_origem','direcionada_em','direcionada_por','direcionamento_tipo');
--   select conname from pg_constraint where conrelid='public.solicitacoes_indicacao_candidato'::regclass and conname like '%tipo_servico_check' or conname like '%sem_vaga_tipo_check' or conname like '%direcionamento_check';
--   select count(*) from public.solicitacoes_indicacao_candidato where vaga_id is null;
--
-- Desfazer (só se nenhuma indicação sem vaga tiver sido gravada ainda):
--   alter table public.solicitacoes_indicacao_candidato alter column vaga_id set not null;
--   (as colunas e constraints novas podem ficar: são inofensivas)
