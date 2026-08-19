import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { PAPEIS_PAINEL_ADMISSOES } from "@/lib/admissaoAuth";
import { PAPEIS_PAINEL_FUNCIONARIOS } from "@/lib/funcionariosAuth";

// Retrato visual do "acesso por papel, sem exceção" pra cada chave_aba — usado só pra dar
// contexto na matriz de /painel/configuracoes/acesso-customizado (célula "Sem exceção" mostra
// um "Acesso: Sim/Não" por baixo do —). NÃO decide acesso de verdade em nenhum módulo — cada
// um continua controlado pelo seu próprio gate (helper migrado pra podeAcessarAba, ou código
// antigo de papel direto, pros que ainda não migraram).
//
// Pros módulos já migrados pro sistema central (reembolsos_quilometragem, supervisao_postos,
// rh_admissoes, rh_funcionarios, rh_aniversarios, financeiro_rs, faturamento_rs, relatorios,
// dashboard), a regra abaixo É o comportamentoPadrao real que cada helper passa pra
// podeAcessarAba — reaproveita as mesmas constantes (PAPEIS_FULL_ACCESS,
// PAPEIS_PAINEL_ADMISSOES, PAPEIS_PAINEL_FUNCIONARIOS) em vez de reescrever, pra nunca
// divergir do comportamento real.
//
// Pros módulos ainda não migrados, é uma aproximação fiel ao gate de página/API atual
// (levantado direto no código nesta sessão, mesmo escopo do relatório da Fase 1): a maioria
// resolve só por app_metadata.role, então nivel_acesso (o campo disponível aqui, na tela)
// serve como proxy — os dois devem estar sempre em sincronia (é a mesma premissa que a
// própria tela já assume ao exibir nivelAcesso como "o papel" do analista na primeira
// coluna). Se o gate real de algum desses módulos mudar, esta tabela pode ficar
// desatualizada silenciosamente — aceitável aqui porque é só leitura visual, não controla
// acesso.
const SUPERVISOR_ACIMA = ["superuser", "diretoria", "supervisor"];
const SUPERUSER_ONLY = ["superuser"];

type Regra = string[] | "todos";

const REGRA_POR_CHAVE: Record<string, Regra> = {
  // Recrutamento — aberto a qualquer autenticado, sem checagem de papel na página/API.
  recrutamento_banco_candidatos: "todos",
  recrutamento_vagas: "todos",
  recrutamento_agenda: "todos",

  // Comercial
  comercial_clientes: "todos",
  comercial_carteira: SUPERVISOR_ACIMA, // requireSupervisor no SidebarMenu
  comercial_gestao: "todos",

  // RH — rh_admissoes/rh_funcionarios/rh_aniversarios migrados (Fase 2b), regra abaixo É o
  // comportamentoPadrao real. Rescisões não tem checagem própria — herda
  // checarPapelFuncionarios/PAPEIS_PAINEL_FUNCIONARIOS inteiro (ver funcionariosAuth.ts).
  rh_admissoes: PAPEIS_PAINEL_ADMISSOES,
  rh_funcionarios: PAPEIS_PAINEL_FUNCIONARIOS,
  rh_rescisoes: PAPEIS_PAINEL_FUNCIONARIOS,
  rh_aniversarios: "todos",

  // Financeiro — financeiro_rs/faturamento_rs migrados (Fase 2b), regra abaixo É o
  // comportamentoPadrao real (podeAcessarFinanceiroRs/podeAcessarFaturamentoRs).
  financeiro_rs: PAPEIS_FULL_ACCESS,
  faturamento_rs: PAPEIS_FULL_ACCESS,
  // Cobranças R&S tem exceção própria e separada (tabela cobranca_rs_analistas_acesso, fora
  // deste sistema): checarAcessoCobrancaRS = PAPEIS_FULL_ACCESS OU liberação individual
  // nessa outra tabela — mais complexo que só nivel_acesso. Pra esta matriz, mostra só o
  // full access de base (aproximação); a liberação individual continua sendo gerenciada em
  // /painel/cobranca-rs-acesso-config, não aqui.
  cobrancas_rs: PAPEIS_FULL_ACCESS,

  // Configurações — grupo inteiro restrito a superuser (não PAPEIS_FULL_ACCESS/diretoria).
  configuracoes: SUPERUSER_ONLY,
  configuracoes_sla: SUPERUSER_ONLY,
  configuracoes_email_logs: SUPERUSER_ONLY,
  configuracoes_avisos_rescisao: SUPERUSER_ONLY,
  configuracoes_avisos_cobranca_rs: SUPERUSER_ONLY,
  configuracoes_acesso_cobranca_rs: SUPERUSER_ONLY,
  configuracoes_avisos_aso: SUPERUSER_ONLY,
  configuracoes_supervisao: SUPERUSER_ONLY,
  configuracoes_usuarios: SUPERUSER_ONLY,
  configuracoes_audit_logs: SUPERUSER_ONLY,
  configuracoes_carta_conta_salario: SUPERUSER_ONLY,
  configuracoes_acesso_customizado: SUPERUSER_ONLY,

  // Migrados pro sistema central (Fase 2b) — regra abaixo É o comportamentoPadrao real
  // (podeAcessarRelatorios/podeAcessarDashboard).
  relatorios: SUPERVISOR_ACIMA,
  dashboard: PAPEIS_FULL_ACCESS,
  // Migrados pro sistema central (Fase 2b) — mesma regra usada como comportamentoPadrao em
  // resolverAcessoKm (kmAuth.ts) e checarAcessoSupervisao (supervisaoAuth.ts).
  reembolsos_quilometragem: SUPERVISOR_ACIMA,
  supervisao_postos: SUPERVISOR_ACIMA,
  documentos: "todos",
};

export function acessoPadraoPorPapel(chaveAba: string, nivelAcesso: string | null): boolean {
  const regra = REGRA_POR_CHAVE[chaveAba];
  if (regra === undefined) return false;
  if (regra === "todos") return true;
  return regra.includes(nivelAcesso ?? "analista");
}
