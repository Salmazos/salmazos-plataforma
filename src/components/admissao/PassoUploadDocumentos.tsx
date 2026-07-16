"use client";

import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DocumentoToken } from "./AdmissaoFormClient";
import { cardStyle, infoBoxStyle } from "./styles";
import { DOCUMENTOS_ADMISSAO, type DocumentoAdmissaoDef } from "@/lib/admissaoDocumentos";
import { NOTAS_DOCUMENTO, NOTA_HEIC_IPHONE } from "@/lib/admissaoConstants";
import { comprimirImagem } from "@/lib/comprimirImagemCliente";

interface Props {
  token: string;
  documentos: DocumentoToken[];
  setDocumentos: Dispatch<SetStateAction<DocumentoToken[]>>;
  sexo: string;
  isMotorista: boolean;
  possuiDependentes: boolean;
}

const TAMANHO_MAX = 10 * 1024 * 1024; // 10MB
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/heic", "application/pdf"];

function tipoVisivel(def: DocumentoAdmissaoDef, sexo: string, isMotorista: boolean, possuiDependentes: boolean): boolean {
  if (def.condicional === "masculino") return sexo === "M";
  if (def.condicional === "motorista") return isMotorista;
  if (def.condicional === "dependente") return possuiDependentes;
  return true;
}

function validarArquivo(file: File): string | null {
  if (file.size > TAMANHO_MAX) return `"${file.name}" é maior que 10MB.`;
  if (!TIPOS_ACEITOS.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
    return `Formato de "${file.name}" não aceito. Envie JPG, PNG, PDF ou HEIC.`;
  }
  return null;
}

async function enviarArquivo(
  token: string, tipoDocumento: string, file: File, docId?: string
): Promise<{ ok: true; data: DocumentoToken } | { ok: false; erro: string }> {
  try {
    const urlRes = await fetch(`/api/admissoes/token/${token}/documentos/${tipoDocumento}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    const urlJson = await urlRes.json();
    if (!urlRes.ok) return { ok: false, erro: urlJson.error || "Erro ao preparar envio." };

    const putRes = await fetch(urlJson.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) return { ok: false, erro: "Erro ao enviar o arquivo." };

    const confirmRes = await fetch(`/api/admissoes/token/${token}/documentos/${tipoDocumento}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_path: urlJson.path, ...(docId ? { doc_id: docId } : {}) }),
    });
    const confirmJson = await confirmRes.json();
    if (!confirmRes.ok) return { ok: false, erro: confirmJson.error || "Erro ao confirmar envio." };

    return { ok: true, data: confirmJson.data };
  } catch {
    return { ok: false, erro: "Erro de conexão. Tente novamente." };
  }
}

function DocumentoCard({ doc, token, onAtualizado }: { doc: DocumentoToken; token: string; onAtualizado: (doc: DocumentoToken) => void }) {
  const def = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento);
  const nota = NOTAS_DOCUMENTO[doc.tipo_documento];
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const enviado = doc.status === "enviado" || doc.status === "aprovado";
  const rejeitado = doc.status === "rejeitado";

  const handleFile = async (file: File) => {
    setErro("");
    const erroValidacao = validarArquivo(file);
    if (erroValidacao) { setErro(erroValidacao); return; }

    setOtimizando(true);
    const arquivoFinal = await comprimirImagem(file);
    setOtimizando(false);

    setEnviando(true);
    const resultado = await enviarArquivo(token, doc.tipo_documento, arquivoFinal);
    if (!resultado.ok) { setErro(resultado.erro); setEnviando(false); return; }

    if (arquivoFinal.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(arquivoFinal));
    onAtualizado(resultado.data);
    setEnviando(false);
  };

  return (
    <div style={{ ...cardStyle, marginBottom: 12, border: rejeitado ? "2px solid #DC2626" : cardStyle.border }}>
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
          disabled={enviando || otimizando}
          style={{
            flex: 1, minHeight: 44, fontSize: 14, fontWeight: 600, borderRadius: 10, cursor: "pointer",
            border: enviado && !rejeitado ? "1px solid #D1D5DB" : "none",
            background: enviado && !rejeitado ? "#fff" : "#000",
            color: enviado && !rejeitado ? "#374151" : "#FFD700",
            opacity: enviando || otimizando ? 0.7 : 1,
          }}
        >
          {otimizando ? "Otimizando imagem..." : enviando ? "Enviando..." : enviado && !rejeitado ? "Reenviar arquivo" : "Enviar arquivo"}
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

// Linha compacta pra um arquivo já confirmado dentro de um slot multi-arquivo — mesma
// lógica de reenvio do DocumentoCard, mas escopada a UMA linha específica (doc_id),
// senão o backend não sabe qual das várias linhas do tipo deve ser substituída.
function ArquivoEnviadoLinha({ doc, index, token, onAtualizado }: { doc: DocumentoToken; index: number; token: string; onAtualizado: (doc: DocumentoToken) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState("");
  const rejeitado = doc.status === "rejeitado";
  const aprovado = doc.status === "aprovado";

  const handleFile = async (file: File) => {
    setErro("");
    const erroValidacao = validarArquivo(file);
    if (erroValidacao) { setErro(erroValidacao); return; }

    setOtimizando(true);
    const arquivoFinal = await comprimirImagem(file);
    setOtimizando(false);

    setEnviando(true);
    const resultado = await enviarArquivo(token, doc.tipo_documento, arquivoFinal, doc.id);
    if (!resultado.ok) { setErro(resultado.erro); setEnviando(false); return; }

    onAtualizado(resultado.data);
    setEnviando(false);
  };

  return (
    <div style={{ border: rejeitado ? "2px solid #DC2626" : "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          Arquivo {index + 1} {aprovado ? "✅" : rejeitado ? "❌" : "⏳"}
        </span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={enviando || otimizando}
          style={{ fontSize: 12, fontWeight: 600, color: "#B45309", background: "none", border: "none", cursor: "pointer", opacity: enviando || otimizando ? 0.6 : 1 }}
        >
          {otimizando ? "Otimizando..." : enviando ? "Enviando..." : "Reenviar"}
        </button>
        <input
          ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>
      {rejeitado && (
        <p style={{ fontSize: 12, color: "#991B1B", margin: "4px 0 0" }}>
          ⚠️ Reenvio necessário{doc.motivo_rejeicao ? ` — ${doc.motivo_rejeicao}` : ""}
        </p>
      )}
      {erro && <p style={{ color: "#DC2626", fontSize: 12, margin: "4px 0 0" }}>{erro}</p>}
    </div>
  );
}

// Um único "slot" que aceita vários arquivos (ex.: CPF de cada dependente) — sem vínculo
// nominal entre arquivo e dependente específico. Arquivos novos ficam num staging local
// (com preview e opção de remover) antes de serem efetivamente enviados.
function DocumentoMultiCard({
  def, rows, token, onAtualizado,
}: {
  def: DocumentoAdmissaoDef; rows: DocumentoToken[]; token: string; onAtualizado: (doc: DocumentoToken) => void;
}) {
  const nota = NOTAS_DOCUMENTO[def.tipo_documento];
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState("");

  const enviados = rows.filter((r) => r.storage_path);

  const handleSelecionar = async (files: FileList) => {
    setErro("");
    const validos: File[] = [];
    for (const file of Array.from(files)) {
      const erroValidacao = validarArquivo(file);
      if (erroValidacao) { setErro(erroValidacao); continue; }
      validos.push(file);
    }
    if (validos.length === 0) return;

    setOtimizando(true);
    const comprimidos = await Promise.all(validos.map((file) => comprimirImagem(file)));
    setOtimizando(false);

    setStaged((prev) => [...prev, ...comprimidos]);
  };

  const removerStaged = (idx: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleEnviarStaged = async () => {
    setErro("");
    setEnviando(true);
    const restantes: File[] = [];
    for (const file of staged) {
      const resultado = await enviarArquivo(token, def.tipo_documento, file);
      if (!resultado.ok) {
        setErro(resultado.erro);
        restantes.push(file);
        continue;
      }
      onAtualizado(resultado.data);
    }
    setStaged(restantes);
    setEnviando(false);
  };

  const temRejeitado = rows.some((r) => r.status === "rejeitado");

  return (
    <div style={{ ...cardStyle, marginBottom: 12, border: temRejeitado ? "2px solid #DC2626" : cardStyle.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{def.label}</p>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap", background: "#F3F4F6", color: "#6B7280" }}>
          Opcional
        </span>
      </div>

      {nota && <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, margin: "0 0 8px" }}>{nota}</p>}

      <div style={{ ...infoBoxStyle, fontSize: 11, padding: "8px 10px", marginBottom: 10 }}>{NOTA_HEIC_IPHONE}</div>

      {enviados.length === 0 && staged.length === 0 && (
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 10px" }}>Nenhum arquivo enviado ainda.</p>
      )}

      {enviados.map((doc, idx) => (
        <ArquivoEnviadoLinha key={doc.id} doc={doc} index={idx} token={token} onAtualizado={onAtualizado} />
      ))}

      {staged.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>Prontos para enviar:</p>
          {staged.map((file, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px dashed #D1D5DB", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
              {file.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(file)} alt="Pré-visualização" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 18 }}>📄</span>
              )}
              <span style={{ fontSize: 12, color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
              <button
                onClick={() => removerStaged(idx)}
                disabled={enviando}
                style={{ background: "none", border: "none", color: "#DC2626", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 4 }}
                aria-label="Remover arquivo"
              >
                🗑️
              </button>
            </div>
          ))}
          <button
            onClick={handleEnviarStaged}
            disabled={enviando}
            style={{
              width: "100%", minHeight: 40, fontSize: 13, fontWeight: 600, borderRadius: 10, border: "none",
              background: "#000", color: "#FFD700", cursor: "pointer", opacity: enviando ? 0.7 : 1, marginTop: 4,
            }}
          >
            {enviando ? "Enviando..." : `Enviar ${staged.length} arquivo${staged.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={enviando || otimizando}
        style={{
          width: "100%", minHeight: 40, fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: "pointer",
          border: "1px solid #D1D5DB", background: "#fff", color: "#374151", opacity: enviando || otimizando ? 0.7 : 1,
        }}
      >
        {otimizando ? "Otimizando imagem..." : "+ Adicionar outro arquivo"}
      </button>
      <input
        ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleSelecionar(e.target.files); e.target.value = ""; }}
      />

      {erro && <p style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{erro}</p>}
    </div>
  );
}

export default function PassoUploadDocumentos({ token, documentos, setDocumentos, sexo, isMotorista, possuiDependentes }: Props) {
  // apenasPainel (ex.: rg_verso) é exclusivo do upload manual pela equipe — nunca aparece
  // aqui, mesmo defensivamente (a linha em admissao_documentos nem chega a existir pra um
  // tipo assim, já que o seed automático da criação também o exclui).
  const tiposVisiveis = DOCUMENTOS_ADMISSAO.filter((def) => !def.apenasPainel && tipoVisivel(def, sexo, isMotorista, possuiDependentes));

  const handleAtualizado = (docAtualizado: DocumentoToken) => {
    setDocumentos((prev) => {
      const existe = prev.some((d) => d.id === docAtualizado.id);
      return existe ? prev.map((d) => (d.id === docAtualizado.id ? { ...d, ...docAtualizado } : d)) : [...prev, docAtualizado];
    });
  };

  return (
    <div>
      <div style={cardStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Upload de Documentos</h2>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Envie fotos ou PDFs dos documentos abaixo (até 10MB cada).</p>
      </div>

      <div style={{ marginTop: 12 }}>
        {tiposVisiveis.map((def) => {
          const rows = documentos.filter((d) => d.tipo_documento === def.tipo_documento);
          if (def.condicional === "dependente") {
            return <DocumentoMultiCard key={def.tipo_documento} def={def} rows={rows} token={token} onAtualizado={handleAtualizado} />;
          }
          const doc = rows[0];
          if (!doc) return null;
          return <DocumentoCard key={doc.id} doc={doc} token={token} onAtualizado={handleAtualizado} />;
        })}
      </div>
    </div>
  );
}
