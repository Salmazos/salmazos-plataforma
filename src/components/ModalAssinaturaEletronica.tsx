"use client";

import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  admissaoId: string;
  pdfPath: string;
  nomeInicial: string;
  emailInicial: string;
  onEnviado: () => void;
}

// Tela de confirmação antes de disparar o envelope na Clicksign — mesmo padrão do
// ModalContaSalario.tsx (carta de abertura de conta): revisão antes de qualquer coisa
// externa e irreversível (o candidato recebe o e-mail assim que confirma). Nome/e-mail
// são editáveis só pra este envio — nunca gravados de volta em admissao_dados_pessoais.
export default function ModalAssinaturaEletronica({
  isOpen,
  onClose,
  admissaoId,
  pdfPath,
  nomeInicial,
  emailInicial,
  onEnviado,
}: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setNome(nomeInicial);
    setEmail(emailInicial);
    setErro("");
  }, [isOpen, nomeInicial, emailInicial]);

  if (!isOpen) return null;

  const podeEnviar = nome.trim().length > 0 && email.trim().length > 0;

  const handleConfirmar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/admissoes/assinatura-clicksign/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissaoId,
          pdfPath,
          nomeCandidato: nome.trim(),
          emailCandidato: email.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error || "Erro ao enviar para assinatura eletrônica.");
        return;
      }
      onEnviado();
      onClose();
    } catch {
      setErro("Erro de conexão ao enviar para assinatura eletrônica.");
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
            <span>✍️</span> Enviar para assinatura eletrônica
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
            ⚠️ O candidato receberá um e-mail da Clicksign com o link para assinar este documento. Confirme os dados antes de continuar.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome do candidato</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail do candidato</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input-field" />
          </div>
          <p className="text-xs text-gray-400">Isso não altera o cadastro do candidato — o valor editado aqui vale só para este envio.</p>

          {erro && <p className="text-xs" style={{ color: "#DC2626" }}>{erro}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Cancelar</button>
          <button
            onClick={handleConfirmar}
            disabled={!podeEnviar || enviando}
            className="btn-primary"
            style={{ opacity: !podeEnviar || enviando ? 0.5 : 1 }}
          >
            {enviando ? "Enviando..." : "Confirmar e enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
