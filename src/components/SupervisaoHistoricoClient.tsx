"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { ChartOptions, Plugin } from "chart.js";
import { Bar, Chart } from "react-chartjs-2";
import ModalDetalheVisitaSupervisao from "./ModalDetalheVisitaSupervisao";
import type { VisitaHistoricoItem, ParetoClienteItem } from "@/app/api/supervisao/historico/route";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip);

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

type Nivel = "pareto" | "mes" | "semana" | "visitas";

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

// Desenha o valor numérico acima de cada barra do dataset "bar" — só no gráfico de Pareto.
// Plugin local (via prop `plugins` do react-chartjs-2), não registrado globalmente, pra não
// afetar os outros níveis do drill-down. Evita adicionar chartjs-plugin-datalabels como
// dependência nova só pra isso.
const barValueLabelPlugin: Plugin<"bar"> = {
  id: "barValueLabel",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets[0];
    meta.data.forEach((bar, index) => {
      const value = dataset.data[index];
      if (value == null) return;
      ctx.save();
      ctx.fillStyle = "#111827";
      ctx.font = "700 11px sans-serif";
      ctx.textAlign = "center";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.fillText(String(value), (bar as any).x, (bar as any).y - 6);
      ctx.restore();
    });
  },
};

export default function SupervisaoHistoricoClient({ clientes }: Props) {
  const hoje = hojeBrasil();
  const [clienteId, setClienteId] = useState<string>("");
  const [ano, setAno] = useState(hoje.ano);
  const [mes, setMes] = useState(hoje.mes);
  const [visitas, setVisitas] = useState<VisitaHistoricoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [nivel, setNivel] = useState<Nivel>("pareto");
  const [semanaSelecionada, setSemanaSelecionada] = useState<string | null>(null);
  const [visitaSelecionada, setVisitaSelecionada] = useState<VisitaHistoricoItem | null>(null);

  const [pareto, setPareto] = useState<ParetoClienteItem[]>([]);
  const [carregandoPareto, setCarregandoPareto] = useState(false);
  const [erroPareto, setErroPareto] = useState("");

  // Nível 0 — carrega sempre que o mês muda, independente de haver ou não um cliente
  // selecionado nos outros níveis (é a tela padrão da aba, e o filtro de mês fica ativo
  // o tempo todo).
  useEffect(() => {
    setCarregandoPareto(true);
    setErroPareto("");
    fetch(`/api/supervisao/historico?ano=${ano}&mes=${mes}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) { setErroPareto(json.error ?? "Erro ao carregar Pareto."); setPareto([]); return; }
        setPareto(json.data ?? []);
      })
      .catch(() => setErroPareto("Erro de conexão."))
      .finally(() => setCarregandoPareto(false));
  }, [ano, mes]);

  // Níveis 1-3 — só roda quando um cliente está selecionado. clienteId volta pra "" ao
  // clicar em "Voltar" no nível mês, o que traz o nível de volta pro Pareto.
  useEffect(() => {
    setSemanaSelecionada(null);
    if (!clienteId) { setNivel("pareto"); setVisitas([]); return; }
    setNivel("mes");
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

  const clienteNome = clienteId
    ? (pareto.find((p) => p.clienteId === clienteId)?.clienteNome ?? clientes.find((c) => c.id === clienteId)?.nome ?? "")
    : "";

  // Trocar de mês sempre volta pro Pareto — evita a confusão de o cliente selecionado
  // continuar "preso" num mês diferente do que a pessoa acabou de escolher.
  const irMesAnterior = () => {
    setClienteId("");
    if (mes === 1) { setMes(12); setAno((a) => a - 1); } else setMes((m) => m - 1);
  };
  const irMesProximo = () => {
    setClienteId("");
    if (mes === 12) { setMes(1); setAno((a) => a + 1); } else setMes((m) => m + 1);
  };

  const voltar = () => {
    if (nivel === "visitas") { setNivel("semana"); return; }
    if (nivel === "semana") { setNivel("mes"); return; }
    if (nivel === "mes") { setClienteId(""); return; }
  };

  // Percentual acumulado — clientes com total=0 entram no denominador (total geral) mas não
  // fazem a curva subir, ficam "esticando" o final do gráfico em linha reta na última altura
  // atingida. Se o mês inteiro estiver zerado, a linha fica achatada em 0% (evita divisão por
  // zero) em vez de sumir.
  const totalGeralPareto = useMemo(() => pareto.reduce((s, p) => s + p.total, 0), [pareto]);
  const acumuladoPareto = useMemo(() => {
    let acumulado = 0;
    return pareto.map((p) => {
      acumulado += p.total;
      return totalGeralPareto > 0 ? Math.round((acumulado / totalGeralPareto) * 1000) / 10 : 0;
    });
  }, [pareto, totalGeralPareto]);

  const chartPareto = {
    labels: pareto.map((p) => p.clienteNome),
    datasets: [
      {
        type: "bar" as const,
        label: "Visitas no mês",
        data: pareto.map((p) => p.total),
        backgroundColor: barColor,
        borderRadius: 4,
        yAxisID: "y",
        order: 2,
      },
      {
        type: "line" as const,
        label: "% acumulado",
        data: acumuladoPareto,
        borderColor: "#DC2626",
        backgroundColor: "#DC2626",
        pointBackgroundColor: "#DC2626",
        yAxisID: "y1",
        tension: 0.2,
        pointRadius: 3,
        order: 1,
      },
    ],
  };

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
            <option value="">Todos os clientes (Pareto)</option>
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

      <div key={nivel} className="supervisao-historico-nivel">
        <style>{`
          .supervisao-historico-nivel { animation: supervisaoHistoricoFade 0.18s ease-out; }
          @keyframes supervisaoHistoricoFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {nivel !== "pareto" && (
          <button
            onClick={voltar}
            style={{ marginBottom: 12, background: "none", border: "none", color: "#B45309", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            {nivel === "mes" ? "◀ Ver todos os clientes" : "← Voltar"}
          </button>
        )}

        {nivel === "pareto" && (
          erroPareto ? (
            <p style={{ color: "#DC2626", fontSize: 13 }}>{erroPareto}</p>
          ) : carregandoPareto ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando...</p>
          ) : pareto.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhum cliente configurado no programa de supervisão.</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px" }}>
                Visitas de supervisão por cliente em {MESES[mes - 1]}/{ano} — clique numa barra pra ver o histórico daquele cliente.
              </p>
              <div style={{ height: 320 }}>
                <Chart
                  type="bar"
                  data={chartPareto}
                  plugins={[barValueLabelPlugin]}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: "top" as const }, tooltip: { enabled: true } },
                    scales: {
                      y: { beginAtZero: true, ticks: { precision: 0 }, position: "left" as const },
                      y1: {
                        beginAtZero: true, max: 100, position: "right" as const,
                        grid: { drawOnChartArea: false },
                        ticks: { callback: (v: number | string) => `${v}%` },
                      },
                    },
                    onHover: (event, elements) => {
                      const target = event.native?.target as HTMLElement | null;
                      if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
                    },
                    onClick: (_e, elements) => {
                      if (elements.length === 0) return;
                      setClienteId(pareto[elements[0].index].clienteId);
                    },
                  }}
                />
              </div>
            </>
          )
        )}

        {nivel === "mes" && (
          erro ? (
            <p style={{ color: "#DC2626", fontSize: 13 }}>{erro}</p>
          ) : carregando ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando histórico...</p>
          ) : visitas.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhuma visita de supervisão registrada em {clienteNome} neste mês.</p>
          ) : (
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
          )
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
