"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Indicacao {
  id: string;
  candidato_nome: string;
  vaga_id: string;
  vaga_titulo: string | null;
  status: string;
  motivo_recusa: string | null;
  decidido_em: string | null;
  created_at: string;
}

// Rótulos de negócio (os valores de status do banco/API seguem pendente/aprovada/recusada): o candidato
// já foi aprovado pelo cliente; a Salmazos só confere os dados de registro.
const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  pendente: { label: "Em conferência", bg: "bg-yellow-100", text: "text-yellow-800" },
  aprovada: { label: "Registrada", bg: "bg-green-100", text: "text-green-800" },
  recusada: { label: "Correção solicitada", bg: "bg-amber-100", text: "text-amber-900" },
};

function formatarDataPT(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function MinhasIndicacoesPage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

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
              </div>
            </div>
            {ind.status === "recusada" && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                <p className="text-xs font-bold text-amber-900">O que precisa ser corrigido:</p>
                {/* Texto puro (React escapa) com as quebras de linha preservadas. */}
                <p className="text-sm text-amber-950 mt-1" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                  {ind.motivo_recusa?.trim() || "A equipe Salmazos solicitou a correção de dados de registro. Entre em contato para saber quais."}
                </p>
                <p className="text-xs text-amber-900 mt-2">
                  Faça uma nova indicação com os dados corrigidos.{" "}
                  <Link href="/portal/indicar-candidato" className="font-semibold underline underline-offset-2">
                    Indicar candidato →
                  </Link>
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
