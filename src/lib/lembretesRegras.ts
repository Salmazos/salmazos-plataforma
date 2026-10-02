// Regras de data dos lembretes do Comercial. Módulo puro (sem imports): usável no client, no server
// e em teste de lógica. Datas sempre como "AAAA-MM-DD" já no dia de Brasília — nunca new Date() ingênuo.

// Adiar só vale para uma data estritamente depois de hoje.
export function dataAdiamentoValida(novaData: string | null | undefined, hoje: string): boolean {
  return !!novaData && /^\d{4}-\d{2}-\d{2}$/.test(novaData) && novaData > hoje;
}

// Dias de atraso do lembrete (0 se é hoje ou futuro). Diferença de dias de calendário, ao meio-dia UTC
// para não sofrer com horário de verão/fuso.
export function diasDeAtraso(dataLembrete: string, hoje: string): number {
  const a = Date.parse(`${dataLembrete}T12:00:00Z`);
  const b = Date.parse(`${hoje}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}
