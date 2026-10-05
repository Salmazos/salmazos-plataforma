// Horário de uma entrevista pra mostrar ao cliente, ou null quando não há horário real.
// O "Encaminhar" do Kanban só tem campo de data e grava meio-dia (12:00 de Brasília) como
// convenção de storage (ver normalizarDataEntrevista em api/encaminhamentos) — mostrar "às
// 12:00" inventava um horário (caso real: Alexsandro Silva Fidencio, 30/09). Quando o próprio
// cliente agenda pelo portal ele escolhe data E hora, e essa hora é real. Decisão do Olver:
// esconder só o 12:00 — se o cliente agendar de verdade ao meio-dia, a hora também some.
export function horaEntrevistaReal(dataEntrevista: string | null | undefined): string | null {
  if (!dataEntrevista) return null;
  const hora = new Date(dataEntrevista).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return hora === "12:00" ? null : hora;
}

// Data (e hora, quando é real) da entrevista no texto que o cliente lê: "20/10/2026 às 14:30" ou só
// "20/10/2026" quando o horário é o 12:00 de convenção (ver horaEntrevistaReal). null sem data válida.
export function dataEntrevistaParaCliente(dataEntrevista: string | null | undefined): string | null {
  if (!dataEntrevista) return null;
  const d = new Date(dataEntrevista);
  if (Number.isNaN(d.getTime())) return null;
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = horaEntrevistaReal(dataEntrevista);
  return hora ? `${data} às ${hora}` : data;
}
