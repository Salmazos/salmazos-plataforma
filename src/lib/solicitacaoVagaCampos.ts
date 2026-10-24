// Campos compartilhados da solicitação de vaga: FONTE ÚNICA das listas (estados, tipos de horário, chips de requisitos e de benefícios,
// condições de escolaridade), importada pelo formulário do portal (portal/solicitar-vaga/page.tsx) e pelo link público. Acrescentar ou
// remover um chip aqui vale para os dois. Os geradores de texto do portal continuam como closures dentro da página dele; aqui ficam
// versões PURAS (recebem os valores por parâmetro) que scripts/verificar-solicitacao-link.mts compara, em teste, com as do portal.
// Sem imports, para rodar nesse script.

export const ESTADOS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const HORARIO_TIPOS = [
  { id: "seg_sex", label: "Segunda a Sexta" },
  { id: "6x1", label: "Escala 6x1" },
  { id: "6x2", label: "Escala 6x2" },
  { id: "12x36", label: "Escala 12x36" },
  { id: "turno_fixo", label: "Turno Fixo" },
  { id: "a_combinar", label: "A combinar" },
  { id: "personalizado", label: "Personalizado" },
] as const;
export type HorarioTipo = (typeof HORARIO_TIPOS)[number]["id"];

export const INTERVALOS = [
  { id: "sem intervalo", label: "Sem intervalo" },
  { id: "15min", label: "15 minutos" },
  { id: "30min", label: "30 minutos" },
  { id: "45min", label: "45 minutos" },
  { id: "1h", label: "1 hora" },
  { id: "1h15", label: "1h15" },
  { id: "1h30", label: "1h30" },
  { id: "personalizado", label: "Personalizado" },
] as const;

export const REQ_ESCOLARIDADE = ["Ensino Fundamental", "Ensino Médio", "Ensino Técnico", "Ensino Superior"];
export const REQ_COM_CURSO = new Set(["Ensino Técnico", "Ensino Superior"]);
export const REQ_COM_CONDICAO_SIMPLES = new Set(["Ensino Fundamental", "Ensino Médio"]);
export const REQ_EXPERIENCIA = ["Experiência na função", "Experiência em atendimento ao público", "Experiência em liderança/gestão", "Experiência em vendas"];
export const REQ_CNH = ["CNH B", "CNH C", "CNH D", "CNH E"];
export const REQ_NR = ["NR-6", "NR-10", "NR-11", "NR-12", "NR-35"];
export const REQ_CONHECIMENTOS = ["Pacote Office", "Informática básica", "Excel avançado"];
export const CONDICOES_TECNICO = ["Completo", "Cursando", "Completo ou Cursando"];
export const CONDICOES_SUPERIOR = ["Completo", "Cursando", "Completo ou Cursando", "A partir do 6º semestre", "A partir do 3º semestre"];
export const CONDICOES_SIMPLES = ["Completo", "Cursando"];

export const BEN_TRANSPORTE = ["Vale Transporte", "Fretado", "Auxílio Combustível", "Estacionamento"];
export const BEN_ALIMENTACAO = ["Vale Alimentação", "Vale Refeição", "Refeição no Local", "Cesta Básica"];
export const BEN_SAUDE = ["Convênio Médico", "Convênio Odontológico", "Convênio Farmácia", "Seguro de Vida"];
export const BEN_QUALIDADE = ["Gympass / Totalpass", "Day Off", "PLR", "Bonificação Anual"];

export const CATEGORIAS_HABILITACAO = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"] as const;

// ── Horário ──────────────────────────────────────────────────────────────────

export interface HorarioForm {
  tipo: HorarioTipo | "";
  entrada: string;
  saida: string;
  intervalo: string;
  intervaloInicio: string;
  intervaloFim: string;
  diurnoNoturno: "diurno" | "noturno";
  turnoNome: string;
  custom: string;
}

export const HORARIO_VAZIO: HorarioForm = {
  tipo: "", entrada: "", saida: "", intervalo: "", intervaloInicio: "", intervaloFim: "", diurnoNoturno: "diurno", turnoNome: "", custom: "",
};

function fmtHora(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return `${h}h${m}`;
}

function sufixoIntervalo(h: HorarioForm): string {
  if (h.intervalo === "personalizado") {
    if (!h.intervaloInicio || !h.intervaloFim) return "";
    return `intervalo de ${fmtHora(h.intervaloInicio)} às ${fmtHora(h.intervaloFim)}`;
  }
  if (!h.intervalo) return "";
  if (h.intervalo === "sem intervalo") return "sem intervalo";
  return `intervalo de ${h.intervalo}`;
}

export function gerarHorarioTexto(h: HorarioForm): string {
  if (!h.tipo) return "";
  if (h.tipo === "a_combinar") return "A combinar";
  if (h.tipo === "personalizado") return h.custom.trim();
  const horas = `${fmtHora(h.entrada)} às ${fmtHora(h.saida)}`;
  const intervalo = sufixoIntervalo(h);
  const comIntervalo = (base: string) => (intervalo ? `${base} (${intervalo})` : base);
  if (h.tipo === "seg_sex") return comIntervalo(`Segunda a Sexta, ${horas}`);
  if (h.tipo === "6x1") return comIntervalo(`Escala 6x1, ${horas}`);
  if (h.tipo === "6x2") return comIntervalo(`Escala 6x2, ${horas}`);
  if (h.tipo === "12x36") {
    const rotulo = h.diurnoNoturno === "diurno" ? "Turno Diurno" : "Turno Noturno";
    const base = h.entrada || h.saida ? `Escala 12x36 — ${rotulo}, ${horas}` : `Escala 12x36 — ${rotulo}`;
    return comIntervalo(base);
  }
  return comIntervalo(`${h.turnoNome.trim() || "Turno Fixo"}, ${horas}`);
}

// ── Requisitos e benefícios ──────────────────────────────────────────────────

export interface RequisitosSel {
  chips: Record<string, boolean>;
  cursos: Record<string, string>;
  condicoes: Record<string, string>;
  custom: string[];
}
export const REQUISITOS_VAZIO: RequisitosSel = { chips: {}, cursos: {}, condicoes: {}, custom: [] };

export function listarRequisitos(sel: RequisitosSel): string[] {
  const itens: string[] = [];
  for (const chip of [...REQ_ESCOLARIDADE, ...REQ_EXPERIENCIA, ...REQ_CNH, ...REQ_NR, ...REQ_CONHECIMENTOS]) {
    if (!sel.chips[chip]) continue;
    const curso = sel.cursos[chip]?.trim();
    const condicao = sel.condicoes[chip]?.trim();
    let texto = chip;
    if (curso) texto += ` em ${curso}`;
    if (condicao) texto += ` — ${condicao}`;
    itens.push(texto);
  }
  itens.push(...sel.custom);
  return itens;
}

export function gerarRequisitosTexto(sel: RequisitosSel): string {
  return listarRequisitos(sel).map((i) => `• ${i}`).join("\n");
}

export interface BeneficiosSel {
  chips: Record<string, boolean>;
  custom: string[];
}
export const BENEFICIOS_VAZIO: BeneficiosSel = { chips: {}, custom: [] };

export function listarBeneficios(sel: BeneficiosSel): string[] {
  const itens: string[] = [];
  for (const chip of [...BEN_TRANSPORTE, ...BEN_ALIMENTACAO, ...BEN_SAUDE, ...BEN_QUALIDADE]) {
    if (sel.chips[chip]) itens.push(chip);
  }
  itens.push(...sel.custom);
  return itens;
}

export function gerarBeneficiosTexto(sel: BeneficiosSel): string {
  return listarBeneficios(sel).map((i) => `• ${i}`).join("\n");
}

export function gerarBeneficiosChips(sel: BeneficiosSel): Record<string, boolean> {
  const resultado: Record<string, boolean> = {};
  for (const item of listarBeneficios(sel)) resultado[item] = true;
  return resultado;
}

// ── O que vira público na vaga ───────────────────────────────────────────────

export interface PerfilExtra {
  sexo?: string | null;
  idade?: string | null;
  pcd?: string | null;
  habilitacao_categoria?: string | null;
  veiculo_proprio?: string | null;
  local_trabalho?: string | null;
}

// Já existe uma linha de habilitação no texto dos requisitos? (chip "CNH B/C/D/E" ou "Habilitação categoria X"): então a categoria
// do perfil não é acrescentada de novo.
function temLinhaDeHabilitacao(texto: string): boolean {
  return texto.split("\n").some((linha) => /(^|[^A-Za-z])CNH(?![A-Za-z])/i.test(linha) || /habilita[cç][aã]o\s+categoria/i.test(linha));
}

// Requisitos que a vaga publicada recebe quando a solicitação veio do link público: o texto do cliente mais, SÓ se ligados à
// função, a habilitação e o veículo próprio. Sexo e idade (uso interno) NUNCA entram, e PCD não vira requisito.
export function requisitosPublicaveis(requisitos: string | null | undefined, perfil: PerfilExtra | null | undefined): string | null {
  const linhas: string[] = [];
  const base = requisitos?.trim();
  if (base) linhas.push(base);
  const categoria = perfil?.habilitacao_categoria?.trim();
  if (categoria && !temLinhaDeHabilitacao(base ?? "")) linhas.push(`• Habilitação categoria ${categoria}`);
  if (perfil?.veiculo_proprio === "sim") {
    const item = "• Veículo próprio";
    if (!linhas.join("\n").includes(item)) linhas.push(item);
  }
  return linhas.length > 0 ? linhas.join("\n") : null;
}
