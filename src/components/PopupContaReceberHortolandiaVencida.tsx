"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ContaVencida {
  id: string;
  clienteNome: string;
  numeroNf: string | null;
  valor: number;
  dataVencimento: string;
  diasAtraso: number;
  unidadeNome: string;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelAtraso(dias: number): string {
  if (dias <= 0) return "vence hoje";
  if (dias === 1) return "venceu ontem";
  return `venceu há ${dias} dias`;
}

// Mesmo padrão estrutural de PopupCobrancaVencida.tsx, mas com uma diferença de
// comportamento pedida explicitamente pelo usuário: o "visto" aqui é PERMANENTE (ver
// /api/faturamento-hortolandia/vencidas-popup), não por dia — um lançamento dispensado
// não reabre o popup amanhã, mesmo que continue vencido e pendente. Só diretoria/superuser
// chega a montar este componente (checarAcessoFaturamentoHortolandia na própria rota já
// devolve lista vazia pra quem não tem acesso ao módulo).
export default function PopupContaReceberHortolandiaVencida() {
  const router = useRouter();
  const [vencidas, setVencidas] = useState<ContaVencida[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/faturamento-hortolandia/vencidas-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: ContaVencida[] = body.data ?? [];
        if (lista.length > 0) {
          setVencidas(lista);
          setAberto(true);
        }
      } catch {
        // silencioso — pop-up não deve travar o carregamento do painel
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function marcarVisto() {
    const ids = vencidas.map((c) => c.id);
    setAberto(false);
    try {
      await fetch("/api/faturamento-hortolandia/vencidas-popup/marcar-visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  function abrirConta(id: string) {
    marcarVisto();
    router.push(`/painel/faturamento-hortolandia?abrir=${id}`);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-red-400/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-400">
              ⚠️ Lançamento{vencidas.length > 1 ? "s" : ""} vencido{vencidas.length > 1 ? "s" : ""}
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">Faturamento Unidades — contas a receber vencidas, ainda não pagas</p>
          </div>
          <button
            onClick={marcarVisto}
            className="text-red-400/70 hover:text-red-400 transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {vencidas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirConta(c.id)}
              className="w-full text-left flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">⚠️</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {c.clienteNome} — {labelAtraso(c.diasAtraso)}
                </p>
                <p className="text-xs text-gray-600">
                  {c.unidadeNome} · {formatarMoeda(c.valor)}
                  {c.numeroNf ? ` · NF ${c.numeroNf}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
