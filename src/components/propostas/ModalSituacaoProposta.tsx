"use client";

import React, { useRef, useState } from "react";
import { ROTULO_MOTIVO_PERDA } from "@/lib/comercialRotulos";
import { Aviso, btnPerigo, btnPrimario, btnSecundario, inputStyle, labelStyle, Modal } from "@/components/propostas/propostasUi";

export type AcaoSituacao = "em_negociacao" | "aceita" | "recusada" | "cancelada";

const TEXTOS: Record<AcaoSituacao, { titulo: string; explicacao: string; botao: string }> = {
  em_negociacao: { titulo: "Em negociação", explicacao: "A proposta passa para Em negociação. Se a oportunidade do Funil estiver em Proposta enviada, ela acompanha para Negociação. O lembrete de follow-up continua.", botao: "Marcar em negociação" },
  aceita: { titulo: "Proposta aceita", explicacao: "A oportunidade do Funil passa para Venda fechada e o lembrete de follow-up desta proposta é cancelado.", botao: "Marcar como aceita" },
  recusada: { titulo: "Proposta recusada", explicacao: "A oportunidade do Funil passa para Não desta vez, com um lembrete para reconectar em 90 dias, e o follow-up desta proposta é cancelado.", botao: "Marcar como recusada" },
  cancelada: { titulo: "Cancelar proposta", explicacao: "A proposta é cancelada e não poderá mais ser alterada. O Funil não é alterado; só o lembrete de follow-up desta proposta é cancelado.", botao: "Cancelar proposta" },
};

interface Props {
  acao: AcaoSituacao;
  onClose: () => void;
  onConfirmar: (dados: { motivo_perda_categoria?: string; motivo_perda?: string; observacao?: string }) => Promise<string | null>;
}

export default function ModalSituacaoProposta({ acao, onClose, onConfirmar }: Props) {
  const t = TEXTOS[acao];
  const [categoria, setCategoria] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const emAndamento = useRef(false);

  async function confirmar() {
    if (emAndamento.current) return;
    if (acao === "recusada") {
      if (!categoria) { setErro("Escolha o motivo de a proposta não ter sido aceita."); return; }
      if (categoria === "outro" && !motivo.trim()) { setErro("Descreva o motivo, já que você escolheu \"Outro motivo\"."); return; }
    }
    emAndamento.current = true;
    setEnviando(true);
    setErro("");
    const msg = await onConfirmar({
      ...(acao === "recusada" ? { motivo_perda_categoria: categoria, motivo_perda: motivo.trim() || undefined } : {}),
      observacao: observacao.trim() || undefined,
    });
    if (msg) { setErro(msg); setEnviando(false); emAndamento.current = false; }
  }

  return (
    <Modal titulo={t.titulo} onClose={onClose} bloqueado={enviando}>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151" }}>{t.explicacao}</p>
      {acao === "recusada" && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Motivo *</label>
          <select style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Escolha o motivo…</option>
            {Object.entries(ROTULO_MOTIVO_PERDA).map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{rotulo}</option>)}
          </select>
          {categoria === "outro" && <textarea style={{ ...inputStyle, marginTop: 8, minHeight: 70 }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Descreva o motivo" maxLength={500} />}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Observação (opcional)</label>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} />
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btnSecundario} onClick={onClose} disabled={enviando}>Voltar</button>
        <button style={{ ...(acao === "cancelada" || acao === "recusada" ? btnPerigo : btnPrimario), opacity: enviando ? 0.6 : 1 }} onClick={confirmar} disabled={enviando}>{enviando ? "Salvando…" : t.botao}</button>
      </div>
    </Modal>
  );
}
