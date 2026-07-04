"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { IndicadoresVaga, NivelAlerta } from "@/lib/indicadoresVaga";

const CORES_ALERTA: Record<NivelAlerta, { barra: string; badgeBg: string; badgeText: string }> = {
  vermelho: { barra: "#E24B4A", badgeBg: "#FCEBEB", badgeText: "#E24B4A" },
  amarelo: { barra: "#BA7517", badgeBg: "#FAEEDA", badgeText: "#BA7517" },
  verde: { barra: "#3B6D11", badgeBg: "#EAF3DE", badgeText: "#3B6D11" },
};

export default function PainelVagasView() {
  const [vagas, setVagas] = useState<IndicadoresVaga[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/painel/vagas")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar indicadores das vagas.");
        setVagas(json.data ?? []);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro de conexão."));
  }, []);

  if (erro) {
    return (
      <div className="card text-center py-12 text-sm" style={{ color: "#E24B4A" }}>
        {erro}
      </div>
    );
  }

  if (vagas === null) {
    return (
      <div className="card text-center py-12 text-gray-400 text-sm">
        Carregando...
      </div>
    );
  }

  if (vagas.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-400">
        <p className="font-medium">Nenhuma vaga aberta no momento</p>
      </div>
    );
  }

  const precisamAtencao = vagas.filter(
    (v) => v.nivel_alerta === "vermelho" || v.nivel_alerta === "amarelo"
  ).length;

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-4">
        {precisamAtencao} vagas precisam de atenção
      </p>

      <div className="space-y-3">
        {vagas.map((v) => (
          <VagaIndicadorCard key={v.vaga_id} vaga={v} />
        ))}
      </div>
    </div>
  );
}

function VagaIndicadorCard({ vaga }: { vaga: IndicadoresVaga }) {
  const cores = CORES_ALERTA[vaga.nivel_alerta];

  return (
    <div
      className="card flex flex-wrap items-center gap-4"
      style={{ borderLeft: `4px solid ${cores.barra}`, paddingLeft: 16 }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{vaga.titulo}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {vaga.cliente_nome ?? "Sem cliente vinculado"}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
          <span>{vaga.dias_aberta} dias aberta</span>
          <span>{vaga.posicoes_preenchidas} / {vaga.posicoes_total} preenchidas</span>
          <span>{vaga.em_processo} em processo</span>
        </div>
      </div>

      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
        style={{ backgroundColor: cores.badgeBg, color: cores.badgeText }}
      >
        {vaga.dias_sem_movimento !== null && vaga.nivel_alerta === "vermelho"
          ? `Parada ${vaga.dias_sem_movimento}d`
          : vaga.nivel_alerta === "amarelo"
          ? `Parada ${vaga.dias_sem_movimento}d`
          : "Em dia"}
      </span>

      <Link href={`/painel/vagas/${vaga.vaga_id}`} className="btn-outline shrink-0 text-sm">
        Abrir
      </Link>
    </div>
  );
}
