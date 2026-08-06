"use client";

import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (texto: string) => void;
}

// Componente isolado, usado só dentro do ModalIniciarAdmissao — não compartilha código
// com os seletores de horário/turno de ModalNovaVaga, ModalEditarVaga, portal/solicitar-vaga
// ou PortalAvaliacaoBtn (cada um tem seu próprio contexto e formato de saída).

const JORNADA_TIPOS = [
  "Segunda a sexta",
  "Segunda a sábado",
  "Todos os dias",
  "Escala 6x1",
  "Escala 6x2",
  "Escala 12x36",
  "Personalizado",
] as const;

type JornadaTipo = (typeof JORNADA_TIPOS)[number];

const DIAS_REGULARES = new Set<JornadaTipo>(["Segunda a sexta", "Segunda a sábado", "Todos os dias"]);
const ESCALAS = new Set<JornadaTipo>(["Escala 6x1", "Escala 6x2", "Escala 12x36"]);

const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// Índice (em DIAS_SEMANA) do último dia de cada faixa de dias regulares — usado só pra
// saber se a exceção cai exatamente no último dia da faixa (caso comum: jornada reduzida
// na sexta), e aí conseguir compor "Segunda a quinta ... e sexta ...". Pra exceção em
// qualquer outro dia do meio da faixa, cai no fallback genérico "(exceto {dia})" — não
// vale a pena tentar compor sub-faixas não-contíguas pra um caso raro.
const ULTIMO_DIA_FAIXA: Record<string, number> = {
  "Segunda a sexta": 4,
  "Segunda a sábado": 5,
  "Todos os dias": 6,
};

// "07:00" (input type=time) -> "07h00"
function fmtHora(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  return `${h}h${m}`;
}

const CHIP_ON: React.CSSProperties = { backgroundColor: "#000", color: "#FFD700", border: "2px solid #000" };
const CHIP_OFF: React.CSSProperties = { backgroundColor: "#fff", color: "#374151", border: "2px solid #E5E7EB" };
const labelStyle = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

export default function SeletorHorarioIniciarAdmissao({ value, onChange }: Props) {
  const [tipo, setTipo] = useState<JornadaTipo | "">("");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [intervalo, setIntervalo] = useState("");
  const [turno1236, setTurno1236] = useState<"diurno" | "noturno">("diurno");
  const [comExcecao, setComExcecao] = useState(false);
  const [excecaoDia, setExcecaoDia] = useState("");
  const [excecaoEntrada, setExcecaoEntrada] = useState("");
  const [excecaoSaida, setExcecaoSaida] = useState("");
  const [personalizado, setPersonalizado] = useState("");

  const ehDiaRegular = tipo !== "" && DIAS_REGULARES.has(tipo as JornadaTipo);
  const ehEscala = tipo !== "" && ESCALAS.has(tipo as JornadaTipo);

  const montarHorarioTexto = (): string => {
    if (!tipo) return "";
    if (tipo === "Personalizado") return personalizado.trim();

    if (ehEscala) {
      if (!entrada || !saida) return "";
      let texto = `${tipo}, das ${fmtHora(entrada)} às ${fmtHora(saida)}`;
      if (tipo === "Escala 12x36") {
        texto += turno1236 === "diurno" ? " (Turno Diurno)" : " (Turno Noturno)";
      }
      return texto;
    }

    // dias regulares
    if (!entrada || !saida) return "";
    const intervaloSufixo = intervalo.trim() ? `, intervalo de ${intervalo.trim()}` : "";
    const excecaoValida = comExcecao && excecaoDia && excecaoEntrada && excecaoSaida;

    if (!excecaoValida) {
      return `${tipo} das ${fmtHora(entrada)} às ${fmtHora(saida)}${intervaloSufixo}`;
    }

    const ultimoDiaIdx = ULTIMO_DIA_FAIXA[tipo];
    const excecaoEhUltimoDia = ultimoDiaIdx != null && DIAS_SEMANA[ultimoDiaIdx] === excecaoDia;

    if (excecaoEhUltimoDia) {
      const faixaReduzida = `Segunda a ${DIAS_SEMANA[ultimoDiaIdx - 1].toLowerCase()}`;
      return `${faixaReduzida} das ${fmtHora(entrada)} às ${fmtHora(saida)}${intervaloSufixo} e ${excecaoDia.toLowerCase()} das ${fmtHora(excecaoEntrada)} às ${fmtHora(excecaoSaida)}`;
    }

    return `${tipo} das ${fmtHora(entrada)} às ${fmtHora(saida)}${intervaloSufixo} (exceto ${excecaoDia.toLowerCase()}, das ${fmtHora(excecaoEntrada)} às ${fmtHora(excecaoSaida)})`;
  };

  const horarioTexto = montarHorarioTexto();

  useEffect(() => {
    if (horarioTexto !== value) onChange(horarioTexto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horarioTexto]);

  const selecionarTipo = (t: JornadaTipo) => {
    setTipo((prev) => (prev === t ? "" : t));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {JORNADA_TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selecionarTipo(t)}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
            style={tipo === t ? CHIP_ON : CHIP_OFF}
          >
            {t}
          </button>
        ))}
      </div>

      {ehDiaRegular && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <label className={labelStyle}>Entrada</label>
              <input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="input-field w-32" />
            </div>
            <div>
              <label className={labelStyle}>Saída</label>
              <input type="time" value={saida} onChange={(e) => setSaida(e.target.value)} className="input-field w-32" />
            </div>
            <div>
              <label className={labelStyle}>Intervalo</label>
              <input
                type="text" value={intervalo}
                onChange={(e) => setIntervalo(e.target.value)}
                placeholder="Ex: 1h12"
                className="input-field w-28"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setComExcecao((v) => !v)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            {comExcecao ? "− Remover horário diferente" : "+ Horário diferente para outro dia (ex: sexta)"}
          </button>

          {comExcecao && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exceção</p>
              <div className="flex items-center gap-2 flex-wrap">
                <div>
                  <label className={labelStyle}>Dia</label>
                  <select value={excecaoDia} onChange={(e) => setExcecaoDia(e.target.value)} className="input-field w-32">
                    <option value="">Selecione...</option>
                    {DIAS_SEMANA.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Entrada</label>
                  <input type="time" value={excecaoEntrada} onChange={(e) => setExcecaoEntrada(e.target.value)} className="input-field w-32" />
                </div>
                <div>
                  <label className={labelStyle}>Saída</label>
                  <input type="time" value={excecaoSaida} onChange={(e) => setExcecaoSaida(e.target.value)} className="input-field w-32" />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {ehEscala && (
        <>
          {tipo === "Escala 12x36" && (
            <div className="flex gap-3">
              {(["diurno", "noturno"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setTurno1236(o)}
                  className="text-sm px-4 py-2 rounded-lg font-medium transition-all"
                  style={turno1236 === o ? { background: "#000", color: "#FFD700", border: "2px solid #000" } : { background: "#fff", color: "#374151", border: "2px solid #E5E7EB" }}
                >
                  {o === "diurno" ? "☀️ Diurno" : "🌙 Noturno"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <label className={labelStyle}>Entrada</label>
              <input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="input-field w-32" />
            </div>
            <div>
              <label className={labelStyle}>Saída</label>
              <input type="time" value={saida} onChange={(e) => setSaida(e.target.value)} className="input-field w-32" />
            </div>
          </div>
        </>
      )}

      {tipo === "Personalizado" && (
        <textarea
          value={personalizado}
          onChange={(e) => setPersonalizado(e.target.value)}
          placeholder="Descreva o horário livremente..."
          rows={2}
          className="input-field"
          style={{ resize: "vertical" }}
        />
      )}

      {horarioTexto && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
          <p className="text-xs font-bold text-gray-400 uppercase mb-1">Horário</p>
          <p className="text-sm text-gray-700 font-medium">{horarioTexto}</p>
        </div>
      )}
    </div>
  );
}
