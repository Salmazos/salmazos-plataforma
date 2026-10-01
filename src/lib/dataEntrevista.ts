// Se vier só a data (YYYY-MM-DD, do <input type="date">), fixa meio-dia em
// Brasília antes de gravar — mesma convenção usada pros registros já existentes
// na migração date -> timestamptz, evitando que a data exibida mude de dia
// dependendo do fuso de quem lê depois. Esse 12:00 não é horário escolhido por ninguém —
// telas pro cliente usam horaEntrevistaReal (lib/horaEntrevista.ts) pra não exibi-lo.
export function normalizarDataEntrevista(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${valor}T12:00:00-03:00`;
  return valor;
}
