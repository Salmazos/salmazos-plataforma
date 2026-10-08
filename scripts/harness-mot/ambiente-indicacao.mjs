// Seed da edição de indicação pelo cliente: cliente C1 (usuário portal u-cli), vagas de vários tipos/unidades, indicações
// pendente/aprovada/recusada e o candidato + candidatura criados na aprovação. Data congelada em 07/10/2026 (ver ambiente.mjs).
import { novoDb, USUARIOS, usuario } from "./ambiente.mjs";

export * from "./ambiente.mjs";

export const OUTRO_CLI = usuario("u-cli2", "cliente"); // outro usuário do portal, mesmo cliente C1
USUARIOS.cli2 = OUTRO_CLI;
export const CLI_C2 = usuario("u-cliC2", "cliente"); // usuário do portal do cliente C2
USUARIOS.cliC2 = CLI_C2;

const uuid = (n) => `99999999-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ID = {
  V_MOT_A: uuid(1), V_MOT_B: uuid(2), V_OUTRO_CLIENTE: uuid(3), V_RS: uuid(4), V_OUTRA_UNIDADE: uuid(5), V_FECHADA: uuid(6),
  S_PEND: uuid(10), S_APROV: uuid(11), S_REC: uuid(12), S_OUTRO_USER: uuid(13), S_IRMA: uuid(14), S_APROV_EXISTENTE: uuid(15), S_OUTRA_DO_CAND: uuid(16),
  CAND: uuid(20), CAND_EXISTENTE: uuid(21), CV: uuid(30), CV_EXISTENTE: uuid(31),
};

const ATUALIZADO = "2026-10-01T10:00:00.123456+00:00"; // microssegundos + "+00:00", como o PostgREST devolve

export const solicitacaoBase = (extra = {}) => ({
  cliente_id: "C1", cliente_nome: "Cliente Um", unidade_id: "U1", vaga_id: ID.V_MOT_A, solicitado_por_user_id: "u-cli",
  candidato_nome: "Maria Souza", candidato_telefone: "(19) 98765-4321", curriculo_url: "curriculo-a.pdf",
  status: "pendente", motivo_recusa: null, decidido_por: null, decidido_em: null, candidato_id: null, candidatos_vaga_id: null,
  admissao_data_inicio: "2026-11-02", admissao_salario: 1500, admissao_salario_hora: null, admissao_setor: "Produção", admissao_centro_custo: "CC1",
  admissao_horario: "Turno A, 08h00 às 17h00", admissao_gestor: "Carlos", admissao_periodo_experiencia: "45 dias", admissao_funcao: "Operador",
  admissao_turno: "Turno A", admissao_escala: "6x1", admissao_tempo_contrato: "180 dias", admissao_vt: true, admissao_exame_responsavel: "Cliente",
  admissao_local_integracao: "Matriz, 03/11/2026 às 08:00", admissao_observacoes: "Sem observações",
  created_at: "2026-10-01T09:00:00.000+00:00", updated_at: ATUALIZADO, ...extra,
});

const CAMPOS_ADM = ["admissao_data_inicio", "admissao_salario", "admissao_salario_hora", "admissao_setor", "admissao_centro_custo", "admissao_horario", "admissao_gestor",
  "admissao_periodo_experiencia", "admissao_funcao", "admissao_turno", "admissao_escala", "admissao_tempo_contrato", "admissao_vt", "admissao_exame_responsavel",
  "admissao_local_integracao", "admissao_observacoes"];
export const cvBase = (id, candidatoId, sol, extra = {}) => ({
  id, candidato_id: candidatoId, vaga_id: sol.vaga_id, cliente_id: "C1", etapa: "aprovado_cliente", responsavel: "Nome u-dir",
  ...Object.fromEntries(CAMPOS_ADM.map((c) => [c, sol[c]])), ...extra,
});

export function novoDbIndicacao() {
  const db = novoDb();
  const vaga = (id, extra = {}) => ({ id, titulo: "Operador A", cliente_id: "C1", unidade_id: "U1", status: "aberta", tipo_servico: "mao_obra_temporaria", cidade: "Monte Mor", estado: "SP", ...extra });
  db.tabelas.vagas = [
    vaga(ID.V_MOT_A), vaga(ID.V_MOT_B, { titulo: "Operador B" }), vaga(ID.V_OUTRO_CLIENTE, { titulo: "Vaga do Cliente Dois", cliente_id: "C2" }),
    vaga(ID.V_RS, { titulo: "Analista R&S", tipo_servico: "recrutamento_selecao" }), vaga(ID.V_OUTRA_UNIDADE, { titulo: "Operador Santo André", unidade_id: "U2" }),
    vaga(ID.V_FECHADA, { titulo: "Operador Fechada", status: "fechada" }),
  ];
  const aprov = solicitacaoBase({ id: ID.S_APROV, status: "aprovada", candidato_id: ID.CAND, candidatos_vaga_id: ID.CV, decidido_por: "Nome u-dir", decidido_em: "2026-10-02T10:00:00.000+00:00", candidato_nome: "Joao Lima", candidato_telefone: "(19) 91234-5678", curriculo_url: null });
  const existente = solicitacaoBase({ id: ID.S_APROV_EXISTENTE, status: "aprovada", candidato_id: ID.CAND_EXISTENTE, candidatos_vaga_id: ID.CV_EXISTENTE, decidido_por: "Nome u-dir", candidato_nome: "Camila Dias", candidato_telefone: "(19) 99999-0000" });
  db.tabelas.solicitacoes_indicacao_candidato = [
    solicitacaoBase({ id: ID.S_PEND }),
    aprov,
    solicitacaoBase({ id: ID.S_REC, status: "recusada", motivo_recusa: "Sem perfil", candidato_nome: "Yasmim Rocha" }),
    solicitacaoBase({ id: ID.S_OUTRO_USER, solicitado_por_user_id: "u-cli2", candidato_nome: "Pedro Alves" }),
    solicitacaoBase({ id: ID.S_IRMA, vaga_id: ID.V_MOT_B, candidato_nome: "Ana Clara", status: "pendente" }),
    existente,
  ];
  db.tabelas.candidatos = [
    { id: ID.CAND, nome_completo: "Joao Lima", telefone: "(19) 91234-5678", curriculo_url: null, origem: "indicacao_direta_cliente", etapa_kanban: "aprovado_cliente" },
    { id: ID.CAND_EXISTENTE, nome_completo: "Camila Dias", telefone: "(19) 99999-0000", curriculo_url: "curriculo-a.pdf", origem: "cadastro_rapido", etapa_kanban: "aprovado_cliente" },
  ];
  db.tabelas.candidatos_vagas = [cvBase(ID.CV, ID.CAND, aprov), cvBase(ID.CV_EXISTENTE, ID.CAND_EXISTENTE, existente)];
  db.tabelas.analistas_perfil.forEach((p) => { p.email = `${p.user_id}@salmazos.test`; p.nivel_acesso = "analista"; });
  db.tabelas.cliente_usuarios.push({ id: "cu2", user_id: "u-cli2", cliente_id: "C1" }, { id: "cu3", user_id: "u-cliC2", cliente_id: "C2" });
  db.tabelas.admissoes = [];
  db.tabelas.encaminhamentos = [];
  db.tabelas.historico_candidato = [];
  db.tabelas.notificacoes_analista = [];
  db.emails = [];
  return db;
}

export const emailsPara = (db) => (db.emails ?? []).map((e) => ({ to: e.to, subject: e.subject, tipo: e.tipo }));
export const sinos = (db) => (db.tabelas.notificacoes_analista ?? []).map(({ id, created_at, criado_em, ...resto }) => resto);

// Linha da solicitação sem ids/horários gerados (comparação main x branch).
export const solSemRuido = (db) =>
  (db.tabelas.solicitacoes_indicacao_candidato ?? [])
    .map(({ created_at, criado_em, ...r }) => r)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
