export type EtapaKanban =
  | "triagem"
  | "entrevista_salmazos"
  | "entrevista_cliente"
  | "aprovado_cliente";

export type StatusCandidato = "ativo" | "reprovado" | "negativado";

export type StatusEncaminhamento =
  | "aguardando"
  | "aprovado"
  | "reprovado"
  | "desistiu";

// ── Admissão Digital ─────────────────────────────────────────────────────────

export type ModalidadeAdmissao = "MOT" | "terceirizacao";

export type StatusAdmissao =
  | "aguardando_candidato"
  | "em_preenchimento"
  | "aguardando_analise"
  | "em_analise"
  | "aprovado"
  | "enviado_contabilidade";

export interface Admissao {
  id: string;
  candidato_id: string;
  vaga_id: string | null;
  modalidade: ModalidadeAdmissao;
  status: StatusAdmissao;
  token: string;
  token_expira_em: string;
  token_usado_em: string | null;
  criado_por: string | null;
  criado_em: string;
  updated_at: string;
  observacoes_internas: string | null;
  lgpd_aceite_em: string | null;
  lgpd_aceite_ip: string | null;
}

export interface AdmissaoDadosPessoais {
  id: string;
  admissao_id: string;
  nome_completo: string | null;
  data_nascimento: string | null;
  sexo: "M" | "F" | null;
  estado_civil: "solteiro" | "casado" | "divorciado" | "viuvo" | "uniao_estavel" | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  cpf: string | null;
  rg_numero: string | null;
  rg_orgao_emissor: string | null;
  rg_uf: string | null;
  rg_data_emissao: string | null;
  titulo_eleitor: string | null;
  zona_eleitoral: string | null;
  secao_eleitoral: string | null;
  pis_pasep: string | null;
  carteira_trabalho_numero: string | null;
  carteira_trabalho_serie: string | null;
  carteira_trabalho_uf: string | null;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  reservista: string | null;
  nome_mae: string | null;
  nome_pai: string | null;
  grau_instrucao:
    | "fundamental_incompleto" | "fundamental_completo"
    | "medio_incompleto" | "medio_completo"
    | "superior_incompleto" | "superior_completo" | "pos_graduacao" | null;
  endereco_cep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
  telefone: string | null;
  email: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: "corrente" | "poupanca" | null;
  pix: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmissaoDependente {
  id: string;
  admissao_id: string;
  nome: string;
  parentesco: "filho" | "filha" | "conjuge" | "outro" | null;
  data_nascimento: string | null;
  cpf: string | null;
  nome_mae: string | null;
  cpf_mae: string | null;
  created_at: string;
}

export interface AdmissaoDocumento {
  id: string;
  admissao_id: string;
  tipo_documento: string;
  storage_path: string | null;
  status: "pendente" | "enviado" | "aprovado" | "rejeitado";
  motivo_rejeicao: string | null;
  obrigatorio: boolean;
  condicional: "masculino" | "motorista" | "dependente" | null;
  created_at: string;
  updated_at: string;
}

export interface Candidato {
  id: string;
  nome_completo: string;
  cpf: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  cargo_pretendido: string;
  tempo_experiencia: string;
  turno_disponivel: string;
  pretensao_salarial?: string;
  habilidades: string[];
  resumo_profissional?: string;
  resumo_candidato?: string | null;
  experiencias_profissionais?: string | null;
  curriculo_url?: string;
  etapa_kanban: EtapaKanban;
  status: StatusCandidato;
  motivo_reprovacao?: string;
  etapa_reprovacao?: string;
  anotacoes?: string;
  origem?: string;
  responsavel?: string;
  idade?: number | null;
  formacao_academica?: string | null;
  triagem_score?: number | null;
  triagem_label?: string | null;
  triagem_resumo?: string | null;
  triagem_calculada_em?: string | null;
  ultima_atualizacao_ia?: string | null;
  atualizacao_resumo?: string | null;
  juridico_consultado_em?: string | null;
  juridico_tem_trabalhista?: boolean | null;
  juridico_total_processos?: number | null;
  juridico_resumo?: unknown[] | null;
  melhor_match_score?: number | null;
  melhor_match_vaga_titulo?: string | null;
  escavador_status?: "limpo" | "consta" | null;
  bloqueado?: boolean | null;
  status_alocacao?: string | null;
  alocacao_cliente_nome?: string | null;
  alocacao_vaga_titulo?: string | null;
  alocacao_data_inicio?: string | null;
  alocacao_data_fim?: string | null;
  alocacao_tipo_servico?: string | null;
  alocacao_renovavel?: boolean | null;
  reprovado_internamente?: boolean | null;
  reprovacao_motivo?: string | null;
  reprovado_por_id?: string | null;
  reprovado_por_nome?: string | null;
  reprovado_em?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KanbanCard {
  cv_id: string;
  etapa: string;
  vaga_id: string;
  vaga_titulo: string;
  vaga_tipo_servico: string | null;
  encaminhamento_tipo_servico: string | null;
  cliente_nome: string | null;
  observacoes: string | null;
  candidato_id: string;
  nome_completo: string;
  cargo_pretendido: string;
  cidade: string;
  estado: string;
  triagem_score: number | null;
  triagem_label: string | null;
  origem: string | null;
  bloqueado: boolean | null;
  responsavel: string | null;
  habilidades: string[] | null;
  resumo_profissional: string | null;
  created_at: string;
  candidato_created_at: string;
}

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  candidato_id: string | null;
  lida: boolean;
  created_at: string;
}

export interface Cliente {
  id: string;
  nome: string;
  contato_nome: string;
  contato_telefone: string;
  contato_email: string;
  cidade: string;
  segmento: string;
  servicos: string[];
  ativo: boolean;
  responsavel_comercial?: string;
  entidade_contratante?: string | null;
  created_at: string;
}

export type StatusVaga = "aberta" | "fechada" | "cancelada";

export interface Vaga {
  id: string;
  titulo: string;
  cliente_id: string | null;
  tipo_servico: string;
  num_posicoes: number;
  prazo: string | null;
  status: StatusVaga;
  cidade: string | null;
  estado: string | null;
  salario: string | null;
  requisitos: string | null;
  beneficios: string | null;
  horario: string | null;
  habilidades_desejadas: string[];
  responsavel: string;
  observacoes: string | null;
  fee_rs_percentual?: number | null;
  fee_rs_prazo_cobranca?: string | null;
  tipo_servico_original?: string | null;
  tipo_servico_alterado_em?: string | null;
  tipo_servico_alterado_por?: string | null;
  tipo_servico_motivo?: string | null;
  data_abertura?: string | null;
  data_fechamento?: string | null;
  created_at: string;
  cliente_nome_temp?: string | null;
  clientes?: { id: string; nome: string } | null;
}

export interface MatchDetalhes {
  cargo_match: number;
  habilidades_match: number;
  localizacao_match: number;
  experiencia_match: number;
  resumo: string;
}

export interface CandidatoVaga {
  id: string;
  vaga_id: string;
  candidato_id: string;
  etapa: string | null;
  created_at: string;
  match_score?: number | null;
  match_detalhes?: MatchDetalhes | null;
  match_calculado_em?: string | null;
  retencao_score?: number | null;
  retencao_label?: string | null;
  retencao_resumo?: string | null;
  retencao_calculado_em?: string | null;
  candidatos?: Pick<Candidato, "id" | "nome_completo" | "etapa_kanban" | "responsavel" | "cargo_pretendido"> | null;
  vagas?: Pick<Vaga, "id" | "titulo" | "cidade" | "estado"> | null;
}

export interface Encaminhamento {
  id: string;
  candidato_id: string;
  cliente_id: string;
  data_entrevista: string;
  status: StatusEncaminhamento;
  tipo_servico?: string;
  observacoes?: string;
  feedback_cliente?: string | null;
  vaga_id?: string | null;
  created_at: string;
  updated_at: string;
  cliente?: Pick<Cliente, "id" | "nome" | "cidade" | "segmento" | "servicos">;
}
