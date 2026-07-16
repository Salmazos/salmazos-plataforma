// Sem "Outro" aqui de propósito — a opção "Outro (não está na lista)" é adicionada
// separadamente no <select> (PassoDadosBancarios.tsx), que revela um campo de texto
// livre em vez de salvar a string "Outro" como se fosse o nome do banco.
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

export const COR_RACA_OPTIONS: { value: string; label: string }[] = [
  { value: "branca", label: "Branca" },
  { value: "preta", label: "Preta" },
  { value: "parda", label: "Parda" },
  { value: "amarela", label: "Amarela" },
  { value: "indigena", label: "Indígena" },
  { value: "nao_informar", label: "Não informar" },
];

export const PARENTESCO_OPTIONS: { value: string; label: string }[] = [
  { value: "filho", label: "Filho" },
  { value: "filha", label: "Filha" },
  { value: "conjuge", label: "Cônjuge" },
  { value: "outro", label: "Outro" },
];

// Redação literal do decreto — não parafrasear. Fonte única usada tanto no formulário
// do candidato (PassoValeTransporte.tsx) quanto no PDF (desenharSolicitacaoValeTransporte),
// pra evitar o texto legal divergir entre as duas telas.
export const TERMOS_VALE_TRANSPORTE_TEXTO = [
  "Nos termos do artigo 7º do Decreto nº 95.247 de 17 de novembro de 1987, solicito receber o Vale Transporte e comprometo-me:",
  "a) a utilizá-lo exclusivamente para meu efetivo deslocamento residência – trabalho e vice-versa;",
  "b) a renovar anualmente e sempre que ocorrer alteração no meu endereço residencial ou dos serviços e meios de transporte mais adequados ao meu deslocamento residência – trabalho e vice-versa;",
  "c) autorizo a descontar 6% (seis por cento) do meu salário base mensal para concorrer ao custeio do Vale Transporte (conforme parágrafo 3º do artigo 7º do decreto nº 95247/87).",
];

export const OPCAO_VALE_TRANSPORTE_LABEL: Record<string, string> = {
  vale_transporte: "Opto pela utilização do Vale Transporte",
  nao_opta: "Não opto pela utilização do Vale Transporte",
  transporte_fretado: "Opto pela utilização do Transporte Fretado pela Empresa",
};

// DP (Departamento Pessoal)
export const WHATSAPP_SUPORTE = "5519992923939";

// Endereço de REGISTRO/FISCAL da Salmazos — usado em documentos legais (rodapé dos PDFs
// via PdfWriter, Ficha Cadastral, Autorização Sindical, Vale Transporte, e-mail de
// abertura de conta salário). Diferente do endereço de atendimento ao público (divulgado
// no site institucional, fora deste repositório) — não confundir os dois.
export const ENDERECO_FISCAL_SALMAZOS = "Rua Paineira, nº209 – Parque Figueira - Monte Mor/SP - CEP: 13.193-150";

export const NOTA_HEIC_IPHONE =
  "📱 Se você usa iPhone: vá em Ajustes → Câmera → Formatos → selecione \"Mais Compatível\" para enviar fotos em JPEG e evitar problemas de compatibilidade.";

export const NOTAS_DOCUMENTO: Record<string, string> = {
  rg:
    "Tire a foto com o documento aberto, capturando frente e verso na mesma imagem. Garanta que a foto fique nítida e bem iluminada, sem cortes.",
  foto_3x4:
    "Tire uma foto com boa iluminação, fundo neutro (parede branca ou clara) e olhando diretamente para a câmera. Evite usar filtros.",
  ctps_todas_paginas:
    "Fotografe TODAS as páginas da sua Carteira de Trabalho Digital, incluindo páginas em branco com carimbo.",
  comprovante_endereco:
    "Preferencialmente conta de energia elétrica com data dos últimos 3 meses.",
};
