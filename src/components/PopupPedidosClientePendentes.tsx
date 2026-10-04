"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROTULO_TIPO_PEDIDO, type TipoPedidoCliente } from "@/lib/pedidosClientePopup";

interface PedidoPendente {
  tipo: TipoPedidoCliente;
  id: string;
  clienteNome: string;
  cargo: string;
  solicitacaoId: string | null;
  vagaId: string | null;
}

const ICONE: Record<TipoPedidoCliente, string> = { alteracao: "✏️", reativacao: "▶️", pausa: "⏸️" };

// Mesmo padrão de PopupIndicacaoDiretaPendente: uma checagem ao carregar o painel (sem polling) e
// "dispensar" por pedido. Quem vê, e de quais tipos de pedido, é decidido inteiramente pela API (lista
// do canal popup de cada evento em Configurações > Avisos); este componente é montado sem prop de role.
export default function PopupPedidosClientePendentes() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<PedidoPendente[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/pedidos-cliente-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: PedidoPendente[] = body.data ?? [];
        if (lista.length > 0 && body.temNovas) {
          setPendentes(lista);
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

  // Fecha o popup e marca como vistos, para este usuário, exatamente os pedidos recebidos. Falha de
  // rede é ignorada: o popup só volta a aparecer no próximo carregamento do painel.
  async function dispensar(itens: { tipo: TipoPedidoCliente; id: string }[]) {
    setAberto(false);
    try {
      await fetch("/api/pedidos-cliente-popup/marcar-visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
    } catch {
      // se falhar, o pop-up volta a aparecer no próximo login — sem problema
    }
  }

  // "Ok, entendi!" e o X: dispensam TODOS os pedidos que estavam sendo mostrados; um pedido novo que
  // chegue depois reabre o popup no próximo carregamento do painel.
  async function marcarVisto() {
    await dispensar(pendentes.map((p: PedidoPendente) => ({ tipo: p.tipo, id: p.id })));
  }

  // Clique no card: leva ao mesmo destino do sino do pedido (a solicitação em /painel/vagas) e marca
  // como visto SÓ o clicado. Os outros listados continuam não vistos e reabrem o popup no próximo
  // carregamento do painel enquanto restar algum pendente. Sem await: não atrasa a navegação.
  function abrirPedido(p: PedidoPendente) {
    void dispensar([{ tipo: p.tipo, id: p.id }]);
    router.push(p.solicitacaoId ? `/painel/vagas?solicitacao=${p.solicitacaoId}` : p.vagaId ? `/painel/vagas/${p.vagaId}` : "/painel/vagas");
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">📨 Pedido{pendentes.length > 1 ? "s" : ""} do cliente</h2>
            <p className="text-xs text-gray-300 mt-0.5">Aguardando a sua decisão</p>
          </div>
          <button onClick={marcarVisto} className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {pendentes.map((p: PedidoPendente) => (
            <button
              key={`${p.tipo}:${p.id}`}
              onClick={() => abrirPedido(p)}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">{ICONE[p.tipo]}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{p.clienteNome}</p>
                <p className="text-xs text-gray-600">
                  {ROTULO_TIPO_PEDIDO[p.tipo]}
                  {p.cargo ? ` · ${p.cargo}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button onClick={marcarVisto} className="btn-primary w-full">
            Ok, entendi!
          </button>
        </div>
      </div>
    </div>
  );
}
