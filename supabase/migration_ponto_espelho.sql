-- Módulo "Espelho de Ponto" — importação do export do EzePoint por cliente/período,
-- revisão/justificativa pelo RH (etapa 1) e, nas próximas etapas, aprovação pelo cliente
-- no portal e envio final pra contabilidade. Ver conversa com o Olver (set/2026) pro
-- desenho completo do fluxo.
--
-- Aplicada em produção via mcp__Supabase__apply_migration (nome: ponto_espelho), este
-- arquivo é só o registro local (CLAUDE.md: toda mudança de schema precisa de rastro).

create table if not exists ponto_fechamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  unidade_id uuid references unidades(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  -- rascunho: RH ainda revisando/corrigindo. aguardando_aprovacao_cliente: enviado pro
  -- portal (etapa 2). aprovado_cliente: todos os apontamentos fora do padrão decididos.
  -- enviado_contabilidade: fechamento travado, export final gerado (etapa 3).
  status text not null default 'rascunho'
    check (status in ('rascunho', 'aguardando_aprovacao_cliente', 'aprovado_cliente', 'enviado_contabilidade')),
  arquivo_original_nome text,
  arquivo_original_path text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  enviado_aprovacao_em timestamptz,
  aprovado_cliente_em timestamptz,
  enviado_contabilidade_em timestamptz,
  enviado_contabilidade_por uuid,
  -- Evita reimportar o mesmo cliente+período duas vezes por engano (gerando um segundo
  -- fechamento duplicado) — reimportação de verdade precisa apagar o anterior primeiro.
  unique (cliente_id, periodo_inicio, periodo_fim)
);

create table if not exists ponto_funcionarios (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references ponto_fechamentos(id) on delete cascade,
  -- Nullable até o vínculo ser resolvido (ver status_vinculo) — nunca associa a um
  -- funcionário errado só pra preencher o campo (regra "nunca decide no escuro").
  funcionario_id uuid references funcionarios(id),
  nome_planilha text not null,
  -- Número final do nome da aba no EzePoint (ex: "Gustavo H. D. S. G. - 7334" -> "7334")
  -- — mais estável que nome pra reconhecer o mesmo funcionário em importações futuras,
  -- já que o export não traz CPF.
  ezepoint_codigo text,
  cargo text,
  data_admissao date,
  -- Bloco de totais do rodapé do relatório (HT, HN, AT, FA, AN, AE, EN, EX, CH, DSR,
  -- EX1/2/3, EN1/2/3, etc) — snapshot como veio da planilha, exibição apenas, por isso
  -- jsonb em vez de uma coluna por campo (o conjunto exato já variou entre exports).
  totais jsonb not null default '{}'::jsonb,
  status_vinculo text not null default 'pendente_vinculo'
    check (status_vinculo in ('vinculado', 'pendente_vinculo', 'ignorado')),
  criado_em timestamptz not null default now()
);

create table if not exists ponto_dias (
  id uuid primary key default gen_random_uuid(),
  ponto_funcionario_id uuid not null references ponto_funcionarios(id) on delete cascade,
  data date not null,
  dia_semana text,
  -- Marcações de ponto do dia (["07:38","22:00","23:00", ...]) — editável pelo RH.
  marcacoes jsonb not null default '[]'::jsonb,
  -- Texto original da coluna de observação da planilha ("NÃO ADMITIDO", "Folga",
  -- "Atestado Médico", "Atestado de horas", etc) — nunca editado, é o dado como veio.
  nota_original text,
  -- Campos calculados do dia (CH/HN/HT/EX/EN/AT/FA/AE/AN/EX1), como vieram da planilha —
  -- editável pelo RH junto com as marcações.
  campos jsonb not null default '{}'::jsonb,
  -- Calculado na importação (AT>0, FA>0, nota de atestado, ou número ímpar de marcações)
  -- — decide se o dia aparece na revisão como "fora do padrão", ver lib/pontoAnomalia.ts.
  fora_padrao boolean not null default false,
  tipo_ocorrencia text
    check (tipo_ocorrencia in ('atraso', 'falta', 'atestado_medico', 'atestado_horas', 'suspensao', 'marcacao_incompleta', 'outro')),
  justificativa_rh text,
  -- sem_acao: dia normal, não precisa de nada. aguardando_cliente/confirmado_cliente/
  -- contestado_cliente: etapa 2 (aprovação no portal), colunas já criadas agora pra não
  -- exigir migração nova quando essa etapa for construída.
  status_decisao text not null default 'sem_acao'
    check (status_decisao in ('sem_acao', 'aguardando_cliente', 'confirmado_cliente', 'contestado_cliente')),
  decisao_cliente_texto text,
  decisao_cliente_em timestamptz,
  decisao_cliente_user_id uuid,
  criado_em timestamptz not null default now(),
  unique (ponto_funcionario_id, data)
);

create index if not exists idx_ponto_fechamentos_cliente on ponto_fechamentos(cliente_id);
create index if not exists idx_ponto_funcionarios_fechamento on ponto_funcionarios(fechamento_id);
create index if not exists idx_ponto_funcionarios_funcionario on ponto_funcionarios(funcionario_id);
create index if not exists idx_ponto_dias_ponto_funcionario on ponto_dias(ponto_funcionario_id);
create index if not exists idx_ponto_dias_fora_padrao on ponto_dias(ponto_funcionario_id) where fora_padrao;
