import type { TipoEnquadramento } from "./admissaoDocumentos";

export interface ConfigEnquadramento {
  // Proporção largura:altura — CapturaComEnquadramento usa isso direto em CSS
  // aspect-ratio, então a unidade não importa (mm, cm, "unidades" — só a razão).
  proporcaoLargura: number;
  proporcaoAltura: number;
  orientacao: "paisagem" | "retrato";
  instrucaoPadrao: string;
}

// ID-1 (85,6 x 54 mm) — RG, CNH, cartão SUS/PIS.
// Retrato 3:4 — foto de rosto (foto 3x4).
// "Folha" — aproximado de propósito (nem todo documento desta categoria é A4 de
// verdade — título de eleitor e caderneta de vacinação, por exemplo — mas uma moldura
// retrato genérica ainda ajuda mais do que nenhuma orientação).
export const ENQUADRAMENTO_CONFIG: Record<TipoEnquadramento, ConfigEnquadramento> = {
  cartao: {
    proporcaoLargura: 85.6,
    proporcaoAltura: 54,
    orientacao: "paisagem",
    instrucaoPadrao: "Encaixe o documento dentro da moldura",
  },
  retrato_3x4: {
    proporcaoLargura: 3,
    proporcaoAltura: 4,
    orientacao: "retrato",
    instrucaoPadrao: "Centralize seu rosto dentro da moldura",
  },
  folha: {
    proporcaoLargura: 1,
    proporcaoAltura: 1.414,
    orientacao: "retrato",
    instrucaoPadrao: "Encaixe o documento inteiro dentro da moldura",
  },
};
