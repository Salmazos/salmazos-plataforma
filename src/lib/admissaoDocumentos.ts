export type CondicionalDocumento = "masculino" | "motorista" | "dependente";

// Tipo de moldura de captura guiada no formulário público (ver
// components/admissao/CapturaComEnquadramento.tsx e lib/enquadramentoConfig.ts):
//   - "cartao": documento tipo cartão (RG, CNH, cartão SUS/PIS) — ID-1, paisagem.
//   - "retrato_3x4": foto de rosto (foto 3x4) — retrato.
//   - "folha": documento tipo folha/página — retrato, aproximado (nem todo documento
//     desta categoria é A4 de verdade — ver título de eleitor/caderneta de vacinação).
//   - undefined: sem moldura — upload de arquivo livre (ex.: ctps_todas_paginas, que
//     precisa de várias páginas e não cabe numa captura de quadro único).
export type TipoEnquadramento = "cartao" | "retrato_3x4" | "folha";

export interface DocumentoAdmissaoDef {
  tipo_documento: string;
  label: string;
  obrigatorio: boolean;
  condicional: CondicionalDocumento | null;
  // Documento extra opcional, disponível só na aba Documentos do painel interno (upload
  // feito pela equipe em nome do candidato) — nunca aparece no formulário público, e não
  // é pré-criado na criação da admissão como os demais tipos: só passa a existir quando o
  // RH explicitamente decide usar essa opção (ver AdmissaoDetalheClient). Hoje nenhum tipo
  // usa mais isso (rg_verso e cnh_verso viraram campos normais do formulário público),
  // mas o mecanismo continua disponível pra um caso futuro que precise dele.
  apenasPainel?: boolean;
  enquadramento?: TipoEnquadramento;
  // Aceita vários arquivos no mesmo slot (um PDF único OU várias imagens) — desacoplado
  // de `condicional === "dependente"` porque nem todo tipo multi-arquivo é condicional a
  // dependente (ex.: ctps_todas_paginas, que qualquer candidato pode ter em PDF único ou
  // várias fotos de página, e nunca teve moldura de câmera por isso mesmo).
  multiArquivo?: boolean;
}

export const DOCUMENTOS_ADMISSAO: DocumentoAdmissaoDef[] = [
  { tipo_documento: "ctps_todas_paginas", label: "Carteira de Trabalho Digital (todas as páginas)", obrigatorio: true, condicional: null, multiArquivo: true },
  { tipo_documento: "cpf", label: "CPF/CIC", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "titulo_eleitor", label: "Título de Eleitor", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "cartao_sus", label: "Cartão do SUS", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "rg", label: "Identidade RG (frente)", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "rg_verso", label: "Identidade RG (verso)", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "reservista", label: "Reservista", obrigatorio: false, condicional: "masculino", enquadramento: "folha" },
  { tipo_documento: "certidao_civil", label: "Certidão de Nascimento/Casamento/União Estável", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "comprovante_escolaridade", label: "Comprovante de Escolaridade", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "pis_pasep", label: "Cartão PIS/PASEP", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "comprovante_endereco", label: "Comprovante de Endereço", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "cnh", label: "Carteira de Habilitação (frente)", obrigatorio: true, condicional: "motorista", enquadramento: "cartao" },
  { tipo_documento: "cnh_verso", label: "Carteira de Habilitação (verso)", obrigatorio: true, condicional: "motorista", enquadramento: "cartao" },
  { tipo_documento: "certidao_nascimento_filho", label: "Certidão de Nascimento do(s) filho(s)", obrigatorio: false, condicional: "dependente", enquadramento: "folha", multiArquivo: true },
  { tipo_documento: "cpf_dependentes", label: "CPF dos dependentes", obrigatorio: false, condicional: "dependente", enquadramento: "folha", multiArquivo: true },
  { tipo_documento: "caderneta_vacinacao", label: "Caderneta de Vacinação (filhos < 7 anos)", obrigatorio: false, condicional: "dependente", enquadramento: "folha", multiArquivo: true },
  { tipo_documento: "frequencia_escolar", label: "Comprovante de Frequência Escolar (filhos > 7 anos)", obrigatorio: false, condicional: "dependente", enquadramento: "folha", multiArquivo: true },
  // Por último de propósito — candidato no desktop só chega na foto (que exige câmera/QR
  // pro celular, ver PassoUploadDocumentos) depois de já ter enviado os demais documentos
  // via seletor de arquivo comum, em vez de esbarrar nela logo de cara.
  { tipo_documento: "foto_3x4", label: "Foto 3x4", obrigatorio: true, condicional: null, enquadramento: "retrato_3x4" },
];
