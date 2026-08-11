"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import ModalDetalheVisitaSupervisao from "./ModalDetalheVisitaSupervisao";
import type { VisitaHistoricoItem } from "@/app/api/supervisao/historico/route";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export interface ClienteHistoricoOption {
  id: string;
  nome: string;
}

interface Props {
  clientes: ClienteHistoricoOption[];
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Nivel = "mes" | "semana" | "visitas";

interface SemanaBucket {
  segunda: string; // ISO da segunda-feira
  domingo: string; // ISO do domingo
  itens: VisitaHistoricoItem[];
}

function hojeBrasil(): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return {
    ano: Number(partes.find((p) => p.type === "year")?.value),
    mes: Number(partes.find((p) => p.type === "month")?.value),
  };
}

function parseDataLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatarDataLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// Segunda-feira da semana ISO que contém a data — pode cair no mês anterior; isso é
// intencional (ver observação sobre bucketing de semanas no resumo da implementação).
function segundaDaSemana(iso: string): string {
  const d = parseDataLocal(iso);
  const dow = d.getDay(); // 0=domingo .. 6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return formatarDataLocal(d);
}
function domingoDaSemana(segundaIso: string): string {
  const d = parseDataLocal(segundaIso);
  d.setDate(d.getDate() + 6);
  return formatarDataLocal(d);
}
function formatCurto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const barColor = "#FFD700";

const baseOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: true } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  onHover: (event, elements) => {
    const target = event.native?.target as HTMLElement | null;
    if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
  },
};

export default function SupervisaoHistoricoClient({ clientes }: Props) {
  const hoje = hojeBrasil();
  const [clienteId, setClienteId] = useState<string>(clientes[0]?.id ?? "");
  const [ano, setAno] = useState(hoje.ano);
  const [mes, setMes] = useState(hoje.mes);
  const [visitas, setVisitas] = useState<VisitaHistoricoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [nivel, setNivel] = useState<Nivel>("mes");
  const [semanaSelecionada, setSemanaSelecionada] = useState<string | null>(null);
  const [visitaSelecionada, setVisitaSelecionada] = useState<VisitaHistoricoItem | null>(null);

  useEffect(() => {
    setNivel("mes");
    setSemanaSelecionada(null);
    if (!clienteId) { setVisitas([]); return; }
    setCarregando(true);
    setErro("");
    fetch(`/api/supervisao/historico?cliente_id=${clienteId}&ano=${ano}&mes=${mes}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) { setErro(json.error ?? "Erro ao carregar histórico."); setVisitas([]); return; }
        setVisitas(json.data ?? []);
      })
      .catch(() => setErro("Erro de conexão."))
      .finally(() => setCarregando(false));
  }, [clienteId, ano, mes]);

  const semanas = useMemo<SemanaBucket[]>(() => {
    const map = new Map<string, VisitaHistoricoItem[]>();
    for (const v of visitas) {
      const segunda = segundaDaSemana(v.data);
      const arr = map.get(segunda) ?? [];
      arr.push(v);
      map.set(segunda, arr);
    }
    return Array.from(map.entries())
      .map(([segunda, itens]) => ({
        segunda,
        domingo: domingoDaSemana(segunda),
        itens: itens.sort((a, b) => a.data.localeCompare(b.data)),
      }))
      .sort((a, b) => a.segunda.localeCompare(b.segunda));
  }, [visitas]);

  const visitasDaSemana = useMemo(
    () => semanas.find((s) => s.segunda === semanaSelecionada)?.itens ?? [],
    [semanas, semanaSelecionada]
  );

  const clienteNome = clientes.find((c) => c.id === clienteId)?.nome ?? "";

  const irMesAnterior = () => { if (mes === 1) { setMes(12); setAno((a) => a - 1); } else setMes((m) => m - 1); };
  const irMesProximo = () => { if (mes === 12) { setMes(1); setAno((a) => a + 1); } else setMes((m) => m + 1); };

  const chartMes = {
    labels: [`${MESES[mes - 1]}/${ano}`],
    datasets: [{ label: "Visitas de supervisão", data: [visitas.length], backgroundColor: barColor, borderRadius: 6, maxBarThickness: 90 }],
  };
  const chartSemana = {
    labels: semanas.map((s) => `${formatCurto(s.segunda)}–${formatCurto(s.domingo)}`),
    datasets: [{ label: "Visitas na semana", data: semanas.map((s) => s.itens.length), backgroundColor: barColor, borderRadius: 6 }],
  };
  const chartVisitas = {
    labels: visitasDaSemana.map((v) => formatCurto(v.data)),
    datasets: [{ label: "Visita", data: visitasDaSemana.map(() => 1), backgroundColor: barColor, borderRadius: 6 }],
  };

  return (
    <div>
      {/* Filtros — visíveis e ativos em qualquer nível do drill-down */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Cliente</label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, minWidth: 220, cursor: "pointer" }}
          >
            {clientes.length === 0 && <option value="">Nenhum cliente disponível</option>}
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={irMesAnterior} style={{ padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>
            ‹
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", minWidth: 130, textAlign: "center" }}>
            {MESES[mes - 1]} / {ano}
          </span>
          <button onClick={irMesProximo} style={{ padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>
            ›
          </button>
        </div>
      </div>

      {erro && <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 16 }}>{erro}</p>}

      {!clienteId ? (
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>Selecione um cliente para ver o histórico de visitas.</p>
      ) : carregando ? (
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando histórico...</p>
      ) : visitas.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhuma visita de supervisão registrada em {clienteNome} neste mês.</p>
      ) : (
        <div key={nivel} className="supervisao-historico-nivel">
          <style>{`
            .supervisao-historico-nivel { animation: supervisaoHistoricoFade 0.18s ease-out; }
            @keyframes supervisaoHistoricoFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>

          {nivel !== "mes" && (
            <button
              onClick={() => setNivel(nivel === "visitas" ? "semana" : "mes")}
              style={{ marginBottom: 12, background: "none", border: "none", color: "#B45309", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              ← Voltar
            </button>
          )}

          {nivel === "mes" && (
            <>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px" }}>
                Total de visitas de supervisão em <strong>{clienteNome}</strong> — clique na barra pra ver por semana.
              </p>
              <div style={{ height: 220 }}>
                <Bar
                  data={chartMes}
                  options={{
                    ...baseOptions,
                    onClick: (_e, elements) => { if (elements.length > 0) setNivel("semana"); },
                  }}
                />
              </div>
            </>
          )}

          {nivel === "semana" && (
            <>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px" }}>
                Visitas por semana em {MESES[mes - 1]}/{ano} — clique numa barra pra ver as visitas daquela semana.
              </p>
              <div style={{ height: 260 }}>
                <Bar
                  data={chartSemana}
                  options={{
                    ...baseOptions,
                    onClick: (_e, elements) => {
                      if (elements.length === 0) return;
                      const idx = elements[0].index;
                      setSemanaSelecionada(semanas[idx].segunda);
                      setNivel("visitas");
                    },
                  }}
                />
              </div>
            </>
          )}

          {nivel === "visitas" && semanaSelecionada && (
            <>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px" }}>
                Visitas na semana de {formatCurto(semanaSelecionada)} a {formatCurto(domingoDaSemana(semanaSelecionada))} — clique numa visita pra ver o detalhe.
              </p>
              <div style={{ height: 260 }}>
                <Bar
                  data={chartVisitas}
                  options={{
                    ...baseOptions,
                    plugins: { ...baseOptions.plugins, tooltip: { enabled: true, callbacks: { label: () => "Clique pra ver detalhe" } } },
                    onClick: (_e, elements) => {
                      if (elements.length === 0) return;
                      setVisitaSelecionada(visitasDaSemana[elements[0].index]);
                    },
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {visitaSelecionada && (
        <ModalDetalheVisitaSupervisao
          visita={visitaSelecionada}
          clienteNome={clienteNome}
          onClose={() => setVisitaSelecionada(null)}
        />
      )}
    </div>
  );
}
