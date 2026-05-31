"use client";

import { useMemo, useState } from "react";
import { ANALISTAS } from "@/lib/constants";
import type { EtapaKanban, StatusEncaminhamento } from "@/types";

interface CandidatoData {
  id: string;
  responsavel: string | null;
  etapa_kanban: EtapaKanban;
  status: string;
  created_at: string;
}

interface EncaminhamentoData {
  id: string;
  candidato_id: string;
  status: StatusEncaminhamento;
  updated_at: string;
}

interface MetricasAnalista {
  nome: string;
  ativos: number;
  aprovados: number;
  reprovados: number;
  tempoMedio: number | null;
}

interface Props {
  candidatos: CandidatoData[];
  encaminhamentos: EncaminhamentoData[];
}

function calcularMetricasAnalista(
  nome: string,
  candidatosFiltrados: CandidatoData[],
  encaminhamentos: EncaminhamentoData[],
  candidatoMap: Map<string, CandidatoData>
): MetricasAnalista {
  const meusCandidatos = candidatosFiltrados.filter((c) => c.responsavel === nome);
  const meusIds = new Set(meusCandidatos.map((c) => c.id));

  const ativos = meusCandidatos.filter(
    (c) => c.etapa_kanban !== "aprovado_cliente" && c.status === "ativo"
  ).length;
  const aprovados = meusCandidatos.filter((c) => c.etapa_kanban === "aprovado_cliente").length;
  const reprovadosEncaminhamentos = encaminhamentos.filter(
    (e) => e.status === "reprovado" && meusIds.has(e.candidato_id)
  ).length;
  const reprovadosKanban = meusCandidatos.filter(
    (c) => c.status === "reprovado" || c.status === "negativado"
  ).length;
  const reprovados = reprovadosEncaminhamentos + reprovadosKanban;

  const encerrados = encaminhamentos.filter(
    (e) =>
      (e.status === "aprovado" || e.status === "reprovado") &&
      meusIds.has(e.candidato_id)
  );

  let tempoMedio: number | null = null;
  if (encerrados.length > 0) {
    const totalDias = encerrados.reduce((soma, e) => {
      const cand = candidatoMap.get(e.candidato_id);
      if (!cand) return soma;
      const diff =
        new Date(e.updated_at).getTime() - new Date(cand.created_at).getTime();
      return soma + Math.max(0, diff) / (1000 * 60 * 60 * 24);
    }, 0);
    tempoMedio = Math.round(totalDias / encerrados.length);
  }

  return { nome, ativos, aprovados, reprovados, tempoMedio };
}

function BadgeRank({ pos }: { pos: number }) {
  const base = "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0";
  if (pos === 1) return <span className={`${base} bg-[#FFD700] text-black`}>1</span>;
  if (pos === 2) return <span className={`${base} bg-gray-300 text-gray-700`}>2</span>;
  if (pos === 3) return <span className={`${base} bg-amber-600 text-white`}>3</span>;
  return <span className={`${base} bg-gray-100 text-gray-500`}>{pos}</span>;
}

function ChipRank({ pos }: { pos: number }) {
  const base = "text-xs rounded-full px-2 py-0.5 font-bold";
  if (pos === 1) return <span className={`${base} bg-[#FFD700] text-black`}>#1</span>;
  if (pos === 2) return <span className={`${base} bg-gray-200 text-gray-700`}>#2</span>;
  if (pos === 3) return <span className={`${base} bg-amber-600 text-white`}>#3</span>;
  return <span className={`${base} bg-gray-100 text-gray-500`}>#{pos}</span>;
}

export default function RelatoriosPageClient({ candidatos, encaminhamentos }: Props) {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const hojeStr = hoje.toISOString().split("T")[0];

  const [dataInicio, setDataInicio] = useState(inicioMes);
  const [dataFim, setDataFim] = useState(hojeStr);

  const candidatoMap = useMemo(() => {
    const map = new Map<string, CandidatoData>();
    candidatos.forEach((c) => map.set(c.id, c));
    return map;
  }, [candidatos]);

  const metricas = useMemo<MetricasAnalista[]>(() => {
    const inicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
    const fim = dataFim ? new Date(dataFim + "T23:59:59") : null;

    const candidatosFiltrados = candidatos.filter((c) => {
      const dt = new Date(c.created_at);
      if (inicio && dt < inicio) return false;
      if (fim && dt > fim) return false;
      return true;
    });

    return ANALISTAS.map((nome) =>
      calcularMetricasAnalista(nome, candidatosFiltrados, encaminhamentos, candidatoMap)
    );
  }, [candidatos, encaminhamentos, candidatoMap, dataInicio, dataFim]);

  const ranking = useMemo(
    () =>
      [...metricas].sort((a, b) => {
        if (b.aprovados !== a.aprovados) return b.aprovados - a.aprovados;
        if (a.reprovados !== b.reprovados) return a.reprovados - b.reprovados;
        const ta = a.tempoMedio ?? Infinity;
        const tb = b.tempoMedio ?? Infinity;
        return ta - tb;
      }),
    [metricas]
  );

  const rankMap = useMemo(() => {
    const map = new Map<string, number>();
    ranking.forEach((m, i) => map.set(m.nome, i + 1));
    return map;
  }, [ranking]);

  const maxAprovados = Math.max(1, ...metricas.map((m) => m.aprovados));

  const totais = useMemo(
    () => ({
      ativos: metricas.reduce((s, m) => s + m.ativos, 0),
      aprovados: metricas.reduce((s, m) => s + m.aprovados, 0),
      reprovados: metricas.reduce((s, m) => s + m.reprovados, 0),
    }),
    [metricas]
  );

  return (
    <div className="space-y-6">
      {/* Header + filtro de período */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios por Analista</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Desempenho da equipe no período selecionado
          </p>
        </div>

        <div className="card !p-4 flex items-end gap-3 shrink-0">
          <div className="flex flex-col gap-1">
            <label className="label !mb-0">De</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="input-field !w-auto"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="label !mb-0">Até</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="input-field !w-auto"
            />
          </div>
        </div>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="section-title">Processos Ativos</p>
          <p className="text-4xl font-bold text-gray-900">{totais.ativos}</p>
          <p className="text-xs text-gray-400 mt-1">em andamento</p>
        </div>
        <div className="card text-center">
          <p className="section-title">Aprovados pelo Cliente</p>
          <p className="text-4xl font-bold text-green-600">{totais.aprovados}</p>
          <p className="text-xs text-gray-400 mt-1">no período</p>
        </div>
        <div className="card text-center">
          <p className="section-title">Reprovados</p>
          <p className="text-4xl font-bold text-red-500">{totais.reprovados}</p>
          <p className="text-xs text-gray-400 mt-1">no período</p>
        </div>
      </div>

      {/* Ranking visual */}
      <div className="card">
        <p className="section-title">Ranking de Performance</p>
        <div className="space-y-4">
          {ranking.map((analista, idx) => {
            const pos = idx + 1;
            const pct = Math.round((analista.aprovados / maxAprovados) * 100);
            const barColor =
              pos === 1
                ? "linear-gradient(90deg, #FFB800, #FFD700)"
                : pos === 2
                ? "linear-gradient(90deg, #9ca3af, #d1d5db)"
                : pos === 3
                ? "linear-gradient(90deg, #b45309, #d97706)"
                : "linear-gradient(90deg, #6b7280, #9ca3af)";

            return (
              <div key={analista.nome} className="flex items-center gap-3">
                <BadgeRank pos={pos} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-800">
                      {analista.nome}
                    </span>
                    <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                      <span className="text-green-600 font-semibold">
                        {analista.aprovados} aprov.
                      </span>
                      <span className="text-red-500">{analista.reprovados} reprov.</span>
                      <span className="text-gray-400">{analista.ativos} ativos</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, analista.aprovados > 0 ? 4 : 0)}%`,
                        background: barColor,
                      }}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0 w-16 text-right">
                  {analista.tempoMedio !== null ? `${analista.tempoMedio}d médio` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cards detalhados por analista */}
      <div>
        <p className="section-title">Métricas Detalhadas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricas.map((m) => {
            const pos = rankMap.get(m.nome) ?? 0;
            return (
              <div key={m.nome} className="card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{m.nome}</h3>
                  <ChipRank pos={pos} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{m.ativos}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Ativos</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{m.aprovados}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Aprovados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{m.reprovados}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Reprovados</p>
                  </div>
                </div>

                <div className="border-t border-gray-50 pt-3 text-center">
                  <p className="text-lg font-bold text-gray-700">
                    {m.tempoMedio !== null ? `${m.tempoMedio} dias` : "—"}
                  </p>
                  <p className="text-xs text-gray-400">tempo médio do processo</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
