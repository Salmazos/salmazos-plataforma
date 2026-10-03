// Helpers puros do e-mail "Pacote para contabilidade" (admissão). Sem imports de propósito: roda no
// servidor, no client e no script de verificação (scripts/verificar-email-pacote-contabilidade.mts).
// Constantes de negócio (tempo de contrato padrão, Cc) vêm de constants.ts e entram por parâmetro.

export const LIMITE_ANEXO_EMAIL_BYTES = 15 * 1024 * 1024;
export const INTERVALO_REENVIO_MS = 10 * 60 * 1000;

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Data pura ("2026-10-03") não passa por Date (new Date() leria como UTC e mostraria o dia anterior em
// Brasília). Timestamp com hora é convertido para o dia de Brasília.
export function formatarDataBR(valor: string | null | undefined): string {
  if (!valor) return "";
  const pura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (pura) return `${pura[3]}/${pura[2]}/${pura[1]}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [a, m, dia] = partes.split("-");
  return `${dia}/${m}/${a}`;
}

export function formatarDataHoraBR(valor: string | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${formatarDataBR(valor)} ${hora}`;
}

// "R$ 9,40 hora" / "R$ 1.800,00 mensal". Formatação manual (sem Intl) para não depender do ICU nem
// do espaço não separável que o Intl coloca depois do "R$".
export function formatarSalario(salario: number | string | null | undefined, tipo: string | null | undefined): string {
  if (salario === null || salario === undefined || salario === "") return "";
  const n = Number(salario);
  if (!Number.isFinite(n)) return "";
  const [inteiro, centavos] = Math.abs(n).toFixed(2).split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${n < 0 ? "-" : ""}${comMilhar},${centavos} ${tipo === "hora" ? "hora" : "mensal"}`;
}

// Bom dia 5h–11h59, Boa tarde 12h–17h59, Boa noite nas demais (hora de Brasília, não a do servidor).
export function saudacaoSaoPaulo(agora: Date = new Date()): string {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(agora));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function montarAssunto(dataInicio: string | null | undefined, nome: string): string {
  const data = formatarDataBR(dataInicio);
  return data ? `Admissão - ${data} - ${nome}` : `Admissão - ${nome}`;
}

export function resolverTempoContrato(valorCliente: string | null | undefined, padrao: string): string {
  const v = (valorCliente ?? "").trim();
  return v || padrao;
}

export interface DadosEmailPacote {
  empresa: string; // "293 - SALMAZOS ..." já montado
  cliente: string;
  dataInicio: string | null;
  nome: string;
  funcao: string | null;
  salario: string; // já formatado por formatarSalario
  horario: string | null;
  telefone: string; // já formatado por exibirTelefone
  tempoContrato: string;
}

export interface LinhaDado {
  rotulo: string;
  valor: string;
  negrito?: boolean;
}

export function montarLinhaEmpresa(codigo: string | null | undefined, razaoSemAcento: string | null | undefined): string {
  const c = (codigo ?? "").trim();
  const r = (razaoSemAcento ?? "").trim();
  if (c && r) return `${c} - ${r}`;
  return c || r;
}

// Linhas vazias são omitidas, exceto "Tempo de Contrato", que nunca fica vazio.
export function montarLinhasDados(d: DadosEmailPacote): LinhaDado[] {
  const linhas: LinhaDado[] = [
    { rotulo: "Empresa", valor: d.empresa },
    { rotulo: "Cliente", valor: d.cliente },
    { rotulo: "Data de início", valor: formatarDataBR(d.dataInicio), negrito: true },
    { rotulo: "Nome", valor: d.nome },
    { rotulo: "Função", valor: d.funcao ?? "" },
    { rotulo: "Salário", valor: d.salario },
    { rotulo: "Horário", valor: d.horario ?? "" },
    { rotulo: "Telefone", valor: d.telefone },
  ].map((l) => ({ ...l, valor: (l.valor ?? "").trim() }));
  const preenchidas = linhas.filter((l) => l.valor !== "");
  preenchidas.push({ rotulo: "Tempo de Contrato", valor: d.tempoContrato.trim() });
  return preenchidas;
}

const INTRO = "Segue abaixo novas informações para admissão:";

// E-mail em estilo texto simples; todo valor passa por escaparHtml.
export function montarHtmlEmail(saudacao: string, linhas: LinhaDado[]): string {
  const corpo = linhas
    .map((l) => {
      const rotulo = escaparHtml(l.rotulo);
      const valor = escaparHtml(l.valor);
      return l.negrito ? `<p style="margin:0 0 6px"><b>${rotulo}: ${valor}</b></p>` : `<p style="margin:0 0 6px">${rotulo}: ${valor}</p>`;
    })
    .join("\n");
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827">`,
    `<p style="margin:0 0 12px">${escaparHtml(saudacao)},</p>`,
    `<p style="margin:0 0 12px">${escaparHtml(INTRO)}</p>`,
    corpo,
    `<p style="margin:16px 0 0">Salmazos RH</p>`,
    `</div>`,
  ].join("\n");
}

export function montarTextoEmail(saudacao: string, linhas: LinhaDado[]): string {
  return [`${saudacao},`, "", INTRO, "", ...linhas.map((l) => `${l.rotulo}: ${l.valor}`), "", "Salmazos RH"].join("\n");
}

// "admissao-<nome em minúsculas, sem acentos, hífens>.pdf"
export function nomeArquivoAnexo(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `admissao-${slug}.pdf` : "admissao-pacote.pdf";
}

// Trava de reenvio: dentro de 10 minutos do último envio só passa com confirmação explícita (reenviar).
export function podeEnviarAgora(ultimoEnvioEm: string | null | undefined, reenviar: boolean, agoraMs: number = Date.now()): boolean {
  if (!ultimoEnvioEm || reenviar) return true;
  const ultimo = Date.parse(ultimoEnvioEm);
  if (Number.isNaN(ultimo)) return true;
  return agoraMs - ultimo >= INTERVALO_REENVIO_MS;
}

export function formatarMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");
}

export interface DestinatarioContabilidadeLinha {
  id?: string;
  email: string;
  copia: boolean;
  ativo: boolean;
}

// Para = ativos com copia=false; Cc = ativos com copia=true. Cc vazio cai no mínimo (último recurso).
export function separarParaCc(linhas: DestinatarioContabilidadeLinha[], ccMinimo: string): { para: string[]; cc: string[]; usouCcMinimo: boolean } {
  const ativos = linhas.filter((l) => l.ativo);
  const para = ativos.filter((l) => !l.copia).map((l) => l.email);
  const cc = ativos.filter((l) => l.copia).map((l) => l.email);
  if (cc.length === 0) return { para, cc: [ccMinimo], usouCcMinimo: true };
  return { para, cc, usouCcMinimo: false };
}

// Trava do último Cc ativo: remover ou desativar este item deixaria a lista de Cc ativos vazia?
export function deixariaSemCcAtivo(linhas: DestinatarioContabilidadeLinha[], id: string): boolean {
  const alvo = linhas.find((l) => l.id === id);
  if (!alvo || !alvo.copia || !alvo.ativo) return false;
  return linhas.filter((l) => l.copia && l.ativo).length <= 1;
}

export const MSG_ULTIMO_CC = "É obrigatório manter pelo menos um e-mail em Cópia (Cc) ativo.";
export const MSG_EMAIL_DUPLICADO = "Este e-mail já está cadastrado em Para ou Cc.";

// SMTP_CONTABILIDADE_SECURE: ignora maiúsculas e espaços; "true"/"1"/"yes" = true, "false"/"0"/"no" = false.
// Ausente ou inválido: true na porta 465 (SSL implícito), false nas demais.
export function interpretarSecureSmtp(valor: string | null | undefined, porta: number): boolean {
  const v = (valor ?? "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return porta === 465;
}

export type TipoErroEmail = "timeout" | "autenticacao" | "outro";

export const MSG_ERRO_EMAIL_TIMEOUT = "Tempo esgotado ao conectar ao servidor de e-mail";
export const MSG_ERRO_EMAIL_AUTH = "Falha de autenticação no servidor de e-mail";
export const MSG_ERRO_EMAIL_OUTRO = "Não foi possível enviar o e-mail";

// Classifica pelo código do erro do nodemailer (nunca pela mensagem, que pode ter dados do servidor).
export function classificarErroEmail(codigo: string | null | undefined): { tipo: TipoErroEmail; mensagem: string } {
  const c = (codigo ?? "").trim().toUpperCase();
  if (c === "ETIMEDOUT" || c === "ECONNECTION" || c === "ESOCKET" || c === "ECONNRESET") return { tipo: "timeout", mensagem: MSG_ERRO_EMAIL_TIMEOUT };
  if (c === "EAUTH") return { tipo: "autenticacao", mensagem: MSG_ERRO_EMAIL_AUTH };
  return { tipo: "outro", mensagem: MSG_ERRO_EMAIL_OUTRO };
}

// Mensagem curta para log: troca segredos por *** e limita o tamanho. Não é garantia de conteúdo
// seguro (o servidor pode devolver texto livre), por isso o log leva só código + trecho curto.
export function mensagemErroCurta(codigo: string | null | undefined, mensagem: string | null | undefined, segredos: (string | undefined)[] = [], max = 200): string {
  let m = (mensagem ?? "").replace(/\s+/g, " ").trim();
  for (const s of segredos) {
    const t = (s ?? "").trim();
    if (t.length >= 3) m = m.split(t).join("***");
  }
  const texto = `${codigo ? `[${codigo}] ` : ""}${m}`.trim();
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

// ── Campos editáveis do e-mail (valem só para o e-mail; nada é gravado no cadastro) ─────────────────
export interface CamposEmailContabilidade {
  nome: string;
  funcao: string;
  salarioValor: number | null;
  salarioTipo: "hora" | "mensal" | null;
  horario: string;
  telefone: string;
  dataInicio: string; // YYYY-MM-DD ou vazio
  tempoContrato: string;
}

export const LIMITES_CAMPOS_EMAIL = { nome: 120, funcao: 120, horario: 200, telefone: 40, tempoContrato: 200 } as const;

// Tira quebras de linha e caracteres de controle (evita injeção de cabeçalho no assunto), colapsa
// espaços repetidos, apara e limita o tamanho.
export function sanitizarCampoEmail(texto: unknown, max: number): string {
  if (texto === null || texto === undefined) return "";
  const limpo = String(texto)
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length > max ? limpo.slice(0, max).trim() : limpo;
}

// Mesma regra de exibirTelefone (utils.ts), copiada aqui para manter este módulo sem imports:
// 11 dígitos = "DD 9XXXX-XXXX", 10 = "DD XXXX-XXXX"; qualquer outra coisa fica como digitada.
export function formatarTelefoneEmail(valor: string): string {
  const d = valor.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

export function dataISOValida(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mes - 1, dia));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// "1.800,00" / "9,40" / "R$ 9,4" => número; vazio => null; inválido => NaN (a validação rejeita).
export function interpretarValorBR(texto: string): number | null {
  const t = texto.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (t === "") return null;
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t)) return NaN;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

// 1800 => "1.800,00"; 9.4 => "9,40".
export function numeroParaBR(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const [inteiro, centavos] = n.toFixed(2).split(".");
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}

// Normaliza (sanitiza e formata) e valida. Devolve sempre os campos normalizados, mesmo com erro.
export function validarCamposEmail(entrada: unknown): { ok: boolean; erros: string[]; camposNormalizados: CamposEmailContabilidade } {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const erros: string[] = [];

  const nome = sanitizarCampoEmail(e.nome, LIMITES_CAMPOS_EMAIL.nome);
  if (!nome) erros.push("Informe o nome.");

  const dataInicio = sanitizarCampoEmail(e.dataInicio, 10);
  if (dataInicio && !dataISOValida(dataInicio)) erros.push("Data de início inválida.");

  let salarioValor: number | null = null;
  let salarioTipo: "hora" | "mensal" | null = null;
  const bruto = e.salarioValor;
  if (bruto !== null && bruto !== undefined && bruto !== "") {
    const n = typeof bruto === "number" ? bruto : typeof bruto === "string" ? Number(bruto) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      erros.push("Salário inválido.");
    } else {
      salarioValor = n;
      if (e.salarioTipo === "hora" || e.salarioTipo === "mensal") salarioTipo = e.salarioTipo;
      else erros.push("Informe se o salário é por hora ou mensal.");
    }
  }

  return {
    ok: erros.length === 0,
    erros,
    camposNormalizados: {
      nome,
      funcao: sanitizarCampoEmail(e.funcao, LIMITES_CAMPOS_EMAIL.funcao),
      salarioValor,
      salarioTipo,
      horario: sanitizarCampoEmail(e.horario, LIMITES_CAMPOS_EMAIL.horario),
      telefone: formatarTelefoneEmail(sanitizarCampoEmail(e.telefone, LIMITES_CAMPOS_EMAIL.telefone)),
      dataInicio: dataISOValida(dataInicio) ? dataInicio : "",
      tempoContrato: sanitizarCampoEmail(e.tempoContrato, LIMITES_CAMPOS_EMAIL.tempoContrato),
    },
  };
}

// Fonte única para servidor e modal: assunto, linhas e avisos saem sempre dos campos normalizados.
export function montarAssuntoDeCampos(c: CamposEmailContabilidade): string {
  return montarAssunto(c.dataInicio, c.nome);
}

export function montarLinhasDeCampos(c: CamposEmailContabilidade, empresa: string, cliente: string, tempoContratoPadrao: string): LinhaDado[] {
  return montarLinhasDados({
    empresa,
    cliente,
    dataInicio: c.dataInicio || null,
    nome: c.nome,
    funcao: c.funcao,
    salario: c.salarioValor === null ? "" : formatarSalario(c.salarioValor, c.salarioTipo),
    horario: c.horario,
    telefone: c.telefone,
    tempoContrato: resolverTempoContrato(c.tempoContrato, tempoContratoPadrao),
  });
}

// Campos que o e-mail omitiria (só aviso, não bloqueia). Calculado sobre os valores já editados.
export function avisosCamposFaltando(c: CamposEmailContabilidade, empresa: string, cliente: string): string[] {
  const avisos: string[] = [];
  if (!c.nome) avisos.push("Nome do candidato não encontrado.");
  if (!c.dataInicio) avisos.push("Data de início não definida.");
  if (!empresa) avisos.push("Empresa (entidade contratante) não definida.");
  if (!cliente) avisos.push("Cliente não encontrado.");
  if (!c.funcao) avisos.push("Função não preenchida.");
  if (c.salarioValor === null) avisos.push("Salário não preenchido.");
  if (!c.horario) avisos.push("Horário não preenchido.");
  if (!c.telefone) avisos.push("Telefone não encontrado.");
  return avisos;
}

export type NomeCampoEmail = "nome" | "funcao" | "salario" | "horario" | "telefone" | "dataInicio" | "tempoContrato";

// Nomes dos campos que mudaram (ambos os lados passam pela mesma normalização antes de comparar).
export function listarCamposEditados(original: unknown, editado: unknown): NomeCampoEmail[] {
  const a = validarCamposEmail(original).camposNormalizados;
  const b = validarCamposEmail(editado).camposNormalizados;
  const mudou: NomeCampoEmail[] = [];
  if (a.nome !== b.nome) mudou.push("nome");
  if (a.funcao !== b.funcao) mudou.push("funcao");
  if (a.salarioValor !== b.salarioValor || (a.salarioValor !== null && a.salarioTipo !== b.salarioTipo)) mudou.push("salario");
  if (a.horario !== b.horario) mudou.push("horario");
  if (a.telefone !== b.telefone) mudou.push("telefone");
  if (a.dataInicio !== b.dataInicio) mudou.push("dataInicio");
  if (a.tempoContrato !== b.tempoContrato) mudou.push("tempoContrato");
  return mudou;
}
