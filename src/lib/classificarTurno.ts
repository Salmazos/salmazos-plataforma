// Classificação automática de turno de trabalho a partir de hora de início/fim.
// Função pura — usada tanto no client (preview em tempo real) quanto no server (fonte de
// verdade ao salvar), pra garantir que os dois lados sempre concordam no mesmo resultado.

export type TurnoClassificacao = "1º Turno" | "2º Turno" | "3º Turno" | "ADM" | "Dia" | "Noite" | "Não identificado";

// Opções válidas pro override manual do RH quando o cálculo automático não bate com
// nenhuma janela conhecida ("Não identificado" fica de fora — é o estado "sem override").
export const TURNOS_OVERRIDE: Exclude<TurnoClassificacao, "Não identificado">[] = [
  "1º Turno",
  "2º Turno",
  "3º Turno",
  "ADM",
  "Dia",
  "Noite",
];

function paraMinutos(hora: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(hora);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function dentro(valor: number, min: number, max: number): boolean {
  return valor >= min && valor <= max;
}

// Janelas calibradas com tolerância (ex: 17:45 em vez de 18:00 exato) pra cobrir variação
// real de horário sem confundir turnos vizinhos — durações não se sobrepõem entre regras,
// então a ordem de checagem abaixo não importa pro resultado.
export function classificarTurno(
  horaInicio: string | null | undefined,
  horaFim: string | null | undefined
): TurnoClassificacao | null {
  if (!horaInicio || !horaFim) return null;

  const inicio = paraMinutos(horaInicio);
  const fim = paraMinutos(horaFim);
  if (inicio === null || fim === null) return null;

  // Virada de dia: se hora_fim <= hora_inicio, o turno atravessa a meia-noite.
  const duracao = fim > inicio ? fim - inicio : fim - inicio + 24 * 60;

  // ≈12h (11h30–12h30): Dia (início ~05:00–07:00) ou Noite (início ~17:00–19:00).
  if (dentro(duracao, 690, 750)) {
    if (dentro(inicio, 300, 420)) return "Dia";
    if (dentro(inicio, 1020, 1140)) return "Noite";
  }
  // 8h–9h, início ~05:00–07:00.
  if (dentro(duracao, 480, 540) && dentro(inicio, 300, 420)) return "1º Turno";
  // ≈8h (7h30–8h30), início ~13:00–15:00.
  if (dentro(duracao, 450, 510) && dentro(inicio, 780, 900)) return "2º Turno";
  // ≈8h (7h30–8h30), início ~21:00–23:00.
  if (dentro(duracao, 450, 510) && dentro(inicio, 1260, 1380)) return "3º Turno";
  // 10h–11h, início ~06:00–08:00.
  if (dentro(duracao, 600, 660) && dentro(inicio, 360, 480)) return "ADM";

  return "Não identificado";
}
