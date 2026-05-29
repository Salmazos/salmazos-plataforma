export const HABILIDADES = [
  "Atendimento ao cliente",
  "Pacote Office",
  "Excel avançado",
  "Redes sociais",
  "Liderança",
  "Trabalho em equipe",
  "Comunicação",
  "Vendas",
  "Negociação",
  "Gestão de pessoas",
  "Financeiro",
  "Administrativo",
  "Logística",
  "Operacional",
  "Informática",
  "SAP / ERP",
  "Gestão de projetos",
  "Atendimento ao público",
  "Inglês",
  "Espanhol",
];

export const TEMPO_EXPERIENCIA = [
  "Sem experiência",
  "Menos de 1 ano",
  "1 a 2 anos",
  "3 a 5 anos",
  "Mais de 5 anos",
];

export const TURNOS = [
  "Manhã (06h – 12h)",
  "Tarde (12h – 18h)",
  "Noite (18h – 00h)",
  "Integral",
  "Flexível",
];

export const ESTADOS = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

export const TIPOS_SERVICO = [
  {
    id: "recrutamento_selecao",
    label: "Recrutamento e Seleção",
    abrev: "R&S",
    bg: "bg-[#1D6FA4]",
    text: "text-white",
    border: "border-[#1D6FA4]",
  },
  {
    id: "mao_obra_temporaria",
    label: "Mão de Obra Temporária",
    abrev: "Temporária",
    bg: "bg-[#FFD700]",
    text: "text-black",
    border: "border-[#e6c200]",
  },
  {
    id: "terceirizacao",
    label: "Terceirização de Serviços",
    abrev: "Terceirização",
    bg: "bg-[#1D9E75]",
    text: "text-white",
    border: "border-[#1D9E75]",
  },
  {
    id: "avaliacao_psicologica",
    label: "Avaliação Psicológica",
    abrev: "Aval. Psic.",
    bg: "bg-[#6B4FBB]",
    text: "text-white",
    border: "border-[#6B4FBB]",
  },
] as const;

export type TipoServicoId = (typeof TIPOS_SERVICO)[number]["id"];

export const SEGMENTOS_CLIENTE = [
  "Indústria",
  "Comércio",
  "Serviços",
  "Tecnologia",
  "Saúde",
  "Educação",
  "Agronegócio",
  "Construção civil",
  "Transporte e Logística",
  "Outros",
];

export const STATUS_ENCAMINHAMENTO: Record<string, { label: string; bg: string; text: string }> = {
  aguardando: { label: "Aguardando", bg: "bg-yellow-100", text: "text-yellow-800" },
  aprovado:   { label: "Aprovado",   bg: "bg-green-100",  text: "text-green-800"  },
  reprovado:  { label: "Reprovado",  bg: "bg-red-100",    text: "text-red-800"    },
  desistiu:   { label: "Desistiu",   bg: "bg-gray-100",   text: "text-gray-600"   },
};

export const ETAPAS_KANBAN = [
  {
    id: "triagem" as const,
    label: "Triagem",
    descricao: "Análise inicial do currículo pela equipe Salmazos",
    headerBg: "bg-blue-500",
    columnBg: "bg-blue-50",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    border: "border-blue-200",
  },
  {
    id: "entrevista_salmazos" as const,
    label: "Entrevista Salmazos",
    descricao: "Entrevista e avaliação feita pela Salmazos",
    headerBg: "bg-amber-500",
    columnBg: "bg-amber-50",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    border: "border-amber-200",
  },
  {
    id: "entrevista_cliente" as const,
    label: "Entrevista Cliente",
    descricao: "Candidato aprovado pela Salmazos e encaminhado ao cliente",
    headerBg: "bg-orange-500",
    columnBg: "bg-orange-50",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-800",
    border: "border-orange-200",
  },
  {
    id: "aprovado_cliente" as const,
    label: "Aprovado pelo Cliente",
    descricao: "Cliente confirmou a aprovação do candidato",
    headerBg: "bg-green-500",
    columnBg: "bg-green-50",
    badgeBg: "bg-green-100",
    badgeText: "text-green-800",
    border: "border-green-200",
  },
] as const;
