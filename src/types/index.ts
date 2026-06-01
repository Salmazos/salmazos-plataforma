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
