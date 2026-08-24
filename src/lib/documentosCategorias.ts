// Categorias fixas da aba "Clientes" de Documentos — únicas pra todo cliente, sempre
// existem mesmo sem nenhum arquivo enviado ainda. Fonte única usada tanto no painel interno
// (DocumentosPageClient.tsx) quanto no portal do cliente (PortalDocumentosPageClient.tsx) —
// evita as duas telas divergirem se uma categoria for renomeada.
//
// A aba "Salmazos" NÃO usa mais este padrão flat — virou árvore de pastas de verdade
// (documentos_pastas_salmazos, com aninhamento múltiplo via parent_id), as 4 categorias que
// existiam aqui antes (Manuais e Procedimentos/Políticas da Empresa/Formulários/
// Treinamentos) foram migradas como pastas de raiz nessa tabela — ver
// supabase/migration_documentos_pastas_salmazos.sql.
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
