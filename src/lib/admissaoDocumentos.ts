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
  // Rótulo mostrado SÓ ao candidato (upload e revisão). O `label` continua sendo o do painel, do índice do pacote e da
  // mensagem de rejeição — assim nada que já existe muda de texto.
  labelCandidato?: string;
  // Verso OPCIONAL de um documento (hoje só a certidão civil: serve à averbação de divórcio). Nunca bloqueia envio nem pacote;
  // a linha é criada sob demanda quando a admissão não nasceu com ela; fica fora do contador "N de M"/docsEnviados enquanto não
  // tem arquivo; e, se rejeitado, não entra no pacote da contabilidade.
  versoOpcional?: boolean;
  // Nunca aparece pro cliente no Portal (dado sensível: a averbação de divórcio fica no verso da certidão).
  ocultoNoPortal?: boolean;
}

export const DOCUMENTOS_ADMISSAO: DocumentoAdmissaoDef[] = [
  { tipo_documento: "ctps_todas_paginas", label: "Carteira de Trabalho Digital (todas as páginas)", obrigatorio: true, condicional: null, multiArquivo: true },
  { tipo_documento: "cpf", label: "CPF/CIC", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "titulo_eleitor", label: "Título de Eleitor", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "cartao_sus", label: "Cartão do SUS", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "rg", label: "Identidade RG (frente)", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "rg_verso", label: "Identidade RG (verso)", obrigatorio: true, condicional: null, enquadramento: "cartao" },
  { tipo_documento: "reservista", label: "Reservista", obrigatorio: false, condicional: "masculino", enquadramento: "folha" },
  { tipo_documento: "certidao_civil", label: "Certidão de Nascimento/Casamento/União Estável", labelCandidato: "Certidão de Nascimento/Casamento/União Estável — Frente", obrigatorio: true, condicional: null, enquadramento: "folha" },
  { tipo_documento: "certidao_civil_verso", label: "Certidão de Nascimento/Casamento/União Estável (verso)", labelCandidato: "Certidão de Nascimento/Casamento/União Estável — Verso (opcional — envie se houver averbação de divórcio)", obrigatorio: false, condicional: null, enquadramento: "folha", versoOpcional: true, ocultoNoPortal: true },
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

export const TIPO_CERTIDAO_VERSO = "certidao_civil_verso";

const defDe = (tipo: string) => DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === tipo);
export const ehVersoOpcional = (tipo: string): boolean => defDe(tipo)?.versoOpcional === true;

// Contadores ("N de M aprovados" no painel e docsEnviados da lista): o verso opcional SEM arquivo não conta, senão toda admissão
// nova que não tem averbação ficaria eternamente "N de N+1". Com arquivo (enviado/aprovado/rejeitado) ele conta normalmente.
export function contaNoProgressoDocumentos(doc: { tipo_documento: string; storage_path?: string | null }): boolean {
  return !(ehVersoOpcional(doc.tipo_documento) && !doc.storage_path);
}

// Pacote da contabilidade: o verso opcional REJEITADO não entra (o arquivo foi recusado e não bloqueia nada, então ninguém
// o corrigiria). Vale só para os tipos versoOpcional — os demais seguem embutindo tudo que tem arquivo, como sempre.
export function documentoEntraNoPacote(doc: { tipo_documento: string; status?: string | null; storage_path?: string | null }): boolean {
  if (!doc.storage_path) return false;
  return !(ehVersoOpcional(doc.tipo_documento) && doc.status === "rejeitado");
}

// Linha do verso opcional criada sob demanda: admissões abertas antes da migração não nasceram com ela e os PATCH de upload
// fazem UPDATE na linha semeada. Não toca em nenhuma linha existente.
export async function garantirLinhaVersoOpcional(
  svc: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  admissaoId: string,
  tipo: string
): Promise<{ error: { message: string } | null }> {
  const def = defDe(tipo);
  if (!def?.versoOpcional) return { error: null };
  const { data: existente, error: erroBusca } = await svc.from("admissao_documentos").select("id").eq("admissao_id", admissaoId).eq("tipo_documento", tipo).limit(1).maybeSingle();
  if (erroBusca) return { error: erroBusca };
  if (existente) return { error: null };
  const { error } = await svc.from("admissao_documentos").insert({ admissao_id: admissaoId, tipo_documento: tipo, obrigatorio: def.obrigatorio, condicional: def.condicional });
  return { error };
}
