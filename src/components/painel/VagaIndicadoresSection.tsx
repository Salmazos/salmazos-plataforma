"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { calcularIndicadoresVaga, ETAPAS_PIPELINE_ATIVO } from "@/lib/indicadoresVaga";
import type { Vaga, CandidatoVaga } from "@/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const CORES_ALERTA: Record<"vermelho" | "amarelo", { bg: string; text: string }> = {
  vermelho: { bg: "#FCEBEB", text: "#A32D2D" },
  amarelo: { bg: "#FAEEDA", text: "#854F0B" },
};

const ETAPAS_FUNIL: { etapa: string; label: string }[] = [
  { etapa: "triagem", label: "Triagem" },
  { etapa: "entrevista_salmazos", label: "Entrevista Salmazos" },
  { etapa: "entrevista_cliente", label: "Entrevista Cliente" },
  { etapa: "aprovado_cliente", label: "Retorno Cliente" },
  { etapa: "contratado", label: "Contratado" },
];

const LABEL_ETAPA_ATIVA: Record<string, string> = {
  triagem: "Triagem",
  entrevista_rh: "Entrevista RH",
  entrevista_salmazos: "Entrevista Salmazos",
  entrevista_cliente: "Entrevista Cliente",
  aprovado_cliente: "Aprovado pelo Cliente",
};

function diasEntre(inicio: Date, fim: Date): number {
  return Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
}

interface Props {
  vaga: Vaga;
  candidatosVaga: CandidatoVaga[];
}

export default function VagaIndicadoresSection({ vaga, candidatosVaga }: Props) {
  const indicadores = useMemo(() => {
    return calcularIndicadoresVaga(
      {
        id: vaga.id,
        titulo: vaga.titulo,
        slug: "",
        cliente_nome: vaga.clientes?.nome ?? null,
        status: vaga.status,
        created_at: vaga.created_at,
        num_posicoes: vaga.num_posicoes,
      },
      candidatosVaga.map((cv) => ({ etapa: cv.etapa ?? "", updated_at: cv.updated_at }))
    );
  }, [vaga, candidatosVaga]);

  const conversaoTotal =
    candidatosVaga.length > 0
      ? `${((indicadores.posicoes_preenchidas / candidatosVaga.length) * 100).toFixed(1)}%`
      : "—";

  const contagemFunil = useMemo(
    () => ETAPAS_FUNIL.map((e) => candidatosVaga.filter((cv) => cv.etapa === e.etapa).length),
    [candidatosVaga]
  );

  const chartData = {
    labels: ETAPAS_FUNIL.map((e) => e.label),
    datasets: [
      {
        data: contagemFunil,
        backgroundColor: "#7F77DD",
        borderRadius: 4,
        barPercentage: 0.6,
      },
    ],
  };

  const chartOptions = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
      y: { reverse: true },
    },
  };

  const candidatosParados = useMemo(() => {
    const agora = new Date();
    return candidatosVaga
      .filter((cv) => cv.etapa && ETAPAS_PIPELINE_ATIVO.includes(cv.etapa))
      .map((cv) => ({
        cv,
        diasParado: diasEntre(new Date(cv.updated_at), agora),
      }))
      .sort((a, b) => b.diasParado - a.diasParado)
      .slice(0, 5);
  }, [candidatosVaga]);

  return (
    <div className="mb-6 pb-6 border-b border-gray-200">
      {(indicadores.nivel_alerta === "vermelho" || indicadores.nivel_alerta === "amarelo") && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 mb-4 text-sm font-semibold"
          style={{
            backgroundColor: CORES_ALERTA[indicadores.nivel_alerta].bg,
            color: CORES_ALERTA[indicadores.nivel_alerta].text,
          }}
        >
          {"⚠️"} Sem movimento há {indicadores.dias_sem_movimento} dias
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-gray-900">{indicadores.dias_aberta}</p>
          <p className="text-xs text-gray-500 mt-1">Dias em aberto</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-[#FFD700]">
            {indicadores.posicoes_preenchidas} / {indicadores.posicoes_total}
          </p>
          <p className="text-xs text-gray-500 mt-1">Posições</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-[#7F77DD]">{indicadores.em_processo}</p>
          <p className="text-xs text-gray-500 mt-1">Em processo</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-gray-900">{conversaoTotal}</p>
          <p className="text-xs text-gray-500 mt-1">Conversão total</p>
        </div>
      </div>

      <div className="card mb-6">
        <p className="section-title mb-4">Funil da vaga</p>
        <div style={{ height: ETAPAS_FUNIL.length * 40 }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {candidatosParados.length > 0 && (
        <div className="card">
          <p className="section-title mb-4">Candidatos parados</p>
          <ul className="space-y-3">
            {candidatosParados.map(({ cv, diasParado }) => (
              <li key={cv.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-black text-[#FFD700] flex items-center justify-center text-xs font-bold shrink-0">
                  {cv.candidatos?.nome_completo?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {cv.candidatos?.nome_completo ?? "Candidato removido"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {LABEL_ETAPA_ATIVA[cv.etapa ?? ""] ?? cv.etapa} · {diasParado} dias parado
                  </p>
                </div>
                <Link
                  href={`/painel/candidato/${cv.candidato_id}`}
                  className="text-xs text-[#1D6FA4] hover:underline shrink-0"
                >
                  Ver perfil
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
