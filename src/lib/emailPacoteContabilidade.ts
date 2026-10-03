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
