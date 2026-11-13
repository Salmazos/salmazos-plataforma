// Regras PURAS do ASO demissional (sem imports de servidor): usadas na tela de Rescisões, nas rotas, no cron e no
// script de verificação. ASO é dado de saúde: aqui só há datas, caminhos e contagem de dias, nunca o conteúdo.

// Prazo (dias desde data_desligamento) a partir do qual a falta de ASO vira aviso interno diário.
export const ASO_DEMISSIONAL_PRAZO_DIAS = 10;

// Início do controle do ASO demissional (AAAA-MM-DD): só rescisão com data_desligamento >= esta data entra no aviso
// interno diário do cron (rescisao_aso_pendente). As anteriores seguem com "Pendente · N dias", o filtro "ASO pendente"
// e o botão "Anexar ASO" na tela, mas NÃO geram aviso (decisão do negócio: não alertar sobre o legado sem ASO).
// O aviso ao cliente na 1ª anexação não depende desta data. Ajuste aqui, em um só lugar.
export const ASO_DEMISSIONAL_CONTROLE_INICIO = "2026-11-01";

export const EVENTO_ASO_DEMISSIONAL_CLIENTE = "aso_demissional_anexado_cliente";
export const EVENTO_ASO_PENDENTE = "rescisao_aso_pendente";

export const BUCKET_ASO = "admissao-docs";
const EXTENSOES_ASO = ["pdf", "jpg", "jpeg", "png"];

export function extensaoAsoValida(nomeOuPath: string): boolean {
  const ext = nomeOuPath.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSOES_ASO.includes(ext);
}

// O caminho confirmado pelo cliente precisa ser um que o aso-upload-url gerou PARA ESTE funcionário.
// Sem isso, apontar a rescisão para o arquivo de outro funcionário o exporia no portal.
export function pathAsoDoFuncionario(path: string, funcionarioId: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith(`rescisoes-aso/${funcionarioId}/aso-`) &&
    !path.includes("..") &&
    extensaoAsoValida(path)
  );
}

const MS_DIA = 24 * 60 * 60 * 1000;

// Dias corridos entre a data de desligamento (AAAA-MM-DD) e hoje (AAAA-MM-DD, Brasília). Nunca negativo
// (rescisão programada, com data futura, conta 0).
export function diasDesdeDesligamento(dataDesligamento: string, hojeISO: string): number {
  const a = Date.parse(`${dataDesligamento}T00:00:00Z`);
  const b = Date.parse(`${hojeISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / MS_DIA));
}

export function asoDemissionalPendente(r: { aso_documento_path: string | null }): boolean {
  return !r.aso_documento_path;
}

export function pendenteAlemDoPrazo(
  r: { aso_documento_path: string | null; data_desligamento: string },
  hojeISO: string
): boolean {
  return asoDemissionalPendente(r) && diasDesdeDesligamento(r.data_desligamento, hojeISO) >= ASO_DEMISSIONAL_PRAZO_DIAS;
}

// Entra no aviso interno do cron: sem ASO, dentro do controle (desligada a partir do início) e com o prazo vencido.
export function entraNoAvisoInterno(
  r: { aso_documento_path: string | null; data_desligamento: string },
  hojeISO: string
): boolean {
  return r.data_desligamento >= ASO_DEMISSIONAL_CONTROLE_INICIO && pendenteAlemDoPrazo(r, hojeISO);
}
