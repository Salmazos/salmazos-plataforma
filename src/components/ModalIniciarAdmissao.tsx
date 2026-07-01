"use client";

import { useEffect, useState } from "react";

interface CandidatoElegivel {
  id: string;
  candidato_id: string;
  vaga_id: string;
  candidatos: { id: string; nome_completo: string; cargo_pretendido: string; telefone: string | null } | null;
  vagas: { id: string; titulo: string; tipo_servico: string } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCriado: () => void;
}

function modalidadeDefault(tipoServico: string | undefined): string {
  if (tipoServico === "mao_obra_temporaria") return "MOT";
  if (tipoServico === "terceirizacao") return "terceirizacao";
  return "MOT";
}

export default function ModalIniciarAdmissao({ isOpen, onClose, onCriado }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [elegiveis, setElegiveis] = useState<CandidatoElegivel[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<CandidatoElegivel | null>(null);
  const [modalidade, setModalidade] = useState("MOT");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{ url: string; whatsappUrl: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelecionado(null);
    setResultado(null);
    setErro("");
    setBusca("");
    setCarregando(true);
    fetch("/api/admissoes/candidatos-elegiveis")
      .then((r) => r.json())
      .then((json) => setElegiveis(json.data ?? []))
      .finally(() => setCarregando(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const filtrados = elegiveis.filter((e) =>
    (e.candidatos?.nome_completo ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  const handleSelecionar = (c: CandidatoElegivel) => {
    setSelecionado(c);
    setModalidade(modalidadeDefault(c.vagas?.tipo_servico));
  };

  const handleConfirmar = async () => {
    if (!selecionado) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/admissoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidato_id: selecionado.candidato_id,
          vaga_id: selecionado.vaga_id,
          modalidade,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao criar admissão."); return; }
      setResultado({ url: json.url, whatsappUrl: json.whatsappUrl ?? null });
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const handleCopiar = () => {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado.url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Iniciar admissão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {resultado ? (
          <div>
            <div className="rounded-lg p-4 mb-4 text-sm" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" }}>
              ✅ Admissão criada! O candidato já recebeu o link por e-mail.
            </div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Link de admissão</label>
            <div className="flex gap-2 mb-4">
              <input readOnly value={resultado.url} className="input-field flex-1 text-xs" />
              <button onClick={handleCopiar} className="btn-outline whitespace-nowrap">{copiado ? "Copiado!" : "Copiar"}</button>
            </div>
            {resultado.whatsappUrl && (
              <a
                href={resultado.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-white mb-4"
                style={{ background: "#25D366", textDecoration: "none" }}
              >
                📱 Enviar via WhatsApp
              </a>
            )}
            <button onClick={onCriado} className="btn-primary w-full">Concluir</button>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Candidato aprovado (MOT/Terceirização)</label>
            <input
              type="text" placeholder="Buscar por nome..." value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input-field mb-3"
            />

            {carregando ? (
              <p className="text-sm text-gray-400 py-6 text-center">Carregando candidatos...</p>
            ) : filtrados.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Nenhum candidato elegível encontrado. Certifique-se de que o candidato foi aprovado pelo cliente em uma vaga MOT ou Terceirização.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg mb-4 max-h-56 overflow-y-auto">
                {filtrados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelecionar(c)}
                    className="w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-0"
                    style={{ background: selecionado?.id === c.id ? "#FFFBEB" : "#fff" }}
                  >
                    <p className="text-sm font-semibold text-gray-900">{c.candidatos?.nome_completo ?? "—"}</p>
                    <p className="text-xs text-gray-500">{c.candidatos?.cargo_pretendido} · {c.vagas?.titulo}</p>
                  </button>
                ))}
              </div>
            )}

            {selecionado && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Modalidade</label>
                <select value={modalidade} onChange={(e) => setModalidade(e.target.value)} className="input-field">
                  <option value="MOT">Mão de Obra Temporária (MOT)</option>
                  <option value="terceirizacao">Terceirização</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Vaga: {selecionado.vagas?.titulo}</p>
              </div>
            )}

            {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>Cancelar</button>
              <button onClick={handleConfirmar} disabled={!selecionado || enviando} className="btn-primary flex-1 disabled:opacity-50">
                {enviando ? "Criando..." : "Criar admissão"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
