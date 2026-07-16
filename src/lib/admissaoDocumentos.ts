export type CondicionalDocumento = "masculino" | "motorista" | "dependente";

export interface DocumentoAdmissaoDef {
  tipo_documento: string;
  label: string;
  obrigatorio: boolean;
  condicional: CondicionalDocumento | null;
  // Documento extra opcional, disponível só na aba Documentos do painel interno (upload
  // feito pela equipe em nome do candidato) — nunca aparece no formulário público, e não
  // é pré-criado na criação da admissão como os demais tipos: só passa a existir quando o
  // RH explicitamente decide usar essa opção (ver AdmissaoDetalheClient, "+ Adicionar
  // verso do RG"). Mantém o RG do candidato como documento único por padrão.
  apenasPainel?: boolean;
}

export const DOCUMENTOS_ADMISSAO: DocumentoAdmissaoDef[] = [
  { tipo_documento: "ctps_todas_paginas", label: "Carteira de Trabalho Digital (todas as páginas)", obrigatorio: true, condicional: null },
  { tipo_documento: "foto_3x4", label: "Foto 3x4", obrigatorio: true, condicional: null },
  { tipo_documento: "cpf", label: "CPF/CIC", obrigatorio: true, condicional: null },
  { tipo_documento: "titulo_eleitor", label: "Título de Eleitor", obrigatorio: true, condicional: null },
  { tipo_documento: "cartao_sus", label: "Cartão do SUS", obrigatorio: true, condicional: null },
  { tipo_documento: "rg", label: "Identidade RG", obrigatorio: true, condicional: null },
  { tipo_documento: "rg_verso", label: "RG (verso)", obrigatorio: false, condicional: null, apenasPainel: true },
  { tipo_documento: "reservista", label: "Reservista", obrigatorio: false, condicional: "masculino" },
  { tipo_documento: "certidao_civil", label: "Certidão de Nascimento/Casamento/União Estável", obrigatorio: true, condicional: null },
  { tipo_documento: "comprovante_escolaridade", label: "Comprovante de Escolaridade", obrigatorio: true, condicional: null },
  { tipo_documento: "pis_pasep", label: "Cartão PIS/PASEP", obrigatorio: true, condicional: null },
  { tipo_documento: "comprovante_endereco", label: "Comprovante de Endereço", obrigatorio: true, condicional: null },
  { tipo_documento: "cnh", label: "Carteira de Habilitação", obrigatorio: false, condicional: "motorista" },
  { tipo_documento: "certidao_nascimento_filho", label: "Certidão de Nascimento do(s) filho(s)", obrigatorio: false, condicional: "dependente" },
  { tipo_documento: "cpf_dependentes", label: "CPF dos dependentes", obrigatorio: false, condicional: "dependente" },
  { tipo_documento: "caderneta_vacinacao", label: "Caderneta de Vacinação (filhos < 7 anos)", obrigatorio: false, condicional: "dependente" },
  { tipo_documento: "frequencia_escolar", label: "Comprovante de Frequência Escolar (filhos > 7 anos)", obrigatorio: false, condicional: "dependente" },
];
