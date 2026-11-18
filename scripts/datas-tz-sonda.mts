// Sonda usada por verificar-datas-dd-mm-aaaa.mts: roda sob um TZ escolhido (TZ=America/Sao_Paulo ou TZ=UTC) e imprime, em JSON, o que as
// funções de data devolvem. O verificador compara as duas saídas: dd/mm/aaaa tem de ser IGUAL em qualquer fuso da máquina.
import { dataBR, dataHoraBR, formatarDatasParaExibicao } from "../src/lib/dataBR";
import { formatarData } from "../src/lib/utils";

const DATAS = ["2026-11-18", "2026-12-01", "2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31"];
const TIMESTAMPS = ["2026-11-19T01:30:00Z", "2026-11-19T01:30:00+00:00", "2026-12-01T02:59:59Z", "2026-12-01T03:00:00Z", "2026-01-01T02:00:00.123456+00:00", "2026-01-01T03:00:00Z"];
const saida = {
  fusoDaMaquina: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dataPura: DATAS.map((d) => dataBR(d)),
  timestamp: TIMESTAMPS.map((t) => dataBR(t)),
  timestampComHora: TIMESTAMPS.map((t) => dataHoraBR(t)),
  date: [dataBR(new Date("2026-11-19T01:30:00Z")), dataBR(new Date("2026-12-01T02:59:00Z")), dataBR(new Date("2026-01-01T03:00:00Z"))],
  // comportamento ANTIGO de utils.formatarData numa coluna date (a razão do conserto): só para mostrar o dia errado em Brasília
  formatarDataAntigaEmDatePura: DATAS.map((d) => formatarData(d)),
  json: formatarDatasParaExibicao({ a: "2026-12-01", b: "2026-11-19T01:30:00Z", c: ["2026-01-01", 5, null], d: { e: "texto" } }),
};
console.log(JSON.stringify(saida));
