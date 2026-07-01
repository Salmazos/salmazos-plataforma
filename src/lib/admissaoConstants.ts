export const BANCOS = [
  "Banco do Brasil",
  "Bradesco",
  "Caixa Econômica Federal",
  "Itaú",
  "Santander",
  "Nubank",
  "Inter",
  "Sicoob",
  "Sicredi",
  "BTG Pactual",
  "Outro",
];

export const CNH_CATEGORIAS = ["A", "B", "AB", "C", "D", "E"];

export const MOTIVOS_REJEICAO_DOCUMENTO = [
  "Documento ilegível ou com baixa qualidade",
  "Foto cortada ou incompleta",
  "Documento vencido",
  "Documento incorreto (enviou o documento errado)",
  "Assinatura ou carimbo ausente",
  "Outro motivo (campo livre)",
];

export const ESTADO_CIVIL_OPTIONS: { value: string; label: string }[] = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "uniao_estavel", label: "União Estável" },
];

export const GRAU_INSTRUCAO_OPTIONS: { value: string; label: string }[] = [
  { value: "fundamental_incompleto", label: "Fundamental Incompleto" },
  { value: "fundamental_completo", label: "Fundamental Completo" },
  { value: "medio_incompleto", label: "Médio Incompleto" },
  { value: "medio_completo", label: "Médio Completo" },
  { value: "superior_incompleto", label: "Superior Incompleto" },
  { value: "superior_completo", label: "Superior Completo" },
  { value: "pos_graduacao", label: "Pós-Graduação" },
];

export const PARENTESCO_OPTIONS: { value: string; label: string }[] = [
  { value: "filho", label: "Filho" },
  { value: "filha", label: "Filha" },
  { value: "conjuge", label: "Cônjuge" },
  { value: "outro", label: "Outro" },
];

// DP (Departamento Pessoal)
export const WHATSAPP_SUPORTE = "5519992923939";

export const NOTA_HEIC_IPHONE =
  "📱 Se você usa iPhone: vá em Ajustes → Câmera → Formatos → selecione \"Mais Compatível\" para enviar fotos em JPEG e evitar problemas de compatibilidade.";

export const NOTAS_DOCUMENTO: Record<string, string> = {
  foto_3x4:
    "Tire uma foto com boa iluminação, fundo neutro (parede branca ou clara) e olhando diretamente para a câmera. Evite usar filtros.",
  ctps_todas_paginas:
    "Fotografe TODAS as páginas da sua Carteira de Trabalho Digital, incluindo páginas em branco com carimbo.",
  comprovante_endereco:
    "Preferencialmente conta de energia elétrica com data dos últimos 3 meses.",
};
