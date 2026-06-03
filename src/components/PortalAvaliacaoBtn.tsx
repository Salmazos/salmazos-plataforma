"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  encaminhamentoId: string;
  statusAtual: string;
  feedbackAtual: string;
}

export default function PortalAvaliacaoBtn({ encaminhamentoId, statusAtual, feedbackAtual }: Props) {
  const router = useRouter();
  const [modalAberto, setModalAberto] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState<"aprovado" | "reprovado" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  if (statusAtual === "aprovado" || statusAtual === "reprovado") {
    return (
      <div
        className="rounded-2xl p-6 mb-6 text-center"
        style={{
          backgroundColor: statusAtual === "aprovado" ? "#DCFCE7" : "#FEE2E2",
          color: statusAtual === "aprovado" ? "#166534" : "#991B1B",
        }}
      >
        <p className="font-semibold text-lg">
          {statusAtual === "aprovado" ? "✓ Candidato aprovado" : "✗ Candidato reprovado"}
        </p>
        {feedbackAtual && (
          <p className="text-sm mt-2 opacity-75">"{feedbackAtual}"</p>
        )}
      </div>
    );
  }

  if (statusAtual !== "aguardando") return null;

  const handleAbrir = (acao: "aprovado" | "reprovado") => {
    setAcaoPendente(acao);
    setFeedback("");
    setErro("");
    setModalAberto(true);
  };

  const handleConfirmar = async () => {
    if (!feedback.trim()) {
      setErro("Por favor, adicione um comentário.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/portal/avaliar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encaminhamento_id: encaminhamentoId,
          status: acaoPendente,
          feedback_cliente: feedback,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao salvar avaliação.");
        return;
      }
      setModalAberto(false);
      router.refresh();
    } catch {
      setErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <p className="section-title">Sua avaliação</p>
        <p className="text-sm text-gray-500 mb-4">
          Avalie este candidato para nos ajudar a encontrar o perfil ideal para sua empresa.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handleAbrir("aprovado")}
            className="flex-1 py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#16A34A" }}
          >
            Aprovar candidato
          </button>
          <button
            onClick={() => handleAbrir("reprovado")}
            className="flex-1 py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#DC2626" }}
          >
            Reprovar candidato
          </button>
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {acaoPendente === "aprovado" ? "Aprovar candidato" : "Reprovar candidato"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Adicione um comentário para a equipe Salmazos.
            </p>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder={
                acaoPendente === "aprovado"
                  ? "Ex: Perfil excelente, boa comunicação e experiência relevante..."
                  : "Ex: O candidato não possui a experiência específica que precisamos..."
              }
              className="input-field resize-none w-full"
              autoFocus
            />

            {erro && <p className="text-red-600 text-xs mt-2">{erro}</p>}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setModalAberto(false)}
                className="flex-1 btn-outline py-2.5"
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={salvando || !feedback.trim()}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: acaoPendente === "aprovado" ? "#16A34A" : "#DC2626",
                }}
              >
                {salvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
