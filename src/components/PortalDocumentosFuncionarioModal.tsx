"use client";

import { useEffect, useState } from "react";
import type { DocumentoPortalItem } from "@/app/api/portal/funcionarios/[funcionarioId]/documentos/route";

interface Props {
  funcionarioId: string;
  nomeFuncionario: string;
  onClose: () => void;
}

// Modal só de leitura — mesmo conceito da aba "Documentos" do painel interno
// (AdmissaoDetalheClient), mas sem "Substituir arquivo", sem aprovar/rejeitar e sem as
// outras abas da admissão (Dados do Candidato, Anotações Internas, pacote pra
// contabilidade etc.): o cliente só pode ver e baixar os documentos já aprovados que a
// Salmazos decidiu liberar (ver documentos/route.ts pra lista completa e o porquê de cada
// exclusão).
export default function PortalDocumentosFuncionarioModal({ funcionarioId, nomeFuncionario, onClose }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoPortalItem[] | null>(null);
  const [erro, setErro] = useState("");
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/funcionarios/${funcionarioId}/documentos`)
      .then((r) => r.json())
      .then((j) => setDocumentos(j.data ?? []))
      .catch(() => setErro("Erro ao carregar documentos."));
  }, [funcionarioId]);

  async function obterSignedUrl(docId: string): Promise<string | null> {
    setErro("");
    setProcessandoId(docId);
    try {
      const res = await fetch(`/api/portal/funcionarios/${funcionarioId}/documentos/${docId}/url`);
      const json = await res.json();
      if (!res.ok || !json.signedUrl) {
        setErro(json.error || "Erro ao abrir documento.");
        return null;
      }
      return json.signedUrl as string;
    } catch {
      setErro("Erro de conexão.");
      return null;
    } finally {
      setProcessandoId(null);
    }
  }

  async function handleVisualizar(doc: DocumentoPortalItem) {
    const url = await obterSignedUrl(doc.id);
    if (url) window.open(url, "_blank");
  }

  async function handleBaixar(doc: DocumentoPortalItem) {
    const url = await obterSignedUrl(doc.id);
    if (!url) return;
    try {
      const arquivoRes = await fetch(url);
      const blob = await arquivoRes.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = doc.extensao ? `${doc.label}.${doc.extensao}` : doc.label;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      setErro("Erro ao baixar o documento.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-gray-900">Documentos</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">{nomeFuncionario}</p>

          {erro && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{erro}</div>}

          {documentos === null ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : documentos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum documento disponível ainda.</p>
          ) : (
            <div className="space-y-2">
              {documentos.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{doc.label}</p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleVisualizar(doc)}
                      disabled={processandoId === doc.id}
                      className="btn-outline"
                      style={{ padding: "5px 12px", fontSize: 12 }}
                    >
                      Visualizar
                    </button>
                    <button
                      onClick={() => handleBaixar(doc)}
                      disabled={processandoId === doc.id}
                      className="btn-outline"
                      style={{ padding: "5px 12px", fontSize: 12 }}
                    >
                      Baixar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
