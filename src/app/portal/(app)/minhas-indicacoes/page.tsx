"use client";

import { useState, useEffect, useCallback } from "react";
import ModalEditarIndicacaoCliente from "@/components/ModalEditarIndicacaoCliente";

interface Indicacao {
  id: string;
  candidato_nome: string;
  vaga_id: string;
  vaga_titulo: string | null;
  status: string;
  motivo_recusa: string | null;
  decidido_em: string | null;
  created_at: string;
  // Calculado no servidor; o PATCH revalida sempre.
  pode_editar: boolean;
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Em análise", bg: "bg-yellow-100", text: "text-yellow-800" },
  aprovada: { label: "Aprovada", bg: "bg-green-100", text: "text-green-800" },
  recusada: { label: "Recusada", bg: "bg-red-100", text: "text-red-800" },
};

function formatarDataPT(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function MinhasIndicacoesPage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/minhas-indicacoes");
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error || "Erro ao carregar indicações.");
        return;
      }
      setIndicacoes(json.data ?? []);
    } catch (e) {
      console.error("Erro:", e);
      setErro("Erro ao carregar indicações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-sm">{erro}</p>
      </div>
    );
  }

  if (indicacoes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-3">📋</p>
        <p className="text-gray-500 text-sm font-medium">Você ainda não indicou nenhum candidato.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Minhas Indicações</h1>
      {aviso && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{aviso}</p>}
      {indicacoes.map((ind) => {
        const statusInfo = STATUS_BADGE[ind.status] || { label: ind.status, bg: "bg-gray-100", text: "text-gray-800" };
        return (
          <div key={ind.id} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{ind.candidato_nome}</p>
                <p className="text-gray-600 text-xs mt-1">{ind.vaga_titulo || "Vaga não disponível"}</p>
                <p className="text-gray-400 text-xs mt-2">Enviado em {formatarDataPT(ind.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                  {statusInfo.label}
                </span>
                {ind.status === "recusada" && ind.motivo_recusa && (
                  <p className="text-gray-600 text-xs text-right max-w-xs">{ind.motivo_recusa}</p>
                )}
                {ind.pode_editar ? (
                  <button onClick={() => { setAviso(""); setEditandoId(ind.id); }} className="text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg px-3 py-1 hover:bg-gray-50">
                    Editar
                  </button>
                ) : (
                  ind.status === "aprovada" && <p className="text-gray-400 text-xs text-right max-w-xs">Já em andamento; fale com a Salmazos.</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {editandoId && (
        <ModalEditarIndicacaoCliente
          indicacaoId={editandoId}
          onClose={() => setEditandoId(null)}
          onSalvo={(mensagem) => {
            setEditandoId(null);
            setAviso(mensagem);
            carregar();
          }}
        />
      )}
    </div>
  );
}
