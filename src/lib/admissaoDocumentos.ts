export type CondicionalDocumento = "masculino" | "motorista" | "dependente";

export interface DocumentoAdmissaoDef {
  tipo_documento: string;
  label: string;
  obrigatorio: boolean;
  condicional: CondicionalDocumento | null;
}

export const DOCUMENTOS_ADMISSAO: DocumentoAdmissaoDef[] = [
  { tipo_documento: "ctps_todas_paginas", label: "Carteira de Trabalho Digital (todas as páginas)", obrigatorio: true, condicional: null },
  { tipo_documento: "foto_3x4", label: "Foto 3x4", obrigatorio: true, condicional: null },
  { tipo_documento: "cpf", label: "CPF/CIC (2 cópias)", obrigatorio: true, condicional: null },
  { tipo_documento: "titulo_eleitor", label: "Título de Eleitor", obrigatorio: true, condicional: null },
  { tipo_documento: "cartao_sus", label: "Cartão do SUS", obrigatorio: true, condicional: null },
  { tipo_documento: "rg", label: "Identidade RG (2 cópias)", obrigatorio: true, condicional: null },
  { tipo_documento: "reservista", label: "Reservista", obrigatorio: true, condicional: "masculino" },
  { tipo_documento: "certidao_civil", label: "Certidão de Nascimento/Casamento/União Estável", obrigatorio: true, condicional: null },
  { tipo_documento: "comprovante_escolaridade", label: "Comprovante de Escolaridade", obrigatorio: true, condicional: null },
  { tipo_documento: "pis_pasep", label: "Cartão PIS/PASEP", obrigatorio: true, condicional: null },
  { tipo_documento: "comprovante_endereco", label: "Comprovante de Endereço (2 cópias)", obrigatorio: true, condicional: null },
  { tipo_documento: "cnh", label: "Carteira de Habilitação", obrigatorio: false, condicional: "motorista" },
  { tipo_documento: "certidao_nascimento_filho", label: "Certidão de Nascimento do(s) filho(s)", obrigatorio: false, condicional: "dependente" },
  { tipo_documento: "cpf_dependentes", label: "CPF dos dependentes", obrigatorio: false, condicional: "dependente" },
  { tipo_documento: "caderneta_vacinacao", label: "Caderneta de Vacinação (filhos < 7 anos)", obrigatorio: false, condicional: "dependente" },
  { tipo_documento: "frequencia_escolar", label: "Comprovante de Frequência Escolar (filhos > 7 anos)", obrigatorio: false, condicional: "dependente" },
];
