// Parser do export do EzePoint (.xlsx) — uma aba por funcionário. Reverso de engenharia
// feito contra arquivos reais (não há documentação do fornecedor): ver conversa com o Olver
// (set/2026) e a validação cruzada rodada com openpyxl direto nos arquivos que ele subiu.
//
// Formato de cada aba (linhas 1-indexed no arquivo real):
//  - Bloco de cabeçalho (antes da linha "Data"): pares rótulo:valor, um por linha, na coluna
//    A/B — "Empresa:" (nome do relógio de ponto, NÃO confiável como cliente — ver
//    pontoAuth.ts/rota de import), "Nome:", "Cargo:", "Setor:", "Matrícula:", "C.T.P.S:",
//    "Data de Admissão:", "Período:" ("dd/mm/aaaa a dd/mm/aaaa"). A linha 1 também carrega,
//    mais à direita, rótulos soltos de um template antigo ("Dia", "Entrada 1", "Saída 1"...)
//    que nunca têm valor de verdade — o parser genérico (só rótulos terminados em ":") os
//    ignora sozinho.
//  - Linha "Data": "Data", "Ponto 1".."Ponto N" (N varia por funcionário, 1 a 4+ visto),
//    depois exatamente 2 colunas em branco, depois campos calculados em ordem fixa: CH, HN,
//    HT, EX, EN, AT, FA, AE, AN, EX1.
//  - Uma linha por dia do período: coluna A = "<letra opcional><espaços><dd/mm/aaaa> -
//    <Dia da semana>". A letra (D/F/branco) reflete só se há escala configurada nesse dia,
//    NUNCA se o dia teve algo fora do padrão — por isso é ignorada aqui (ver
//    pontoAnomalia.ts). A primeira das 2 colunas em branco do cabeçalho carrega, nas linhas
//    de dia, uma observação textual quando existe ("NÃO ADMITIDO", "Folga", "Atestado
//    Médico", "Atestado de horas", "Falta", etc.) — a segunda fica sempre vazia.
//  - Bloco de rodapé (depois do último dia): várias linhas com múltiplos pares rótulo:valor
//    cada (ex: "Hora Trabalhada Diurna (HT): 129:39" e "EX 1 a 50 %: 00:00" na mesma linha) —
//    parseado genericamente, sem posição fixa de coluna.

import * as XLSX from "xlsx";
import { classificarDia, type TipoOcorrenciaPonto } from "@/lib/pontoAnomalia";

const CAMPOS_ORDEM = ["CH", "HN", "HT", "EX", "EN", "AT", "FA", "AE", "AN", "EX1"];

export interface DiaImportado {
  data: string; // ISO (yyyy-mm-dd)
  diaSemana: string;
  marcacoes: string[];
  notaOriginal: string | null;
  campos: Record<string, string>;
  foraPadrao: boolean;
  tipoOcorrencia: TipoOcorrenciaPonto | null;
}

export interface FuncionarioImportado {
  nomePlanilha: string;
  ezepointCodigo: string | null;
  cargo: string | null;
  dataAdmissao: string | null; // ISO
  totais: Record<string, string>;
  dias: DiaImportado[];
}

export interface FechamentoImportado {
  periodoInicio: string | null;
  periodoFim: string | null;
  funcionarios: FuncionarioImportado[];
  abasIgnoradas: string[];
}

function celula(row: unknown[] | undefined, i: number): string {
  const v = row?.[i];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

// dd/mm/aaaa -> aaaa-mm-dd. Retorna null se o texto não bater no formato esperado (nunca
// assume — uma data em formato inesperado vira aba/campo ignorado, não um chute silencioso.
function paraIso(dataBr: string): string | null {
  const m = dataBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Varre uma linha inteira procurando células terminadas em ":" e usa a célula seguinte como
// valor — genérico de propósito, porque o rodapé empacota vários pares na mesma linha em
// posições de coluna que variam conforme quantos pares aquela linha específica tem.
function paresLabelValor(row: unknown[]): Array<[string, string]> {
  const pares: Array<[string, string]> = [];
  for (let i = 0; i < row.length; i++) {
    const cel = celula(row, i);
    if (cel.endsWith(":")) {
      const rotulo = cel.slice(0, -1).trim();
      if (rotulo) pares.push([rotulo, celula(row, i + 1)]);
    }
  }
  return pares;
}

// "Hora Trabalhada Diurna (HT)" -> "HT". Sem parênteses (ex: "EX 1 a 50 %"), usa o próprio
// rótulo como chave — o objeto `totais` é só snapshot de exibição, não precisa de uma sigla
// canônica pra todo campo que o EzePoint decidir imprimir no rodapé.
function siglaDoRotulo(rotulo: string): string {
  const m = rotulo.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : rotulo;
}

const DIA_REGEX = /^[A-Za-z]?\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(.*)$/;
const PONTO_COL_REGEX = /^Ponto\s+\d+$/i;
const HORA_REGEX = /^\d{1,2}:\d{2}$/;

interface AbaExtraida {
  funcionario: FuncionarioImportado;
  periodoInicio: string | null;
  periodoFim: string | null;
}

function extrairAbaFuncionario(nomeAba: string, rows: unknown[][]): AbaExtraida | null {
  const headerRowIndex = rows.findIndex((r) => celula(r, 0) === "Data");
  if (headerRowIndex === -1) return null;

  const headerRow = rows[headerRowIndex];
  let numPontoCols = 0;
  while (PONTO_COL_REGEX.test(celula(headerRow, 1 + numPontoCols))) numPontoCols++;
  if (numPontoCols === 0) return null;

  const camposStartIdx = 1 + numPontoCols + 2;

  // Cabeçalho (rótulo:valor) fica em qualquer linha antes da linha "Data" — junta tudo num
  // mapa único em vez de assumir posição fixa de linha, já que o bloco varia de tamanho
  // (algumas abas têm "Cargo"/"Setor" vazios, mas as linhas continuam presentes).
  const headerMap = new Map<string, string>();
  for (let i = 0; i < headerRowIndex; i++) {
    for (const [rotulo, valor] of paresLabelValor(rows[i])) {
      if (!headerMap.has(rotulo)) headerMap.set(rotulo, valor);
    }
  }

  const [periodoIniBr, periodoFimBr] = (headerMap.get("Período") ?? "").split(/\s+a\s+/);

  const dias: DiaImportado[] = [];
  let fimDiasIdx = rows.length;
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const m = DIA_REGEX.exec(celula(row, 0));
    if (!m) {
      fimDiasIdx = i;
      break;
    }

    const data = paraIso(m[1]);
    if (!data) continue; // data em formato inesperado — pula o dia em vez de gravar lixo

    const marcacoes: string[] = [];
    for (let j = 0; j < numPontoCols; j++) {
      const v = celula(row, 1 + j);
      if (HORA_REGEX.test(v)) marcacoes.push(v);
    }
    const notaOriginal = celula(row, 1 + numPontoCols) || null;

    const campos: Record<string, string> = {};
    CAMPOS_ORDEM.forEach((sigla, idx) => {
      campos[sigla] = celula(row, camposStartIdx + idx);
    });

    const { foraPadrao, tipoOcorrencia } = classificarDia({
      notaOriginal,
      campos,
      numeroMarcacoes: marcacoes.length,
    });

    dias.push({ data, diaSemana: m[2].trim(), marcacoes, notaOriginal, campos, foraPadrao, tipoOcorrencia });
  }

  // Rodapé: tudo depois do último dia reconhecido, pares rótulo:valor genéricos.
  const totais: Record<string, string> = {};
  for (let i = fimDiasIdx; i < rows.length; i++) {
    for (const [rotulo, valor] of paresLabelValor(rows[i])) {
      totais[siglaDoRotulo(rotulo)] = valor;
    }
  }

  // Número final do nome da aba (ex: "Gustavo H. D. S. G. - 7334" -> "7334") — mais estável
  // que nome pra reconhecer o mesmo funcionário numa reimportação futura.
  const codigoMatch = nomeAba.match(/-\s*(\d+)\s*$/);

  return {
    funcionario: {
      nomePlanilha: headerMap.get("Nome") || nomeAba,
      ezepointCodigo: codigoMatch ? codigoMatch[1] : null,
      cargo: headerMap.get("Cargo") || null,
      dataAdmissao: paraIso(headerMap.get("Data de Admissão") ?? ""),
      totais,
      dias,
    },
    periodoInicio: paraIso(periodoIniBr ?? ""),
    periodoFim: paraIso(periodoFimBr ?? ""),
  };
}

export function parseFechamentoXlsx(buffer: Buffer): FechamentoImportado {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const funcionarios: FuncionarioImportado[] = [];
  const abasIgnoradas: string[] = [];
  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;

  for (const nomeAba of workbook.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, defval: "" });
    const extraido = extrairAbaFuncionario(nomeAba, rows);
    if (!extraido) {
      abasIgnoradas.push(nomeAba);
      continue;
    }
    funcionarios.push(extraido.funcionario);
    if (!periodoInicio && extraido.periodoInicio) periodoInicio = extraido.periodoInicio;
    if (!periodoFim && extraido.periodoFim) periodoFim = extraido.periodoFim;
  }

  return { periodoInicio, periodoFim, funcionarios, abasIgnoradas };
}
