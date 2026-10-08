// Regras PURAS da edição de uma indicação direta de candidato pelo próprio cliente (portal).
// Sem imports de servidor: roda igual na rota e em scripts/verificar-indicacao-edicao.mts. "Hoje" e
// tudo que vem do banco entram por parâmetro.

export const CAMPOS_CANDIDATO = ["candidato_nome", "candidato_telefone", "curriculo_url"] as const;

export const CAMPOS_ADMISSAO = [
  "admissao_data_inicio",
  "admissao_salario",
  "admissao_salario_hora",
  "admissao_funcao",
  "admissao_setor",
  "admissao_centro_custo",
  "admissao_horario",
  "admissao_gestor",
  "admissao_periodo_experiencia",
  "admissao_turno",
  "admissao_escala",
  "admissao_tempo_contrato",
  "admissao_vt",
  "admissao_exame_responsavel",
  "admissao_local_integracao",
  "admissao_observacoes",
] as const;

// Ordem de exibição nos avisos: vaga, candidato, depois admissão.
export const CAMPOS_EDITAVEIS = ["vaga_id", ...CAMPOS_CANDIDATO, ...CAMPOS_ADMISSAO] as const;
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

export const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  vaga_id: "Vaga",
  candidato_nome: "Nome do candidato",
  candidato_telefone: "Telefone do candidato",
  curriculo_url: "Currículo",
  admissao_data_inicio: "Data de início",
  admissao_salario: "Salário",
  admissao_salario_hora: "Salário por hora",
  admissao_funcao: "Função",
  admissao_setor: "Setor",
  admissao_centro_custo: "Centro de custo",
  admissao_horario: "Horário",
  admissao_gestor: "Gestor",
  admissao_periodo_experiencia: "Período de experiência",
  admissao_turno: "Turno",
  admissao_escala: "Escala",
  admissao_tempo_contrato: "Tempo de contrato",
  admissao_vt: "Vale transporte",
  admissao_exame_responsavel: "Responsável pelo exame admissional",
  admissao_local_integracao: "Local de integração",
  admissao_observacoes: "Observações",
};

const CAMPOS_NUMERICOS = new Set<string>(["admissao_salario", "admissao_salario_hora"]);
const ORIGEM_INDICACAO = "indicacao_direta_cliente";
const LIMITE_OBSERVACOES = 120;

export type Valor = string | number | boolean | null;
export interface Alteracao {
  campo: CampoEditavel;
  antes: Valor;
  depois: Valor;
}

// ── Normalização e diff ─────────────────────────────────────────────────────────────

// undefined = "campo não enviado" (fica de fora do diff); "" e só-espaços viram null, como a criação
// faz (`valor || null`); número vindo como texto vira número nos campos de salário.
export function normalizarValor(campo: string, valor: unknown): Valor | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const texto = valor.trim();
    if (texto === "") return null;
    if (CAMPOS_NUMERICOS.has(campo)) {
      const n = Number(texto);
      return Number.isFinite(n) ? n : texto;
    }
    return texto;
  }
  return null;
}

// Só os campos presentes em `entrada` entram na comparação; devolve apenas os que mudaram de fato.
export function calcularDiff(atual: Record<string, unknown>, entrada: Record<string, unknown>): Alteracao[] {
  const mudancas: Alteracao[] = [];
  for (const campo of CAMPOS_EDITAVEIS) {
    if (!(campo in entrada)) continue;
    const depois = normalizarValor(campo, entrada[campo]);
    if (depois === undefined) continue;
    const antes = normalizarValor(campo, atual[campo]) ?? null;
    if (antes !== depois) mudancas.push({ campo, antes, depois });
  }
  return mudancas;
}

// ── Data de início ──────────────────────────────────────────────────────────────────

// `hojeISO` (AAAA-MM-DD, Brasília) é calculado pelo CHAMADOR na requisição — nunca no carregamento do módulo.
export function validarDataInicio(data: string, hojeISO: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return "Informe a data de início no formato válido.";
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "A data de início não existe no calendário.";
  if (data < hojeISO) return "A data de início não pode ser anterior a hoje.";
  return null;
}

// ── Quando a indicação pode ser editada ─────────────────────────────────────────────

export interface AdmissaoResumo {
  vaga_id: string | null;
  status: string | null;
}

// Admissão "viva" da indicação: mesmo candidato e mesma vaga (ou vaga nula — a FK é ON DELETE SET NULL,
// então uma admissão sem vaga continua sendo desse candidato). Cancelada libera a edição.
export function temAdmissaoAtiva(admissoes: AdmissaoResumo[], vagaId: string): boolean {
  return admissoes.some((a) => a.status !== "cancelada" && (a.vaga_id === vagaId || a.vaga_id == null));
}

export type MotivoNaoEditavel = "recusada" | "finalizada" | "admissao" | "sem_vinculo";

export interface EntradaPodeEditar {
  status: string;
  vagaId: string;
  // candidatos_vagas.etapa da candidatura criada na aprovação (null = não encontrada).
  etapa: string | null;
  admissoes: AdmissaoResumo[];
}

export function podeEditarIndicacao(e: EntradaPodeEditar): { pode: boolean; motivo?: MotivoNaoEditavel } {
  if (e.status === "pendente") return { pode: true };
  if (e.status !== "aprovada") return { pode: false, motivo: "recusada" };
  if (e.etapa === null) return { pode: false, motivo: "sem_vinculo" };
  if (e.etapa !== "aprovado_cliente") return { pode: false, motivo: "finalizada" };
  if (temAdmissaoAtiva(e.admissoes, e.vagaId)) return { pode: false, motivo: "admissao" };
  return { pode: true };
}

// ── Troca de vaga (só enquanto pendente) ────────────────────────────────────────────

export interface VagaResumo {
  id: string;
  cliente_id: string | null;
  status: string | null;
  tipo_servico: string | null;
  unidade_id: string | null;
}

export function validarVagaNova(atual: VagaResumo, nova: VagaResumo | null, clienteId: string, candidatoJaNaVaga: boolean): string | null {
  if (!nova || nova.cliente_id !== clienteId) return "Vaga não encontrada.";
  if (nova.status !== "aberta") return "Esta vaga não está mais aberta.";
  if (nova.tipo_servico !== atual.tipo_servico) return "A nova vaga precisa ser do mesmo tipo de serviço.";
  if (nova.unidade_id !== atual.unidade_id) return "A nova vaga precisa ser da mesma unidade.";
  if (candidatoJaNaVaga) return "Este candidato já está indicado para essa vaga.";
  return null;
}

// ── Propagação ao cadastro do candidato (indicação aprovada) ────────────────────────

const COLUNA_CANDIDATO: Record<string, string> = {
  candidato_nome: "nome_completo",
  candidato_telefone: "telefone",
  curriculo_url: "curriculo_url",
};

export type MotivoNaoPropagado = "candidato_existente" | "ajustado_pela_salmazos" | "candidato_nao_encontrado";

export interface PlanoPropagacao {
  propagar: { campo: CampoEditavel; coluna: string; anterior: Valor; novo: Valor }[];
  naoPropagados: { campo: CampoEditavel; motivo: MotivoNaoPropagado }[];
}

// Só sobrescreve `candidatos` quando o candidato foi CRIADO por esta indicação (origem própria e nenhuma
// outra solicitação aponta para ele — se apontar, ele foi reaproveitado de outra indicação) E o valor atual
// ainda é o que a solicitação tinha antes da edição (a Salmazos não mexeu). Fora disso, não sobrescreve.
export function planejarPropagacaoCandidato(
  candidato: { origem: string | null; nome_completo: string | null; telefone: string | null; curriculo_url: string | null } | null,
  outraSolicitacaoUsaCandidato: boolean,
  alteracoes: Alteracao[]
): PlanoPropagacao {
  const plano: PlanoPropagacao = { propagar: [], naoPropagados: [] };
  for (const alt of alteracoes) {
    const coluna = COLUNA_CANDIDATO[alt.campo];
    if (!coluna) continue;
    if (!candidato) {
      plano.naoPropagados.push({ campo: alt.campo, motivo: "candidato_nao_encontrado" });
      continue;
    }
    if (candidato.origem !== ORIGEM_INDICACAO || outraSolicitacaoUsaCandidato) {
      plano.naoPropagados.push({ campo: alt.campo, motivo: "candidato_existente" });
      continue;
    }
    const atualNoCandidato = normalizarValor(alt.campo, (candidato as Record<string, unknown>)[coluna]) ?? null;
    if (atualNoCandidato !== alt.antes) {
      plano.naoPropagados.push({ campo: alt.campo, motivo: "ajustado_pela_salmazos" });
      continue;
    }
    plano.propagar.push({ campo: alt.campo, coluna, anterior: alt.antes, novo: alt.depois });
  }
  return plano;
}

export function campoDaAdmissao(campo: string): boolean {
  return (CAMPOS_ADMISSAO as readonly string[]).includes(campo);
}

// ── Máscaras e textos do aviso ──────────────────────────────────────────────────────

export function mascararTelefone(telefone: string | null): string {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length >= 10) return `(${d.slice(0, 2)}) ${"*".repeat(d.length - 6)}-${d.slice(-4)}`;
  if (d.length === 0) return "(vazio)";
  return `${"*".repeat(Math.max(d.length - 4, 0))}${d.slice(-4)}`;
}

export function truncarTexto(texto: string, limite = LIMITE_OBSERVACOES): string {
  const t = texto.trim();
  return t.length > limite ? `${t.slice(0, limite).trimEnd()}…` : t;
}

// Nome gerado pela tela (`${Date.now()}-${aleatório}.${ext}`) no bucket "curriculos": só letras, números, ponto,
// hífen e sublinhado — nada de "/" (outra pasta) nem ".." (subir de pasta). Vale só na EDIÇÃO.
export function nomeArquivoCurriculoValido(nome: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(nome) && !nome.includes("..");
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function formatarValorAviso(campo: CampoEditavel, valor: Valor, lado: "antes" | "depois"): string {
  if (campo === "curriculo_url") {
    if (lado === "depois") return valor ? "novo arquivo anexado" : "(removido)";
    return valor ? "arquivo anexado anteriormente" : "(sem arquivo)";
  }
  if (valor === null || valor === "") return "(vazio)";
  if (campo === "candidato_telefone") return mascararTelefone(String(valor));
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (campo === "admissao_salario") return `${brl(Number(valor))}/mês`;
  if (campo === "admissao_salario_hora") return `${brl(Number(valor))}/hora`;
  if (campo === "admissao_data_inicio") return String(valor).split("-").reverse().join("/");
  if (campo === "admissao_observacoes") return truncarTexto(String(valor));
  return String(valor);
}

export interface LinhaAviso {
  campo: string;
  antes: string;
  depois: string;
}

export function montarLinhasAviso(alteracoes: Alteracao[], titulosVaga?: { antes: string; depois: string }): LinhaAviso[] {
  return alteracoes.map((a) => {
    if (a.campo === "vaga_id") {
      return { campo: ROTULO_CAMPO.vaga_id, antes: titulosVaga?.antes ?? "(vaga anterior)", depois: titulosVaga?.depois ?? "(nova vaga)" };
    }
    return { campo: ROTULO_CAMPO[a.campo], antes: formatarValorAviso(a.campo, a.antes, "antes"), depois: formatarValorAviso(a.campo, a.depois, "depois") };
  });
}

const TEXTO_MOTIVO: Record<MotivoNaoPropagado, string> = {
  candidato_existente: "candidato já cadastrado antes desta indicação",
  ajustado_pela_salmazos: "já ajustado pela Salmazos",
  candidato_nao_encontrado: "cadastro do candidato não encontrado",
};

export function notasDePropagacao(r: { naoPropagados: { campo: CampoEditavel; motivo: MotivoNaoPropagado }[]; falhas: CampoEditavel[]; candidaturaFalhou: boolean; candidaturaBloqueada: boolean }): string[] {
  const notas: string[] = [];
  for (const n of r.naoPropagados) notas.push(`${ROTULO_CAMPO[n.campo]}: não propagado ao cadastro do candidato (${TEXTO_MOTIVO[n.motivo]}).`);
  for (const campo of r.falhas) notas.push(`${ROTULO_CAMPO[campo]}: não foi possível atualizar o cadastro do candidato.`);
  if (r.candidaturaFalhou) notas.push("Não foi possível atualizar os dados de admissão na candidatura; confira no perfil do candidato.");
  if (r.candidaturaBloqueada) notas.push("A candidatura já avançou de etapa; os dados de admissão não foram atualizados nela.");
  return notas;
}

export function textoSino(clienteNome: string, candidatoNome: string, linhas: LinhaAviso[]): string {
  const campos = linhas.map((l) => l.campo);
  const lista = campos.length > 4 ? `${campos.slice(0, 4).join(", ")} e mais ${campos.length - 4}` : campos.join(", ");
  return `${clienteNome} alterou a indicação de ${candidatoNome}: ${lista}`;
}

export function escaparHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function montarHtmlEdicao(o: { clienteNome: string; candidatoNome: string; vagaTitulo: string; linhas: LinhaAviso[]; notas: string[]; link: string }): string {
  const e = escaparHtml;
  const linhas = o.linhas
    .map((l) => `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6">${e(l.campo)}</td><td style="padding:6px 12px;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6">${e(l.antes)}</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${e(l.depois)}</td></tr>`)
    .join("");
  const notas = o.notas.length ? `<div style="margin:16px 0;padding:12px 16px;background:#FEF3C7;border-radius:8px;font-size:13px;color:#92400E">${o.notas.map((n) => `<p style="margin:0 0 4px">${e(n)}</p>`).join("")}</div>` : "";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">✏️ Indicação editada pelo cliente</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151"><strong style="color:#111827">${e(o.clienteNome)}</strong> alterou a indicação de <strong style="color:#111827">${e(o.candidatoNome)}</strong> (vaga ${e(o.vagaTitulo)}).</p>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th align="left" style="padding:6px 12px;font-size:11px;color:#FFB800;text-transform:uppercase">Campo</th><th align="left" style="padding:6px 12px;font-size:11px;color:#FFB800;text-transform:uppercase">Antes</th><th align="left" style="padding:6px 12px;font-size:11px;color:#FFB800;text-transform:uppercase">Depois</th></tr></thead><tbody>${linhas}</tbody></table>
    ${notas}
    <div style="text-align:center;padding-top:24px;border-top:1px solid #f3f4f6;margin-top:20px">
      <a href="${e(o.link)}" style="display:inline-block;padding:12px 28px;background:#000;color:#FFD700;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">Abrir no painel</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;
}
