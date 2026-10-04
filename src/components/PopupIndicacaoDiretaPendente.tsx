"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface IndicacaoPendente {
  id: string;
  clienteNome: string;
  candidatoNome: string;
  vagaTitulo: string | null;
  createdAt: string;
}

// Mesmo padrão de PopupSolicitacaoVagaPendente: uma checagem ao carregar o painel (sem polling) e
// "dispensar" por indicação. Quem vê é decidido inteiramente pela API (lista do canal popup do
// evento indicacao_candidato_recebida em Configurações > Avisos); este componente é montado sem
// prop de role.
export default function PopupIndicacaoDiretaPendente() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<IndicacaoPendente[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/indicacoes-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: IndicacaoPendente[] = body.data ?? [];
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

  // Fecha o popup e marca como vistas, para este usuário, exatamente os ids recebidos. Falha de
  // rede é ignorada: o popup só volta a aparecer no próximo carregamento do painel.
  async function dispensar(ids: string[]) {
    setAberto(false);
    try {
      await fetch("/api/indicacoes-popup/marcar-visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // se falhar, o pop-up volta a aparecer no próximo login — sem problema
    }
  }

  // "Ok, entendi!" e o X: dispensam TODAS as indicações que estavam sendo mostradas; uma nova que
  // chegue depois reabre o popup no próximo login.
  async function marcarVisto() {
    await dispensar(pendentes.map((p: IndicacaoPendente) => p.id));
  }

  // Clique no card: abre o modal de indicações já focado nesta indicação (mesmo destino do clique
  // no sino, ver NotificacoesProvider) e marca como vista SÓ a clicada. As outras indicações
  // listadas continuam não vistas: geram temNovas no próximo carregamento do painel e o popup
  // reabre enquanto restar alguma não vista e pendente. Sem await: não atrasa a navegação.
  function abrirIndicacao(id: string) {
    void dispensar([id]);
    router.push(`/painel/vagas?indicacao=${id}`);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">
              🧑‍💼 Indicaç{pendentes.length > 1 ? "ões" : "ão"} direta{pendentes.length > 1 ? "s" : ""} de candidato
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">Aguardando a sua conferência</p>
          </div>
          <button onClick={marcarVisto} className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {pendentes.map((p: IndicacaoPendente) => (
            <button
              key={p.id}
              onClick={() => abrirIndicacao(p.id)}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">🧑‍💼</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{p.candidatoNome}</p>
                <p className="text-xs text-gray-600">
                  {p.clienteNome}
                  {p.vagaTitulo ? ` · ${p.vagaTitulo}` : ""}
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
