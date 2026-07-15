"use client";

import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  admissaoId: string;
  jaEnviadaEm: string | null;
  jaEnviadaPorNome: string | null;
  onEnviado: () => void;
}

export default function ModalContaSalario({ isOpen, onClose, admissaoId, jaEnviadaEm, jaEnviadaPorNome, onEnviado }: Props) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [carregandoDestinatarios, setCarregandoDestinatarios] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setJustificativa("");
    setErro("");
    setCarregandoDestinatarios(true);
    fetch("/api/configuracoes/carta-conta-salario")
      .then((r) => r.json())
      .then((json) => {
        setTo(json.para ?? "");
        setCc(json.cc ?? "");
      })
      .catch(() => {
        setTo("");
        setCc("");
      })
      .finally(() => setCarregandoDestinatarios(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const precisaJustificar = Boolean(jaEnviadaEm);
  const podeEnviar = to.trim().length > 0 && (!precisaJustificar || justificativa.trim().length > 0);

  const handlePreview = async () => {
    setGerandoPreview(true);
    setErro("");
    try {
      const res = await fetch(`/api/admissoes/${admissaoId}/carta-conta-salario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErro(json.error || "Erro ao gerar o preview do PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      setErro("Erro de conexão ao gerar o preview.");
    } finally {
      setGerandoPreview(false);
    }
  };

  const handleEnviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/admissoes/${admissaoId}/carta-conta-salario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para: to.trim(),
          cc: cc.trim(),
          ...(precisaJustificar ? { forcar: true, justificativa: justificativa.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error || "Erro ao enviar a carta.");
        return;
      }
      onEnviado();
      onClose();
    } catch {
      setErro("Erro de conexão ao enviar a carta.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <span>🏦</span> Carta de abertura de conta salário
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {jaEnviadaEm && (
            <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
              ⚠️ Já enviado em {new Date(jaEnviadaEm).toLocaleString("pt-BR")}
              {jaEnviadaPorNome ? ` por ${jaEnviadaPorNome}` : ""}. Justifique abaixo para reenviar.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Para</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={carregandoDestinatarios ? "Carregando destinatários padrão..." : undefined}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cc</label>
            <input value={cc} onChange={(e) => setCc(e.target.value)} className="input-field" />
          </div>

          {precisaJustificar && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Justificativa do reenvio (obrigatória) *
              </label>
              <textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={2}
                placeholder="Por que está reenviando esta carta?"
                className="input-field resize-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handlePreview}
            disabled={gerandoPreview}
            className="btn-outline w-full"
            style={{ opacity: gerandoPreview ? 0.6 : 1 }}
          >
            {gerandoPreview ? "Gerando preview..." : "Pré-visualizar PDF"}
          </button>

          {erro && <p className="text-xs" style={{ color: "#DC2626" }}>{erro}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Cancelar</button>
          <button
            onClick={handleEnviar}
            disabled={!podeEnviar || enviando}
            className="btn-primary"
            style={{ opacity: !podeEnviar || enviando ? 0.5 : 1 }}
          >
            {enviando ? "Enviando..." : precisaJustificar ? "Forçar reenvio" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
