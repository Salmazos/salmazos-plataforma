// Documentos que ficaram FORA do pacote da admissão (não deu para incorporar): como a rota informa a tela (cabeçalho da resposta), como a tela lê o último pacote
// gerado (auditoria) e os textos. Sem dependências: usado pelo servidor (gerar-pdf) e pela tela (AdmissaoDetalheClient).

// Cabeçalho da resposta de gerar-pdf (valor em JSON com encodeURIComponent: cabeçalho é ASCII). Só vem quando algum documento ficou de fora; o download do PDF não muda.
export const CABECALHO_NAO_INCORPORADOS = "X-Documentos-Nao-Incorporados";

export interface DocumentoForaDoPacote { rotulo: string; motivo: string }

export const MOTIVO_PDF_PROTEGIDO = "pdf_protegido";

// "CTPS Digital (protegido por senha)". Qualquer outro motivo vira o texto genérico (o detalhe técnico fica na auditoria).
export function descricaoDoMotivo(motivo: string): string {
  if (motivo === MOTIVO_PDF_PROTEGIDO) return "protegido por senha";
  if (motivo === "formato_nao_suportado") return "formato não suportado";
  if (motivo === "download_falhou") return "não foi possível baixar o arquivo";
  if (motivo === "pdf_sem_paginas") return "PDF sem páginas";
  return "não foi possível incorporar";
}

export const descreverDocumentoFora = (d: DocumentoForaDoPacote) => `${d.rotulo} (${descricaoDoMotivo(d.motivo)})`;

export function serializarNaoIncorporados(lista: DocumentoForaDoPacote[]): string {
  return encodeURIComponent(JSON.stringify(lista.map((d) => ({ rotulo: d.rotulo, motivo: d.motivo }))));
}

export function lerNaoIncorporados(valor: string | null | undefined): DocumentoForaDoPacote[] {
  if (!valor) return [];
  try {
    const lista = JSON.parse(decodeURIComponent(valor)) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.filter((d): d is DocumentoForaDoPacote => !!d && typeof d.rotulo === "string" && typeof d.motivo === "string");
  } catch {
    return [];
  }
}

// Do detalhe da auditoria `admissao_pacote_gerado[_forcado]` (a tela abre com o último pacote gerado). Registros antigos só têm os rótulos
// (documentos_nao_incorporados) e os motivos por tipo, sem rótulo: usa os rótulos com o motivo na mesma ordem.
export function naoIncorporadosDaAuditoria(detalhes: unknown): DocumentoForaDoPacote[] {
  const d = (detalhes ?? {}) as { documentos_nao_incorporados?: unknown; motivos_nao_incorporados?: unknown };
  const rotulos = Array.isArray(d.documentos_nao_incorporados) ? (d.documentos_nao_incorporados as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const motivos = Array.isArray(d.motivos_nao_incorporados) ? (d.motivos_nao_incorporados as { rotulo?: unknown; motivo?: unknown }[]) : [];
  return rotulos.map((rotulo, i) => ({ rotulo: typeof motivos[i]?.rotulo === "string" ? (motivos[i].rotulo as string) : rotulo, motivo: typeof motivos[i]?.motivo === "string" ? (motivos[i].motivo as string) : "" }));
}

export const ACOES_PACOTE_GERADO = ["admissao_pacote_gerado", "admissao_pacote_gerado_forcado"];

export function mensagemPacoteSemDocumentos(lista: DocumentoForaDoPacote[]): string {
  return `⚠️ Pacote gerado SEM ${lista.length === 1 ? "1 documento" : `${lista.length} documentos`}: ${lista.map(descreverDocumentoFora).join("; ")}. Baixe o original no painel.`;
}
