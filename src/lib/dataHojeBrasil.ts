const TIMEZONE_BRASIL = "America/Sao_Paulo";

// O servidor (Vercel/Node) roda em UTC. `new Date()` puro calcula "hoje" errado durante a
// janela em que UTC já virou o dia mas o horário de Brasília ainda não (aprox. 21h-23h59
// BRT). Esta função extrai ano/mês/dia já convertidos pro timezone do Brasil e constrói um
// Date "local" com esses componentes — os getters (getFullYear/getMonth/getDate) então
// sempre refletem o dia correto em Brasília, independente do timezone do runtime.
export function obterDataHojeBrasil(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  const dia = Number(partes.find((p) => p.type === "day")?.value);

  return new Date(ano, mes - 1, dia);
}

// Formata via getters locais (não `toISOString()`, que reconverte pra UTC e pode voltar
// a introduzir o mesmo desalinhamento de dia dependendo do timezone do runtime).
export function formatarDataISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
