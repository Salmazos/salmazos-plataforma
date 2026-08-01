import type { TipoDocumentoContabilidade } from "./contabilidadeDocumentosMatch";

// Tabela de posições FIXA, calibrada uma única vez contra um caso real assinado (admissão
// da candidata ELIANE CRISTINA PEREIRA, sandbox ZapSign, 2026-08). Substitui a detecção de
// âncora por texto em tempo de execução (ver lib/pdfAnchors.ts) — aquela abordagem se
// mostrou fundamentalmente frágil contra documentos reais: o nome do candidato e da empresa
// aparecem várias vezes no mesmo documento (cabeçalho, corpo de cláusula, campo de dado),
// não só na linha de assinatura, e não existe um sinal de texto confiável o bastante pra
// distinguir "isto é uma linha de assinatura" de "isto é só uma menção" em todos os casos
// (ver investigação na conversa que introduziu este arquivo — 3 padrões diferentes de falso
// positivo encontrados, cada um exigindo uma regra própria, sem convergir).
//
// ASSUNÇÃO DE NEGÓCIO: os 4 documentos obrigatórios da contabilidade (Ficha de Registro,
// Modelo Contrato Temporário, Acordo de HS/Decl. VT, Termo de Consentimento LGPD) têm
// SEMPRE a mesma estrutura de página — mesmo texto, mesmo layout, mesma quantidade de
// páginas — independente do candidato. Isso é plausível porque são gerados por um sistema
// da contabilidade a partir de um template fixo, mas NUNCA foi confirmado com mais de um
// caso real. Se a contabilidade trocar de gerador/modelo de PDF, ou se algum desses tipos
// tiver variações (ex: com/sem dependente), as coordenadas abaixo ficam desatualizadas
// silenciosamente — não há checagem automática de "o texto que eu esperava está mesmo
// aqui". Reversível: se um caso real futuro não bater com essas posições, remedir contra o
// novo caso e atualizar esta tabela — não há fallback automático de recalibração.
//
// Os 3 documentos opcionais (Ficha de IR, Salário Família, Termo de Responsabilidade)
// nunca chegam a consultar esta tabela — são bloqueados antes, no ponto de entrega (ver
// bloqueio de segurança em api/admissoes/[id]/documentos-contabilidade/montar-enviar/
// route.ts), porque sua estrutura de página nunca foi mapeada com um caso real.

export type TipoMarcaPagina = "assinatura" | "rubrica";

export interface CoordenadaRelativa {
  relative_position_left: number;
  relative_position_bottom: number;
}

export interface PosicaoPagina {
  tipo: TipoMarcaPagina;
  // Ausente = essa parte não assina/rubrica esta página específica (ex: Ficha de Registro,
  // só o candidato assina — a empresa não tem nada pra assinar nessa página). Ignorado
  // quando tipo === "rubrica" (rubrica usa sempre RUBRICA_POSICAO_PADRAO pras duas partes,
  // ver lib/pdfAnchors.ts — não duplicar esse valor aqui).
  contratante?: CoordenadaRelativa;
  contratado?: CoordenadaRelativa;
}

// Index do array = página local dentro do ARQUIVO INDIVIDUAL daquele tipo (0-indexed) — não
// a página absoluta no PDF final combinado. Quem soma o offset acumulado pra chegar na
// página absoluta é o chamador (ver montar-enviar/route.ts).
export const POSICOES_POR_TIPO_DOCUMENTO: Partial<Record<TipoDocumentoContabilidade, PosicaoPagina[]>> = {
  ficha_registro: [
    { tipo: "assinatura", contratado: { relative_position_left: 39.0, relative_position_bottom: 19.4 } },
  ],
  modelo_contrato: [
    { tipo: "rubrica" },
    { tipo: "rubrica" },
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 39.94, relative_position_bottom: 61.88 },
      contratado: { relative_position_left: 44.96, relative_position_bottom: 52.13 },
    },
  ],
  acordo_hs_vt: [
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 5.06, relative_position_bottom: 28.8 },
      contratado: { relative_position_left: 5.06, relative_position_bottom: 40.1 },
    },
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 5.1, relative_position_bottom: 19.3 },
      contratado: { relative_position_left: 5.1, relative_position_bottom: 29.0 },
    },
  ],
  termo_lgpd: [
    { tipo: "rubrica" },
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 5.0, relative_position_bottom: 25.04 },
      contratado: { relative_position_left: 50.24, relative_position_bottom: 31.78 },
    },
  ],
};
