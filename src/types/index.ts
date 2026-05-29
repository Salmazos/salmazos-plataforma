export type EtapaKanban =
  | "triagem"
  | "entrevista_salmazos"
  | "entrevista_cliente"
  | "aprovado_cliente";

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
  anotacoes?: string;
  origem?: string;
  created_at: string;
  updated_at: string;
}
