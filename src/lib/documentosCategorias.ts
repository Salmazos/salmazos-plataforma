// Categorias fixas de Documentos — únicas pra todo cliente/Salmazos, sempre existem mesmo
// sem nenhum arquivo enviado ainda. Fonte única usada tanto no painel interno
// (DocumentosPageClient.tsx) quanto no portal do cliente (PortalDocumentosPageClient.tsx) —
// evita as duas telas divergirem se uma categoria for renomeada.
export const SALMAZOS_CATEGORIAS = [
  { key: "manuais", label: "Manuais e Procedimentos" },
  { key: "politicas", label: "Políticas da Empresa" },
  { key: "formularios", label: "Formulários" },
  { key: "treinamentos", label: "Treinamentos" },
];

export const CLIENTE_CATEGORIAS = [
  { key: "limpeza", label: "Limpeza e Higienização" },
  { key: "checklists", label: "Checklists" },
  { key: "cronogramas", label: "Cronogramas" },
  { key: "seguranca", label: "Segurança" },
  { key: "contratos", label: "Contratos" },
];

// Categorias customizadas (documentos_categorias_customizadas) não podem reaproveitar a
// chave de uma fixa pro mesmo cliente — evitaria duas pastas "Limpeza e Higienização"
// (uma fixa, uma "customizada" com o mesmo slug) na mesma grade.
export const CHAVES_CLIENTE_CATEGORIAS_FIXAS = new Set(CLIENTE_CATEGORIAS.map((c) => c.key));
