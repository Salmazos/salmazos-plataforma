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

export type TipoAvisoEntrevista = "agendada" | "remarcada";

// Encaminhamento aberto para o cliente (aguardando a entrevista ou o agendamento dele). Aprovado,
// reprovado e desistiu estão encerrados: sem aviso de entrevista.
const STATUS_ABERTOS_ENTREVISTA = ["aguardando", "aguardando_agendamento_cliente"];

const instanteIso = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Decide se uma gravação de data de entrevista gera aviso ao cliente (bloco 3 de "Avisos ao cliente").
// Compara o estado ANTERIOR (lido antes de gravar) com o novo, do jeito que o CLIENTE enxerga a data
// (dataEntrevistaParaCliente): duas datas que aparecem iguais não são mudança — isso trata o 12:00 de
// convenção do Kanban como "sem horário" e ignora diferença de segundos.
//   sem data antes e com data agora                  → "agendada"
//   com data antes e data/horário diferente agora    → "remarcada"
//   nova data vazia (só limpou), nenhuma mudança,
//   encaminhamento sem estado anterior ou encerrado  → nenhum aviso (tipo null)
// Exige encaminhamento aberto ANTES e DEPOIS: o primeiro envio e o reenvio de um encaminhamento
// encerrado são do aviso "Candidato enviado" (bloco 2).
// `versao` entra na chave de deduplicação: agendada = "{data nova}@{updated_at anterior}"; remarcada =
// "{data anterior}>{data nova}@{updated_at anterior}". Duas requisições simultâneas e idênticas leem o
// mesmo estado anterior (mesma chave); voltar depois para uma data já usada tem outro updated_at anterior,
// então não é engolido pela chave antiga.
export function decidirAvisoEntrevista(
  anterior: { status?: string | null; data_entrevista?: string | null; updated_at?: string | null } | null | undefined,
  novo: { status?: string | null; data_entrevista?: string | null } | null | undefined
): { tipo: TipoAvisoEntrevista | null; antes: string | null; depois: string | null; versao: string } {
  const nenhum = { tipo: null, antes: null, depois: null, versao: "" } as const;
  if (!anterior || !novo) return nenhum;
  if (!STATUS_ABERTOS_ENTREVISTA.includes(anterior.status ?? "") || !STATUS_ABERTOS_ENTREVISTA.includes(novo.status ?? "")) return nenhum;

  const antes = dataEntrevistaParaCliente(anterior.data_entrevista);
  const depois = dataEntrevistaParaCliente(novo.data_entrevista);
  if (!depois) return nenhum;
  const marca = anterior.updated_at ?? "sem-data";

  if (!antes) return { tipo: "agendada", antes: null, depois, versao: `${instanteIso(novo.data_entrevista)}@${marca}` };
  if (antes === depois) return nenhum;
  return { tipo: "remarcada", antes, depois, versao: `${instanteIso(anterior.data_entrevista)}>${instanteIso(novo.data_entrevista)}@${marca}` };
}
