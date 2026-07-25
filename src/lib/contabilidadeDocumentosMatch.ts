// Identificação automática do tipo de cada PDF que a contabilidade envia, por palavra-chave
// no NOME do arquivo (a contabilidade não numera nem padroniza os nomes). Nunca decide "no
// escuro": nenhuma chave bate, ou mais de uma bate, ou dois arquivos do mesmo lote apontam pro
// mesmo tipo → tudo isso vira "sugestão não confiável", forçando escolha manual via dropdown na
// tela de conferência (ver ModalUploadDocumentosContabilidade.tsx).

export type TipoDocumentoContabilidade =
  | "ficha_registro"
  | "modelo_contrato"
  | "acordo_hs_vt"
  | "termo_lgpd"
  | "ficha_ir"
  | "salario_familia"
  | "termo_responsabilidade";

export interface DocumentoContabilidadeDef {
  tipo_documento: TipoDocumentoContabilidade;
  label: string;
  // Palavras-chave candidatas — basta UMA bater (normalizada) no nome do arquivo.
  chaves: string[];
  // Ficha de IR, Salário Família e Termo de Responsabilidade NÃO são gateados por
  // admissao_dados_pessoais.dependente_ir/dependente_salario_familia — esses campos não
  // preveem com confiabilidade o que a contabilidade vai efetivamente mandar. A
  // necessidade real dos 3 últimos é decidida pela própria contabilidade no momento do
  // envio: se o arquivo chegar, ele é identificado e entra no pacote; se não chegar, o
  // pacote sai só com os 4 fixos, sem bloquear nada.
  obrigatorio: boolean;
}

// Ordem fixa — é também a ordem de montagem do PDF final (ver montar-enviar/route.ts) e a
// ordem de exibição na tela de conferência, que SEMPRE lista os 7 (ver
// ModalUploadDocumentosContabilidade.tsx).
export const DOCUMENTOS_CONTABILIDADE: DocumentoContabilidadeDef[] = [
  { tipo_documento: "ficha_registro", label: "Ficha de Registro", chaves: ["FICHA DE REGISTRO"], obrigatorio: true },
  { tipo_documento: "modelo_contrato", label: "Modelo Contrato Temporário", chaves: ["MODELO CONTRATO"], obrigatorio: true },
  { tipo_documento: "acordo_hs_vt", label: "Acordo de HS / Decl. VT", chaves: ["ACORDO DE HS", "DECL VT"], obrigatorio: true },
  { tipo_documento: "termo_lgpd", label: "Termo de Consentimento (LGPD)", chaves: ["TERMO DE CONSENTIMENTO", "LGPD"], obrigatorio: true },
  { tipo_documento: "ficha_ir", label: "Ficha de IR", chaves: ["FICHA DE IR"], obrigatorio: false },
  { tipo_documento: "salario_familia", label: "Ficha de Salário Família", chaves: ["SALARIO FAMILIA"], obrigatorio: false },
  { tipo_documento: "termo_responsabilidade", label: "Termo de Responsabilidade", chaves: ["TERMO DE RESPONSABILIDADE"], obrigatorio: false },
];

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Retorna o tipo sugerido pelo nome do arquivo, OU null quando a sugestão não é confiável
// (nenhuma chave bateu, ou mais de uma bateu — nomes de arquivo às vezes contêm palavras de
// dois documentos diferentes por acidente). null sempre significa "escolha manual obrigatória".
export function inferirTipoDocumentoContabilidade(nomeArquivo: string): TipoDocumentoContabilidade | null {
  const nomeNormalizado = normalizar(nomeArquivo);
  const candidatos = DOCUMENTOS_CONTABILIDADE.filter((def) =>
    def.chaves.some((chave) => nomeNormalizado.includes(normalizar(chave)))
  );
  if (candidatos.length !== 1) return null;
  return candidatos[0].tipo_documento;
}

// Dado um lote de itens (id do item no lote + tipo escolhido/sugerido, ou null), retorna o
// conjunto de ids em conflito — mais de um item do MESMO lote apontando pro mesmo tipo. Usado
// pela tela de conferência tanto na sugestão automática quanto após o usuário editar o dropdown
// manualmente (o conflito pode surgir dos dois jeitos).
export function detectarConflitosDeTipo<T extends { id: string; tipo: TipoDocumentoContabilidade | null }>(
  itens: T[]
): Set<string> {
  const porTipo = new Map<TipoDocumentoContabilidade, string[]>();
  for (const item of itens) {
    if (!item.tipo) continue;
    const lista = porTipo.get(item.tipo) ?? [];
    lista.push(item.id);
    porTipo.set(item.tipo, lista);
  }
  const conflitos = new Set<string>();
  for (const ids of porTipo.values()) {
    if (ids.length > 1) ids.forEach((id) => conflitos.add(id));
  }
  return conflitos;
}

export interface DocumentoObrigatoriedade {
  tipo_documento: TipoDocumentoContabilidade;
  label: string;
  obrigatorio: boolean;
}

// Sempre os 7 tipos, na ordem fixa de exibição/montagem — cada um já marcado com se é
// obrigatório ou não. Só os 4 primeiros (Ficha de Registro, Modelo Contrato, Acordo de
// HS/Decl VT, Termo LGPD) bloqueiam o envio se faltarem; Ficha de IR, Salário Família e
// Termo de Responsabilidade NUNCA são obrigatórios — entram no pacote final se e só se a
// contabilidade de fato enviar o arquivo correspondente.
export function documentosObrigatorios(): DocumentoObrigatoriedade[] {
  return DOCUMENTOS_CONTABILIDADE.map((def) => ({
    tipo_documento: def.tipo_documento,
    label: def.label,
    obrigatorio: def.obrigatorio,
  }));
}
