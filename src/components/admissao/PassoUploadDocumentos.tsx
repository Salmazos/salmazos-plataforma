"use client";

import { useRef, useState } from "react";
import type { DocumentoToken } from "./AdmissaoFormClient";
import { cardStyle, infoBoxStyle } from "./styles";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { NOTAS_DOCUMENTO, NOTA_HEIC_IPHONE } from "@/lib/admissaoConstants";

interface Props {
  token: string;
  documentos: DocumentoToken[];
  setDocumentos: (docs: DocumentoToken[]) => void;
  sexo: string;
  isMotorista: boolean;
  possuiDependentes: boolean;
}

const TAMANHO_MAX = 10 * 1024 * 1024; // 10MB
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/heic", "application/pdf"];

function docVisivel(doc: DocumentoToken, sexo: string, isMotorista: boolean, possuiDependentes: boolean): boolean {
  if (doc.obrigatorio) return true;
  if (doc.condicional === "masculino") return sexo === "M";
  if (doc.condicional === "motorista") return isMotorista;
  if (doc.condicional === "dependente") return possuiDependentes;
  return true;
}

function DocumentoCard({ doc, token, onAtualizado }: { doc: DocumentoToken; token: string; onAtualizado: (doc: DocumentoToken) => void }) {
  const def = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento);
  const nota = NOTAS_DOCUMENTO[doc.tipo_documento];
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const enviado = doc.status === "enviado" || doc.status === "aprovado";
  const rejeitado = doc.status === "rejeitado";

  const handleFile = async (file: File) => {
    setErro("");
    if (file.size > TAMANHO_MAX) { setErro("Arquivo maior que 10MB."); return; }
    if (!TIPOS_ACEITOS.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
      setErro("Formato não aceito. Envie JPG, PNG, PDF ou HEIC.");
      return;
    }

    setEnviando(true);
    try {
      const urlRes = await fetch(`/api/admissoes/token/${token}/documentos/${doc.tipo_documento}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) { setErro(urlJson.error || "Erro ao preparar envio."); return; }

      const putRes = await fetch(urlJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) { setErro("Erro ao enviar o arquivo."); return; }

      const confirmRes = await fetch(`/api/admissoes/token/${token}/documentos/${doc.tipo_documento}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: urlJson.path }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) { setErro(confirmJson.error || "Erro ao confirmar envio."); return; }

      if (file.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(file));
      onAtualizado(confirmJson.data);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{def?.label ?? doc.tipo_documento}</p>
        <span
          style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
            background: doc.obrigatorio ? "#FEE2E2" : "#F3F4F6",
            color: doc.obrigatorio ? "#991B1B" : "#6B7280",
          }}
        >
          {doc.obrigatorio ? "Obrigatório" : "Opcional"}
        </span>
      </div>

      {nota && <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, margin: "0 0 8px" }}>{nota}</p>}

      <div style={{ ...infoBoxStyle, fontSize: 11, padding: "8px 10px", marginBottom: 10 }}>{NOTA_HEIC_IPHONE}</div>

      {rejeitado && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "#991B1B", margin: 0, fontWeight: 600 }}>⚠️ Reenvio necessário</p>
          {doc.motivo_rejeicao && <p style={{ fontSize: 12, color: "#991B1B", margin: "2px 0 0" }}>{doc.motivo_rejeicao}</p>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {previewUrl ? (
          <img src={previewUrl} alt="Pré-visualização" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
        ) : enviado && !rejeitado ? (
          <span style={{ fontSize: 22 }}>✅</span>
        ) : (
          <span style={{ fontSize: 22, opacity: 0.4 }}>⬜</span>
        )}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          style={{
            flex: 1, minHeight: 44, fontSize: 14, fontWeight: 600, borderRadius: 10, cursor: "pointer",
            border: enviado && !rejeitado ? "1px solid #D1D5DB" : "none",
            background: enviado && !rejeitado ? "#fff" : "#000",
            color: enviado && !rejeitado ? "#374151" : "#FFD700",
            opacity: enviando ? 0.7 : 1,
          }}
        >
          {enviando ? "Enviando..." : enviado && !rejeitado ? "Reenviar arquivo" : "Enviar arquivo"}
        </button>

        <input
          ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {erro && <p style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{erro}</p>}
    </div>
  );
}

export default function PassoUploadDocumentos({ token, documentos, setDocumentos, sexo, isMotorista, possuiDependentes }: Props) {
  const visiveis = documentos.filter((d) => docVisivel(d, sexo, isMotorista, possuiDependentes));

  const handleAtualizado = (docAtualizado: DocumentoToken) => {
    setDocumentos(documentos.map((d) => (d.id === docAtualizado.id ? { ...d, ...docAtualizado } : d)));
  };

  return (
    <div>
      <div style={cardStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Upload de Documentos</h2>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Envie fotos ou PDFs dos documentos abaixo (até 10MB cada).</p>
      </div>

      <div style={{ marginTop: 12 }}>
        {visiveis.map((doc) => (
          <DocumentoCard key={doc.id} doc={doc} token={token} onAtualizado={handleAtualizado} />
        ))}
      </div>
    </div>
  );
}
