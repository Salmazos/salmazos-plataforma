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
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export type StatusVaga = "aberta" | "em_andamento" | "fechada" | "cancelada";

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
  created_at: string;
  cliente_nome_temp?: string | null;
  clientes?: { id: string; nome: string } | null;
}

export interface CandidatoVaga {
  id: string;
  vaga_id: string;
  candidato_id: string;
  etapa: string | null;
  created_at: string;
  candidatos?: Pick<Candidato, "id" | "nome_completo" | "etapa_kanban" | "responsavel" | "cargo_pretendido"> | null;
}

export interface Encaminhamento {
  id: string;
  candidato_id: string;
  cliente_id: string;
  data_entrevista: string;
  status: StatusEncaminhamento;
  tipo_servico?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  cliente?: Pick<Cliente, "id" | "nome" | "cidade" | "segmento" | "servicos">;
}
