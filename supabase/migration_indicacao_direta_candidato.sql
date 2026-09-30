-- Indicação direta de candidato pelo cliente (portal) — o cliente já escolheu/entrevistou
-- o candidato por fora e só precisa que a Salmazos formalize o registro, sem passar pela
-- triagem normal. Pedido do Olver (set/2026): vira uma solicitação pendente (mesmo padrão de
-- solicitacoes_vagas), um analista revisa/completa e aprova, o que cria candidato +
-- candidatura já na etapa "aprovado_cliente" com os dados de admissão prontos — o analista
-- segue dali com o "Finalizar" normal do Kanban (reaproveita garantia, cobrança R&S e
-- fechamento automático de posições já existentes, sem duplicar essa lógica aqui).
--
-- CPF/e-mail do candidato ficam OPCIONAIS nesta indicação (ASSUNÇÃO DE NEGÓCIO CONFIRMADA
-- COM O OLVER: a responsabilidade de contatar o candidato e pedir a documentação é do RH da
-- Salmazos, não do cliente) — segue o mesmo padrão já usado em cadastro rápido
-- (`TEMP-<timestamp>` pro CPF quando ausente, ver ModalCadastroRapido.tsx/admissao-rapida),
-- por isso não precisou de migração nenhuma na tabela `candidatos` pra isso.
--
-- Aplicada em produção via mcp__Supabase__apply_migration (nome: indicacao_direta_candidato),
-- este arquivo é só o registro local (CLAUDE.md: toda mudança de schema precisa de rastro).

create table if not exists solicitacoes_indicacao_candidato (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes(id),
  cliente_nome text,
  unidade_id uuid not null references unidades(id),
  vaga_id uuid not null references vagas(id),
  solicitado_por_user_id uuid,

  candidato_nome text not null,
  candidato_telefone text not null,
  -- Path no bucket "curriculos" (mesmo bucket/convenção de FormCandidaturaVagaPublica.tsx) —
  -- upload feito direto do navegador do cliente, essa coluna só guarda a referência.
  curriculo_url text,

  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada')),
  motivo_recusa text,
  decidido_por text,
  decidido_em timestamptz,

  -- Preenchidos só depois da aprovação, pra rastrear o que essa solicitação virou.
  candidato_id uuid references candidatos(id),
  candidatos_vaga_id uuid references candidatos_vagas(id),

  -- Mesmo conjunto de campos admissao_* de candidatos_vagas — o cliente já manda tudo
  -- pronto (mesmos dados que hoje só iam por e-mail na aprovação normal, ver card "Dados de
  -- Admissão" no perfil do candidato), o analista só confere/ajusta antes de aprovar.
  admissao_data_inicio date,
  admissao_salario numeric,
  admissao_salario_hora numeric,
  admissao_setor text,
  admissao_centro_custo text,
  admissao_horario text,
  admissao_gestor text,
  admissao_periodo_experiencia text,
  admissao_funcao text,
  admissao_turno text,
  admissao_escala text,
  admissao_tempo_contrato text,
  admissao_vt boolean,
  admissao_exame_responsavel text,
  admissao_local_integracao text,
  admissao_observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_solicitacoes_indicacao_cliente on solicitacoes_indicacao_candidato(cliente_id);
create index if not exists idx_solicitacoes_indicacao_status on solicitacoes_indicacao_candidato(status);
create index if not exists idx_solicitacoes_indicacao_unidade on solicitacoes_indicacao_candidato(unidade_id);
create index if not exists idx_solicitacoes_indicacao_vaga on solicitacoes_indicacao_candidato(vaga_id);

-- Deep-link do sino pra essa solicitação específica, mesmo padrão de
-- notificacoes_analista.solicitacao_vaga_id (abre o modal já focado nela).
alter table notificacoes_analista
  add column if not exists solicitacao_indicacao_id uuid references solicitacoes_indicacao_candidato(id);

-- candidatos.origem precisa de um valor próprio pra essa origem, pra distinguir no
-- Banco de Candidatos/relatórios de 'cadastro_rapido' (que é iniciativa da Salmazos, não do
-- cliente) e dos outros dois valores já existentes.
alter table candidatos drop constraint if exists chk_candidatos_origem;
alter table candidatos add constraint chk_candidatos_origem
  check (origem = any (array['cadastro_rapido', 'vaga_especifica', 'banco_talentos', 'indicacao_direta_cliente']));

