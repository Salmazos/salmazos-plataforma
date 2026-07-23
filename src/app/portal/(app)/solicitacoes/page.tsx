"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Solicitacao {
  id: string;
  cargo: string;
  tipo_servico: string;
  num_posicoes: number | null;
  cidade: string | null;
  estado: string | null;
  status: string | null;
  motivo_recusa: string | null;
  vaga_id: string | null;
  vaga_slug: string | null;
  created_at: string;
}

const TIPO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  recrutamento_selecao: { label: "R&S", bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria: { label: "MOT", bg: "#FFD700", color: "#000" },
  terceirizacao: { label: "Terceirização", bg: "#1D9E75", color: "#fff" },
};

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pendente: { label: "Pendente", bg: "#FEF3C7", color: "#92400E" },
  aprovada: { label: "Aprovada", bg: "#DCFCE7", color: "#166534" },
  recusada: { label: "Recusada", bg: "#FEE2E2", color: "#991B1B" },
};

export default function MinhasSolicitacoesPage() {
  const [loading, setLoading] = useState(true);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "minhas">("todas");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/solicitacoes?filtro=${filtro}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setErro(json.error); return; }
        setSolicitacoes(json.data ?? []);
      })
      .catch(() => setErro("Erro ao carregar solicitações."))
      .finally(() => setLoading(false));
  }, [filtro]);

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Minhas Solicitações</h1>
      <p className="text-xs text-gray-400 mb-4">Acompanhe o status das vagas que você solicitou</p>

      <div className="inline-flex bg-gray-100 rounded-full p-1 mb-6">
        {([
          { value: "todas", label: "Todas" },
          { value: "minhas", label: "Minhas solicitações" },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFiltro(opt.value)}
            className="text-sm font-semibold px-4 py-1.5 rounded-full transition-colors"
            style={
              filtro === opt.value
                ? { backgroundColor: "#000", color: "#FFD700" }
                : { color: "#6B7280" }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
          {erro}
        </div>
      ) : solicitacoes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">
            {filtro === "minhas"
              ? "Você ainda não enviou nenhuma solicitação de vaga."
              : "Nenhuma solicitação de vaga foi enviada pela sua empresa ainda."}
          </p>
          <Link
            href="/portal/solicitar-vaga"
            className="inline-block mt-4 px-6 py-2.5 bg-black text-[#FFD700] rounded-xl font-semibold text-sm"
          >
            Solicitar Nova Vaga
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitacoes.map((s) => {
            const tipoBadge = TIPO_BADGE[s.tipo_servico] ?? { label: s.tipo_servico, bg: "#6B7280", color: "#fff" };
            const statusBadge = STATUS_BADGE[s.status ?? "pendente"] ?? STATUS_BADGE.pendente;
            return (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-gray-900 text-base">{s.cargo}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: tipoBadge.bg, color: tipoBadge.color }}>
                        {tipoBadge.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {[s.cidade, s.estado].filter(Boolean).join("/") || "—"}
                        {s.num_posicoes ? ` · ${s.num_posicoes}x` : ""}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full shrink-0" style={{ backgroundColor: statusBadge.bg, color: statusBadge.color }}>
                    {statusBadge.label}
                  </span>
                </div>

                <p className="text-[10px] text-gray-300 mt-3">
                  Enviada em {new Date(s.created_at).toLocaleDateString("pt-BR")}
                </p>

                {s.status === "recusada" && s.motivo_recusa && (
                  <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-red-700 uppercase mb-1">Motivo</p>
                    <p className="text-xs text-red-700">{s.motivo_recusa}</p>
                  </div>
                )}

                {s.status === "aprovada" && s.vaga_slug && (
                  <Link
                    href={`/vagas/${s.vaga_slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Ver vaga publicada →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
