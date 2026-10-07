"use client";

import { useEffect, useState } from "react";
import ModalContratoMot from "./ModalContratoMot";

interface AvisoVencimentoMot {
  id: string;
  funcionario_id: string;
  titulo: string;
  mensagem: string;
}

// Mesmo mecanismo de PopupAsoPeriodicoHoje.tsx (checagem ao carregar o painel + "marcar
// visto" por dia) — mas calculado em tempo real a partir de funcionarios.data_admissao
// (contratoMotStatus.ts), sem depender de um cron ter rodado antes. Avisa 10 dias antes dos
// vencimentos de 180 (aprovação de continuidade) e 270 dias (limite legal), e continua
// avisando todo dia enquanto o limite de 270 estiver excedido.
//
// Clicar num aviso abre o ModalContratoMot (Prorrogar / Afastamento / Encerrar contrato) em vez de só
// navegar pra ficha. Depois de uma ação, a lista é recarregada uma única vez (sem polling): quem foi
// silenciado sai da lista na hora.
export default function PopupVencimentoContratoMot() {
  const [avisos, setAvisos] = useState<AvisoVencimentoMot[]>([]);
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<AvisoVencimentoMot | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/funcionarios/vencimento-contrato/popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: AvisoVencimentoMot[] = body.data ?? [];
        if (lista.length > 0 && !body.ja_visto) {
          setAvisos(lista);
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
    setAberto(false);
    try {
      await fetch("/api/funcionarios/vencimento-contrato/popup/marcar-visto", { method: "POST" });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  async function recarregarLista() {
    try {
      const res = await fetch("/api/funcionarios/vencimento-contrato/popup");
      if (!res.ok) return;
      const body = await res.json();
      const lista: AvisoVencimentoMot[] = body.data ?? [];
      setAvisos(lista);
      if (lista.length === 0) setAberto(false);
    } catch {
      // silencioso — a lista antiga continua na tela
    }
  }

  const popupJSX = (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-red-400/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-400">
              ⏳ Vencimento{avisos.length > 1 ? "s" : ""} de contrato MOT
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">Prazo de 180/270 dias se aproximando ou já excedido</p>
          </div>
          <button onClick={marcarVisto} className="text-red-400/70 hover:text-red-400 transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {avisos.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelecionado(a)}
              className="w-full text-left flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">⏳</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{a.titulo}</p>
                <p className="text-xs text-gray-600">{a.mensagem}</p>
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

  return (
    <>
      {aberto && popupJSX}
      <ModalContratoMot
        funcionarioId={selecionado?.funcionario_id ?? null}
        nome={selecionado?.titulo ?? ""}
        onClose={() => setSelecionado(null)}
        onAlterado={recarregarLista}
        onVerFicha={marcarVisto}
      />
    </>
  );
}
