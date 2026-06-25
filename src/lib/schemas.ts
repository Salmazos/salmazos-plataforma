import { z } from "zod";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: msg };
  }
  return { success: true, data: result.data };
}

const coerceNumber = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}, z.number());

const coerceNumberOptional = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}, z.number().optional());

const coerceNumberNullable = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? val : n;
}, z.number().nullable());

// ── Candidato ────────────────────────────────────────────────────────────────

export const candidatoCreateSchema = z.object({
  nome_completo: z.string().min(2),
  telefone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  cpf: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().max(2).optional(),
  cargo_pretendido: z.string().optional(),
  tempo_experiencia: z.string().optional(),
  turno_disponivel: z.string().optional(),
  pretensao_salarial: z.string().optional().nullable(),
  habilidades: z.array(z.string()).optional(),
  resumo_profissional: z.string().optional().nullable(),
  resumo_candidato: z.string().optional().nullable(),
  experiencias_profissionais: z.string().optional().nullable(),
  curriculo_url: z.string().optional().nullable(),
  idade: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(14).max(100).nullable()).optional(),
  formacao_academica: z.string().optional().nullable(),
  origem: z.string().optional(),
  vaga_id: z.string().uuid().optional(),
  vaga_ids: z.array(z.string().uuid()).optional(),
});

export const candidatoUpdateSchema = z.object({
  nome_completo: z.string().min(2).optional(),
  telefone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  cpf: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().max(2).optional(),
  cargo_pretendido: z.string().optional(),
  tempo_experiencia: z.string().optional(),
  turno_disponivel: z.string().optional(),
  pretensao_salarial: z.string().optional().nullable(),
  idade: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(14).max(100).nullable()).optional(),
  formacao_academica: z.string().optional().nullable(),
  resumo_profissional: z.string().optional().nullable(),
  experiencias_profissionais: z.string().optional().nullable(),
});

// ── Vaga ─────────────────────────────────────────────────────────────────────

export const vagaCreateSchema = z.object({
  titulo: z.string().min(2),
  tipo_servico: z.string().min(1),
  num_posicoes: coerceNumber.pipe(z.number().min(1)),
  responsavel: z.string().min(2),
  cliente_id: z.string().uuid().optional().nullable(),
  prazo: z.string().optional().nullable(),
  status: z.enum(["aberta", "fechada", "cancelada"]).optional(),
  cidade: z.string().optional().nullable(),
  estado: z.string().max(2).optional().nullable(),
  salario: z.string().optional().nullable(),
  requisitos: z.string().optional().nullable(),
  beneficios: z.string().optional().nullable(),
  horario: z.string().optional().nullable(),
  habilidades_desejadas: z.array(z.string()).optional(),
  observacoes: z.string().optional().nullable(),
  fee_rs_percentual: coerceNumberNullable,
  fee_rs_prazo_cobranca: z.string().optional().nullable(),
});

export const vagaUpdateSchema = vagaCreateSchema.partial().extend({
  motivo_alteracao: z.string().optional(),
});

// ── Cliente ──────────────────────────────────────────────────────────────────

export const clienteCreateSchema = z.object({
  nome: z.string().min(2),
  contato_nome: z.string().min(1),
  contato_telefone: z.string().min(1),
  contato_email: z.string().email(),
  cidade: z.string().min(1),
  segmento: z.string().min(1),
  servicos: z.array(z.string()).optional(),
  responsavel_comercial: z.string().optional(),
});

export const clienteUpdateSchema = z.object({
  nome: z.string().min(2).optional(),
  contato_nome: z.string().optional(),
  contato_telefone: z.string().optional(),
  contato_email: z.string().email().optional(),
  cidade: z.string().optional(),
  segmento: z.string().optional(),
  servicos: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
  responsavel_comercial: z.string().optional().nullable(),
});

// ── Usuário ──────────────────────────────────────────────────────────────────

export const usuarioCreateSchema = z.object({
  nome_completo: z.string().min(2),
  email: z.string().email(),
  cargo: z.string().optional(),
  departamento: z.string().optional(),
  nivel_acesso: z.enum(["analista", "supervisor", "diretoria"]).optional(),
  senha: z.string().min(8),
  confirmar_senha: z.string().optional(),
});

export const usuarioUpdateSchema = z.object({
  nome_completo: z.string().min(2).optional(),
  cargo: z.string().optional(),
  departamento: z.string().optional(),
  nivel_acesso: z.enum(["analista", "supervisor", "diretoria"]).optional(),
  ativo: z.boolean().optional(),
});

export const resetSenhaSchema = z.object({
  senha: z.string().min(8),
});

// ── Encaminhamento ───────────────────────────────────────────────────────────

export const encaminhamentoCreateSchema = z.object({
  candidato_id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  data_entrevista: z.string().min(1),
  tipo_servico: z.string().optional(),
  observacoes: z.string().optional(),
  vaga_id: z.string().uuid().optional().nullable(),
});

export const encaminhamentoUpdateSchema = z.object({
  status: z.enum(["aguardando", "aprovado", "reprovado", "desistiu"]).optional(),
  observacoes: z.string().optional(),
});

// ── Candidato sub-routes ─────────────────────────────────────────────────────

export const candidatoStatusSchema = z.object({
  action: z.enum(["retornar_banco", "reprovar", "negativar"]),
  motivo: z.string().optional(),
  etapa: z.string().optional(),
});

export const candidatoEmailSchema = z.object({
  template: z.enum([
    "entrevista_salmazos",
    "entrevista_cliente",
    "aprovado_cliente",
    "reprovado",
    "solicitar_documentos",
  ]),
});

export const candidatoResponsavelSchema = z.object({
  responsavel: z.string().min(1),
});

export const candidatoEtapaSchema = z.object({
  etapa_kanban: z.enum([
    "triagem",
    "entrevista_salmazos",
    "entrevista_rh",
    "entrevista_cliente",
    "aprovado_cliente",
    "contratado",
    "reprovado",
    "nao_tem_interesse",
    "nao_compareceu",
    "bloqueado",
  ]),
  comentario: z.string().optional(),
});

export const candidatoAnotacoesSchema = z.object({
  anotacoes: z.string().optional().nullable(),
});

// ── Email ────────────────────────────────────────────────────────────────────

export const emailSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  tipo: z.string().optional(),
  candidato_id: z.string().uuid().optional(),
});

// ── Portal acesso ────────────────────────────────────────────────────────────

export const portalAcessoSchema = z.object({
  cliente_id: z.string().uuid(),
  email: z.string().email(),
  senha: z.string().min(6),
});

// ── SLA ──────────────────────────────────────────────────────────────────────

export const slaConfigUpdateSchema = z.object({
  id: z.string().uuid(),
  prazo_dias_uteis: coerceNumberOptional,
  ativo: z.boolean().optional(),
});

export const slaDestinatarioCreateSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
});

export const slaDestinatarioUpdateSchema = z.object({
  ativo: z.boolean(),
});

// ── Meu perfil ───────────────────────────────────────────────────────────────

export const meuPerfilUpdateSchema = z.object({
  nome_completo: z.string().min(2).optional(),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional().nullable(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().max(2).optional(),
  cep: z.string().optional(),
  contato_emergencia_nome: z.string().optional(),
  contato_emergencia_telefone: z.string().optional(),
});

export const meuPerfilSenhaSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// ── Documentos ───────────────────────────────────────────────────────────────

export const documentoCreateSchema = z.object({
  nome: z.string().min(1),
  categoria: z.string().min(1),
  tipo: z.enum(["salmazos", "cliente"]),
  storage_path: z.string().min(1),
  descricao: z.string().optional(),
  cliente_id: z.string().uuid().optional().nullable(),
  tamanho_bytes: coerceNumberOptional,
  extensao: z.string().optional(),
  uploaded_by: z.string().optional(),
});

// ── Candidatos-Vagas ─────────────────────────────────────────────────────────

export const candidatoVagaCreateSchema = z.object({
  vaga_id: z.string().uuid(),
  candidato_id: z.string().uuid(),
  etapa: z.string().optional(),
  responsavel: z.string().optional(),
});

export const candidatoVagaUpdateSchema = z.object({
  etapa: z.string().optional(),
  observacoes: z.string().optional().nullable(),
  cliente_id: z.string().uuid().optional(),
  data_entrevista_salmazos: z.string().optional().nullable(),
});

export const feeStatusSchema = z.object({
  fee_status: z.enum(["pendente", "cobrado", "recebido"]),
});

// ── KM ───────────────────────────────────────────────────────────────────────

export const kmVisitaCreateSchema = z.object({
  registro_id: z.string().uuid(),
  empresa: z.string().min(1),
  contato: z.string().optional(),
  motivo: z.string().optional(),
  resultado: z.string().optional(),
  ordem: coerceNumberOptional,
});

export const kmRegistroCreateSchema = z.object({
  analista_id: z.string().uuid(),
  data: z.string().min(1),
  km_inicial: coerceNumber.pipe(z.number().min(0)),
  km_final: coerceNumber.pipe(z.number().min(0)),
  destino: z.string().optional(),
  cliente_visitado: z.string().optional(),
  motivo: z.string().optional(),
  resultado: z.string().optional(),
  tipo_servico: z.string().optional(),
  valor_por_km: coerceNumberOptional,
  outros_custos: coerceNumberOptional,
});

export const kmRegistroUpdateSchema = kmRegistroCreateSchema.partial();

export const kmConfigSchema = z.object({
  tipo_servico: z.string().min(1),
  valor_por_km: coerceNumber.pipe(z.number().min(0)),
  analista_id: z.string().uuid().optional().nullable(),
  is_global: z.boolean().optional(),
});

// ── Vaga notificações ────────────────────────────────────────────────────────

export const vagaNotificarEncerramentoSchema = z.object({
  status: z.enum(["fechada", "cancelada"]),
});

// ── Portal ───────────────────────────────────────────────────────────────────

export const portalSolicitarVagaSchema = z.object({
  cargo: z.string().min(1),
  tipo_servico: z.string().min(1),
  cidade: z.string().min(1),
  estado: z.string().max(2),
  num_posicoes: coerceNumberOptional,
  salario: z.string().optional(),
  horario_tipo: z.string().optional(),
  horario_texto: z.string().optional(),
  previsao_inicio: z.string().optional(),
  requisitos: z.string().optional(),
  requisitos_chips: z.array(z.string()).optional(),
  beneficios: z.string().optional(),
  beneficios_chips: z.array(z.string()).optional(),
  observacoes: z.string().optional(),
  horario_padrao: z.string().optional(),
});

export const portalAvaliarSchema = z.object({
  encaminhamento_id: z.string().uuid(),
  status: z.enum(["aprovado", "reprovado"]),
  feedback_cliente: z.string().min(1),
  cv_id: z.string().uuid().optional(),
  tipo_servico: z.string().optional(),
  admissao_data_inicio: z.string().optional(),
  admissao_cargo: z.string().optional(),
  admissao_salario: z.string().optional(),
  admissao_setor: z.string().optional(),
  admissao_centro_custo: z.string().optional(),
  admissao_horario: z.string().optional(),
  admissao_gestor: z.string().optional(),
  admissao_periodo_experiencia: z.string().optional(),
  admissao_observacoes: z.string().optional(),
  admissao_funcao: z.string().optional(),
  admissao_salario_hora: z.string().optional(),
  admissao_turno: z.string().optional(),
  admissao_tempo_contrato: z.string().optional(),
  admissao_vt: z.string().optional(),
  admissao_exame_responsavel: z.string().optional(),
  admissao_local_integracao: z.string().optional(),
  admissao_telefone_candidato: z.string().optional(),
});

// ── From solicitação ─────────────────────────────────────────────────────────

export const fromSolicitacaoSchema = z.object({
  solicitacao_id: z.string().uuid(),
});

// ── Storage paths ────────────────────────────────────────────────────────────

export const storagePathSchema = z.object({
  path: z.string().min(1),
});
