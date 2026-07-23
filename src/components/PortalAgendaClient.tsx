"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";

export interface EventoAgenda {
  id: string;
  data_entrevista: string;
  candidato_nome: string;
  cargo_pretendido: string | null;
  vaga_titulo: string | null;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function todayNorm(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function PortalAgendaClient({ eventos }: { eventos: EventoAgenda[] }) {
  const hoje = useRef(todayNorm()).current;
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);

  const eventosMap = useMemo(() => {
    const map = new Map<string, EventoAgenda[]>();
    for (const ev of eventos) {
      const d = new Date(ev.data_entrevista);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
    return map;
  }, [eventos]);

  const eventosDoDia = (day: number) => eventosMap.get(`${ano}-${mes}-${day}`) ?? [];

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const totalCells = Math.ceil((primeiroDia + diasNoMes) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const day = i - primeiroDia + 1;
    return day >= 1 && day <= diasNoMes ? day : null;
  });

  const prevMes = () => {
    setDiaSelecionado(null);
    if (mes === 0) { setMes(11); setAno((a) => a - 1); }
    else setMes((m) => m - 1);
  };
  const nextMes = () => {
    setDiaSelecionado(null);
    if (mes === 11) { setMes(0); setAno((a) => a + 1); }
    else setMes((m) => m + 1);
  };

  const isHoje = (day: number) =>
    day === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();

  const listaSelecionada = diaSelecionado !== null ? eventosDoDia(diaSelecionado) : [];

  return (
    <div>
      <Link
        href="/portal"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50 mb-4"
      >
        <span className="text-base font-bold">←</span>
        Voltar
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agenda de Entrevistas</h1>
        <p className="text-gray-500 text-sm mt-1">
          Entrevistas já confirmadas com sua empresa. Somente leitura — para agendar ou alterar uma data, use a aprovação do candidato.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={prevMes}
            aria-label="Mês anterior"
            className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 flex items-center justify-center hover:border-black hover:text-black transition-colors"
          >
            ‹
          </button>
          <h2 className="text-base font-bold text-gray-900">{MESES[mes]} {ano}</h2>
          <button
            onClick={nextMes}
            aria-label="Próximo mês"
            className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 flex items-center justify-center hover:border-black hover:text-black transition-colors"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wide py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;

            const dayEventos = eventosDoDia(day);
            const selected = diaSelecionado === day;
            const today = isHoje(day);
            const clickable = dayEventos.length > 0;
            const visiveis = dayEventos.slice(0, 3);
            const overflow = dayEventos.length - visiveis.length;

            return (
              <div
                key={day}
                onClick={() => clickable && setDiaSelecionado(selected ? null : day)}
                className="rounded-lg p-1.5"
                style={{
                  minHeight: 64,
                  border: selected ? "2px solid #FFD700" : today ? "2px solid #111827" : "1px solid #F0F0F0",
                  background: selected ? "#FFFBEB" : today ? "#F9F9F9" : "#FAFAFA",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                <div className="text-[13px] mb-1" style={{ fontWeight: today ? 800 : 500, color: today ? "#111827" : "#4B5563" }}>
                  {today ? (
                    <span
                      className="rounded-full inline-flex items-center justify-center"
                      style={{ background: "#111827", color: "#FFD700", width: 20, height: 20, fontSize: 11, fontWeight: 800 }}
                    >
                      {day}
                    </span>
                  ) : day}
                </div>
                {dayEventos.length > 0 && (
                  <div className="space-y-0.5">
                    {visiveis.map((ev) => (
                      <div
                        key={ev.id}
                        title={`${ev.candidato_nome}${ev.cargo_pretendido ? ` — ${ev.cargo_pretendido}` : ""}${ev.vaga_titulo ? ` (${ev.vaga_titulo})` : ""}`}
                        className="text-[10px] px-1 py-0.5 rounded truncate"
                        style={{ background: "#DBEAFE", color: "#1D4ED8" }}
                      >
                        {ev.candidato_nome}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[10px] text-gray-400 font-semibold px-1">+{overflow}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {diaSelecionado !== null && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              {diaSelecionado} de {MESES[mes]}
            </p>
            {listaSelecionada.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma entrevista neste dia.</p>
            ) : (
              <div className="space-y-2">
                {listaSelecionada.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: "#000", color: "#FFD700" }}
                    >
                      {ev.candidato_nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{ev.candidato_nome}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {ev.cargo_pretendido}
                        {ev.vaga_titulo && ` · ${ev.vaga_titulo}`}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-gray-500 shrink-0">
                      {new Date(ev.data_entrevista).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
