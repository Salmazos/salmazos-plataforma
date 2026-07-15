"use client";

import { useEffect, useState } from "react";

interface BancoParceiro {
  id: string;
  nome: string;
  emails_para: string[];
  emails_cc: string[];
  ativo: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  admissaoId: string;
  jaEnviadaEm: string | null;
  jaEnviadaPorNome: string | null;
  jaEnviadaBancoNome: string | null;
  onEnviado: () => void;
}

export default function ModalContaSalario({ isOpen, onClose, admissaoId, jaEnviadaEm, jaEnviadaPorNome, jaEnviadaBancoNome, onEnviado }: Props) {
  const [bancos, setBancos] = useState<BancoParceiro[]>([]);
  const [carregandoBancos, setCarregandoBancos] = useState(false);
  const [bancoId, setBancoId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setJustificativa("");
    setErro("");
    setBancoId("");
    setTo("");
    setCc("");
    setCarregandoBancos(true);
    fetch("/api/configuracoes/bancos-parceiros?ativo=true")
      .then((r) => r.json())
      .then((json) => {
        const lista: BancoParceiro[] = json.data ?? [];
        setBancos(lista);
        if (lista.length === 1) {
          setBancoId(lista[0].id);
          setTo(lista[0].emails_para.join(", "));
          setCc(lista[0].emails_cc.join(", "));
        }
      })
      .catch(() => setBancos([]))
      .finally(() => setCarregandoBancos(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const precisaJustificar = Boolean(jaEnviadaEm);
  const semBancoConfigurado = !carregandoBancos && bancos.length === 0;
  const podeEnviar =
    !semBancoConfigurado &&
    Boolean(bancoId) &&
    to.trim().length > 0 &&
    (!precisaJustificar || justificativa.trim().length > 0);

  const handleSelecionarBanco = (id: string) => {
    setBancoId(id);
    const banco = bancos.find((b) => b.id === id);
    if (banco) {
      setTo(banco.emails_para.join(", "));
      setCc(banco.emails_cc.join(", "));
    }
  };

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
          banco_parceiro_id: bancoId,
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
              {jaEnviadaPorNome ? ` por ${jaEnviadaPorNome}` : ""}
              {jaEnviadaBancoNome ? ` (banco: ${jaEnviadaBancoNome})` : ""}. Justifique abaixo para reenviar.
            </div>
          )}

          {semBancoConfigurado && (
            <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
              ⚠️ Nenhum banco parceiro configurado — cadastre em Configurações antes de enviar.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Banco parceiro</label>
            <select
              value={bancoId}
              onChange={(e) => handleSelecionarBanco(e.target.value)}
              disabled={carregandoBancos || semBancoConfigurado}
              className="input-field"
            >
              <option value="">{carregandoBancos ? "Carregando..." : "Selecione um banco"}</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Para</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} className="input-field" />
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
