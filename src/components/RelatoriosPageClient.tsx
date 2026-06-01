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
  cliente_id: string;
  status: StatusEncaminhamento;
  created_at: string;
  updated_at: string;
}

interface ClienteData {
  id: string;
  nome: string;
  responsavel_comercial: string | null;
  ativo: boolean;
}

interface MetricasAnalista {
  nome: string;
  ativos: number;
  aprovados: number;
  reprovados: number;
  tempoMedio: number | null;
}

interface MetricasCliente {
  id: string;
  nome: string;
  responsavelComercial: string | null;
  totalEncaminhados: number;
  aprovados: number;
  reprovados: number;
  ativos: number;
  taxaAprovacao: number | null;
  tempoMedioDecisao: number | null;
  ultimoEncaminhamento: string | null;
  inativo: boolean;
}

interface Props {
  candidatos: CandidatoData[];
  encaminhamentos: EncaminhamentoData[];
  clientes: ClienteData[];
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

function calcularMetricasCliente(
  clientes: ClienteData[],
  encFiltrados: EncaminhamentoData[],
  todosEnc: EncaminhamentoData[]
): MetricasCliente[] {
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const encPorCliente = new Map<string, EncaminhamentoData[]>();
  encFiltrados.forEach((e) => {
    const lista = encPorCliente.get(e.cliente_id) ?? [];
    lista.push(e);
    encPorCliente.set(e.cliente_id, lista);
  });

  const ultimoPorCliente = new Map<string, string>();
  todosEnc.forEach((e) => {
    const atual = ultimoPorCliente.get(e.cliente_id);
    if (!atual || e.created_at > atual) ultimoPorCliente.set(e.cliente_id, e.created_at);
  });

  return clientes
    .filter((c) => encPorCliente.has(c.id))
    .map((cliente) => {
      const encs = encPorCliente.get(cliente.id)!;

      const totalEncaminhados = encs.length;
      const aprovados = encs.filter((e) => e.status === "aprovado").length;
      const reprovados = encs.filter((e) => e.status === "reprovado").length;
      const ativos = encs.filter((e) => e.status === "aguardando").length;

      const taxaAprovacao =
        totalEncaminhados > 0 ? Math.round((aprovados / totalEncaminhados) * 100) : null;

      const encerrados = encs.filter(
        (e) => e.status === "aprovado" || e.status === "reprovado" || e.status === "desistiu"
      );
      let tempoMedioDecisao: number | null = null;
      if (encerrados.length > 0) {
        const total = encerrados.reduce((soma, e) => {
          const diff =
            new Date(e.updated_at).getTime() - new Date(e.created_at).getTime();
          return soma + Math.max(0, diff) / (1000 * 60 * 60 * 24);
        }, 0);
        tempoMedioDecisao = Math.round(total / encerrados.length);
      }

      const ultimoEnc = ultimoPorCliente.get(cliente.id) ?? null;
      const inativo = !ultimoEnc || new Date(ultimoEnc) < trintaDiasAtras;

      return {
        id: cliente.id,
        nome: cliente.nome,
        responsavelComercial: cliente.responsavel_comercial,
        totalEncaminhados,
        aprovados,
        reprovados,
        ativos,
        taxaAprovacao,
        tempoMedioDecisao,
        ultimoEncaminhamento: ultimoEnc,
        inativo,
      };
    })
    .sort((a, b) => b.totalEncaminhados - a.totalEncaminhados);
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

function TaxaBadge({ taxa }: { taxa: number }) {
  const color =
    taxa >= 50 ? "text-green-600" : taxa >= 25 ? "text-amber-500" : "text-red-500";
  return <span className={`font-semibold ${color}`}>{taxa}%</span>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="text-[#FFB800] text-xs select-none">
      {open ? "▼︎" : "▶︎"}
    </span>
  );
}

export default function RelatoriosPageClient({ candidatos, encaminhamentos, clientes }: Props) {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const hojeStr = hoje.toISOString().split("T")[0];

  const [dataInicio, setDataInicio] = useState(inicioMes);
  const [dataFim, setDataFim] = useState(hojeStr);

  const [showRanking, setShowRanking] = useState(false);
  const [showMetricas, setShowMetricas] = useState(false);
  const [showClientes, setShowClientes] = useState(false);
  const [showCarteira, setShowCarteira] = useState(false);
  const [selectedResponsavel, setSelectedResponsavel] = useState<string | null>(null);

  const candidatoMap = useMemo(() => {
    const map = new Map<string, CandidatoData>();
    candidatos.forEach((c) => map.set(c.id, c));
    return map;
  }, [candidatos]);

  const { candidatosFiltrados, encFiltrados } = useMemo(() => {
    const inicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
    const fim = dataFim ? new Date(dataFim + "T23:59:59") : null;

    const candidatosFiltrados = candidatos.filter((c) => {
      const dt = new Date(c.created_at);
      if (inicio && dt < inicio) return false;
      if (fim && dt > fim) return false;
      return true;
    });

    const encFiltrados = encaminhamentos.filter((e) => {
      const dt = new Date(e.created_at);
      if (inicio && dt < inicio) return false;
      if (fim && dt > fim) return false;
      return true;
    });

    return { candidatosFiltrados, encFiltrados };
  }, [candidatos, encaminhamentos, dataInicio, dataFim]);

  const metricas = useMemo<MetricasAnalista[]>(
    () =>
      ANALISTAS.map((nome) =>
        calcularMetricasAnalista(nome, candidatosFiltrados, encaminhamentos, candidatoMap)
      ),
    [candidatosFiltrados, encaminhamentos, candidatoMap]
  );

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

  const metricasCliente = useMemo(
    () => calcularMetricasCliente(clientes, encFiltrados, encaminhamentos),
    [clientes, encFiltrados, encaminhamentos]
  );

  const carteiraResponsaveis = useMemo(() => {
    const encPorCliente = new Map<string, { total: number; aprovados: number; reprovados: number }>();
    encaminhamentos.forEach((e) => {
      const s = encPorCliente.get(e.cliente_id) ?? { total: 0, aprovados: 0, reprovados: 0 };
      s.total += 1;
      if (e.status === "aprovado") s.aprovados += 1;
      if (e.status === "reprovado") s.reprovados += 1;
      encPorCliente.set(e.cliente_id, s);
    });

    const responsavelMap = new Map<string, { id: string; nome: string; ativo: boolean; totalEnc: number; aprovados: number; reprovados: number; taxaAprovacao: number | null }[]>(
      ANALISTAS.map((nome) => [nome, []])
    );

    clientes.forEach((c) => {
      if (!c.responsavel_comercial || !responsavelMap.has(c.responsavel_comercial)) return;
      const s = encPorCliente.get(c.id) ?? { total: 0, aprovados: 0, reprovados: 0 };
      responsavelMap.get(c.responsavel_comercial)!.push({
        id: c.id,
        nome: c.nome,
        ativo: c.ativo,
        totalEnc: s.total,
        aprovados: s.aprovados,
        reprovados: s.reprovados,
        taxaAprovacao: s.total > 0 ? Math.round((s.aprovados / s.total) * 100) : null,
      });
    });

    return Array.from(responsavelMap.entries())
      .map(([nome, lista]) => ({
        nome,
        clientes: lista.sort((a, b) => a.nome.localeCompare(b.nome)),
      }))
      .sort((a, b) => b.clientes.length - a.clientes.length);
  }, [clientes, encaminhamentos]);

  return (
    <div className="space-y-6">
      {/* Header + filtro de período */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
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

      {/* Cards de totais — sempre visíveis */}
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

      {/* Ranking de Performance — colapsável */}
      <div className="card !p-0 overflow-hidden">
        <button
          onClick={() => setShowRanking((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left ${showRanking ? "border-b border-gray-100" : ""}`}
        >
          <span className="section-title !mb-0">Ranking de Performance — Analistas</span>
          <Chevron open={showRanking} />
        </button>
        {showRanking && (
          <div className="p-4 space-y-4">
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
        )}
      </div>

      {/* Métricas Detalhadas por Analista — colapsável */}
      <div className="card !p-0 overflow-hidden">
        <button
          onClick={() => setShowMetricas((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left ${showMetricas ? "border-b border-gray-100" : ""}`}
        >
          <span className="section-title !mb-0">Métricas Detalhadas por Analista</span>
          <Chevron open={showMetricas} />
        </button>
        {showMetricas && (
          <div className="p-4">
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
        )}
      </div>

      {/* Indicadores por Cliente — colapsável */}
      <div className="card !p-0 overflow-hidden">
        <button
          onClick={() => setShowClientes((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left ${showClientes ? "border-b border-gray-100" : ""}`}
        >
          <div>
            <span className="section-title !mb-0">Indicadores por Cliente</span>
            <p className="text-xs text-gray-400 mt-0.5">
              {metricasCliente.length} cliente{metricasCliente.length !== 1 ? "s" : ""} no período · inatividade baseada nos últimos 30 dias
            </p>
          </div>
          <Chevron open={showClientes} />
        </button>
        {showClientes && (
          <>
            {metricasCliente.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                Nenhum encaminhamento registrado no período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Cliente
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Responsável
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Enc.
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Aprovados
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Taxa
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Reprov.
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Ativos
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Tempo médio
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Último enc.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {metricasCliente.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{c.nome}</span>
                            {c.inativo && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium leading-none">
                                inativo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {c.responsavelComercial ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-800">
                          {c.totalEncaminhados}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-green-600">
                          {c.aprovados}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.taxaAprovacao !== null ? (
                            <TaxaBadge taxa={c.taxaAprovacao} />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-red-500">
                          {c.reprovados > 0 ? c.reprovados : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.ativos > 0 ? (
                            <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-semibold text-xs">
                              {c.ativos}
                            </span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">
                          {c.tempoMedioDecisao !== null ? (
                            `${c.tempoMedioDecisao}d`
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                          {c.ultimoEncaminhamento
                            ? new Date(c.ultimoEncaminhamento).toLocaleDateString("pt-BR")
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Carteira por Responsável Comercial — colapsável */}
      <div className="card !p-0 overflow-hidden">
        <button
          onClick={() => setShowCarteira((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left ${showCarteira ? "border-b border-gray-100" : ""}`}
        >
          <div>
            <span className="section-title !mb-0">Carteira por Responsável Comercial</span>
            <p className="text-xs text-gray-400 mt-0.5">
              {carteiraResponsaveis.filter((r) => r.clientes.length > 0).length} responsáveis com carteira ativa
            </p>
          </div>
          <Chevron open={showCarteira} />
        </button>
        {showCarteira && (
          <div className="p-4 space-y-4">
            {/* Cards de seleção */}
            <div className="flex flex-wrap gap-3">
              {carteiraResponsaveis
                .filter((r) => r.clientes.length > 0)
                .map((r) => {
                  const selected = selectedResponsavel === r.nome;
                  return (
                    <div
                      key={r.nome}
                      role="button"
                      onClick={() => setSelectedResponsavel(selected ? null : r.nome)}
                      style={{
                        border: `2px solid ${selected ? "#FFB800" : "#e5e7eb"}`,
                        background: selected ? "#fffdf0" : "#fff",
                        cursor: "pointer",
                      }}
                      className="rounded-xl px-4 py-3 transition-shadow hover:shadow-sm min-w-[120px]"
                    >
                      <p className="font-bold text-gray-900 text-sm">{r.nome}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.clientes.length} cliente{r.clientes.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  );
                })}
            </div>

            {/* Tabela do responsável selecionado */}
            {carteiraResponsaveis
              .filter((r) => r.nome === selectedResponsavel && r.clientes.length > 0)
              .map((r) => (
                <div key={r.nome} className="border-t border-gray-100 pt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 font-semibold border-b border-gray-100">
                        <th className="text-left pb-2">Cliente</th>
                        <th className="text-center pb-2">Status</th>
                        <th className="text-center pb-2">Enc.</th>
                        <th className="text-center pb-2">Aprovados</th>
                        <th className="text-center pb-2">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.clientes.map((c) => (
                        <tr key={c.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 font-medium text-gray-900">{c.nome}</td>
                          <td className="py-2 text-center">
                            {c.ativo ? (
                              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                Ativo
                              </span>
                            ) : (
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
                                Inativo
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-center text-gray-700">{c.totalEnc}</td>
                          <td className="py-2 text-center font-semibold text-green-600">{c.aprovados}</td>
                          <td className="py-2 text-center">
                            {c.taxaAprovacao !== null ? (
                              <TaxaBadge taxa={c.taxaAprovacao} />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
