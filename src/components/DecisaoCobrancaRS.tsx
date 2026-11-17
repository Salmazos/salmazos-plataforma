"use client";

import { useState } from "react";
import { textoConfirmarNaoGerar } from "@/lib/decisaoCobrancaRS";

// Pergunta "Gerar cobrança de R&S para esta contratação?". "Sim" vem primeiro e é verde; "Não" é vermelho e só vale depois de uma
// confirmação que mostra o valor do fee. A escolha só chega ao pai (onChange) depois disso — antes, um clique solto gravava "não gerar".
// Caso real (17/11): cobrança não gerada sem que quem finalizou soubesse dizer que tinha escolhido isso.

interface Props {
  valor: boolean | null;
  onChange: (v: boolean | null) => void;
  fee: number | null;
  percentual: number | null;
  mostrarErro: boolean;
  // Só para o teste de renderização (SSR não clica): abre já no passo de confirmação.
  confirmandoInicial?: boolean;
}

export default function DecisaoCobrancaRS({ valor, onChange, fee, percentual, mostrarErro, confirmandoInicial = false }: Props) {
  const [confirmando, setConfirmando] = useState(confirmandoInicial);

  return (
    <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Gerar cobrança de R&S para esta contratação? *</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setConfirmando(false); onChange(true); }}
          className="text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors"
          style={valor === true ? { background: "#16A34A", color: "#fff", border: "2px solid #166534" } : { background: "#fff", color: "#166534", border: "2px solid #16A34A" }}
        >
          Sim, gerar cobrança
        </button>
        <button
          type="button"
          onClick={() => { onChange(null); setConfirmando(true); }}
          className="text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors"
          style={valor === false ? { background: "#DC2626", color: "#fff", border: "2px solid #991B1B" } : { background: "#fff", color: "#B91C1C", border: "2px solid #FCA5A5" }}
        >
          Não gerar
        </button>
      </div>

      {confirmando && valor !== false && (
        <div role="alertdialog" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "10px 12px", marginTop: 10 }}>
          <p style={{ fontSize: 13, color: "#991B1B", margin: "0 0 8px", fontWeight: 600 }}>{textoConfirmarNaoGerar({ fee, percentual })}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>Voltar</button>
            <button
              type="button"
              onClick={() => { onChange(false); setConfirmando(false); }}
              style={{ padding: "5px 12px", fontSize: 12, background: "#DC2626", color: "#fff", borderRadius: 8, fontWeight: 700 }}
            >
              Confirmar: não gerar
            </button>
          </div>
        </div>
      )}

      {valor === false && (
        <p style={{ fontSize: 12, color: "#991B1B", margin: "8px 0 0" }}>
          Decisão registrada: <strong>não gerar cobrança</strong>. O botão final será &quot;Contratar sem cobrança&quot;.
        </p>
      )}
      {mostrarErro && valor === null && !confirmando && <p className="text-red-500 text-xs mt-1">Responda se deve gerar cobrança de R&S.</p>}
    </div>
  );
}
