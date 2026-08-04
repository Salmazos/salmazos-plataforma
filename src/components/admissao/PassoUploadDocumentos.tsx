"use client";

import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { DocumentoToken } from "./AdmissaoFormClient";
import { cardStyle, infoBoxStyle } from "./styles";
import { DOCUMENTOS_ADMISSAO, type DocumentoAdmissaoDef } from "@/lib/admissaoDocumentos";
import {
  NOTAS_DOCUMENTO, NOTA_HEIC_IPHONE,
  ORIENTACAO_FOTO_3X4_PRINCIPAL, ORIENTACAO_FOTO_3X4_COMPLEMENTO, ORIENTACAO_FOTO_3X4_DICA_EXTRA,
} from "@/lib/admissaoConstants";
import { comprimirImagem } from "@/lib/comprimirImagemCliente";
import { validarQualidadeImagem } from "@/lib/validarQualidadeImagem";
import { ENQUADRAMENTO_CONFIG } from "@/lib/enquadramentoConfig";
import CapturaComEnquadramento, { detectarMobile } from "./CapturaComEnquadramento";

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

// Roda nos dois caminhos de upload (câmera com moldura e "escolher da galeria"/arquivo) —
// bloqueia só casos extremos (muito escuro, muito borrado), com mensagem que convida a
// tentar de novo em vez de travar o candidato sem explicação.
async function validarQualidadeOuErro(file: File): Promise<string | null> {
  const resultado = await validarQualidadeImagem(file);
  return resultado.ok ? null : resultado.motivo ?? "A foto não ficou boa o suficiente. Tente novamente.";
}

// Abre a foto já enviada em tamanho real numa nova aba — o candidato precisa conseguir
// conferir se o enquadramento/nitidez ficaram bons antes de seguir pro próximo passo.
async function abrirVisualizacao(token: string, docId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/admissoes/token/${token}/documentos/visualizar/${docId}`);
    const json = await res.json();
    if (!res.ok || !json.signedUrl) return json.error || "Erro ao abrir a imagem.";
    window.open(json.signedUrl, "_blank");
    return null;
  } catch {
    return "Erro de conexão ao abrir a imagem.";
  }
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
  const [isMobile] = useState(detectarMobile);
  const [capturando, setCapturando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const enviado = doc.status === "enviado" || doc.status === "aprovado";
  const rejeitado = doc.status === "rejeitado";
  // Moldura só em mobile — desktop segue exatamente como hoje (input de arquivo comum).
  const usaEnquadramento = isMobile && !!def?.enquadramento;
  // Foto 3x4 pelo desktop não tem câmera guiada disponível (usaEnquadramento é sempre
  // false aqui) — em vez do seletor de arquivo comum como opção principal (que convida o
  // candidato a reenviar uma 3x4 impressa antiga), mostra um QR pro mesmo link da
  // admissão, pro candidato continuar a etapa pelo celular. O link já retoma sozinho
  // nesta mesma etapa ao reabrir (ver calcularPassoInicial em AdmissaoFormClient) — não
  // precisa gerar token novo nem sincronizar nada em tempo real.
  const ofereceHandoffQr = !isMobile && def?.enquadramento === "retrato_3x4";
  const urlAdmissao = typeof window !== "undefined" ? `${window.location.origin}/admissao/${token}` : "";

  const handleFile = async (file: File) => {
    setErro("");
    const erroValidacao = validarArquivo(file);
    if (erroValidacao) { setErro(erroValidacao); return; }

    setVerificando(true);
    const erroQualidade = await validarQualidadeOuErro(file);
    setVerificando(false);
    if (erroQualidade) { setErro(erroQualidade); return; }

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

  const label = def?.label ?? doc.tipo_documento;

  const handleVerImagem = async () => {
    if (previewUrl) { window.open(previewUrl, "_blank"); return; }
    if (!doc.storage_path) return;
    const erroVisualizacao = await abrirVisualizacao(token, doc.id);
    if (erroVisualizacao) setErro(erroVisualizacao);
  };

  if (usaEnquadramento && capturando) {
    const cfg = ENQUADRAMENTO_CONFIG[def!.enquadramento!];
    return (
      <CapturaComEnquadramento
        proporcaoLargura={cfg.proporcaoLargura}
        proporcaoAltura={cfg.proporcaoAltura}
        orientacao={cfg.orientacao}
        instrucao={cfg.instrucaoPadrao}
        titulo={label}
        ehFoto3x4={def!.enquadramento === "retrato_3x4"}
        onArquivoEscolhido={(file) => { setCapturando(false); handleFile(file); }}
        onCancelar={() => setCapturando(false)}
      />
    );
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 12, border: rejeitado ? "2px solid #DC2626" : cardStyle.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{label}</p>
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

      {ofereceHandoffQr ? (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FFFBEA", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px", marginBottom: 4 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>📸</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", margin: 0, lineHeight: 1.4 }}>{ORIENTACAO_FOTO_3X4_PRINCIPAL}</p>
              <p style={{ fontSize: 12, fontWeight: 500, color: "#B45309", margin: "2px 0 0", lineHeight: 1.4 }}>{ORIENTACAO_FOTO_3X4_COMPLEMENTO}</p>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 10px" }}>{ORIENTACAO_FOTO_3X4_DICA_EXTRA}</p>
        </>
      ) : (
        nota && <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, margin: "0 0 8px" }}>{nota}</p>
      )}

      <div style={{ ...infoBoxStyle, fontSize: 11, padding: "8px 10px", marginBottom: 10 }}>{NOTA_HEIC_IPHONE}</div>

      {rejeitado && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "#991B1B", margin: 0, fontWeight: 600 }}>⚠️ Reenvio necessário</p>
          {doc.motivo_rejeicao && <p style={{ fontSize: 12, color: "#991B1B", margin: "2px 0 0" }}>{doc.motivo_rejeicao}</p>}
        </div>
      )}

      {ofereceHandoffQr && urlAdmissao && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <QRCodeSVG value={urlAdmissao} size={200} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, margin: 0, flex: 1, minWidth: 160 }}>
            📱 Escaneie este código com a câmera do seu celular para tirar a foto com a
            qualidade certa. Seu progresso já está salvo — ao abrir no celular, você
            continuará direto nesta etapa.
          </p>
        </div>
      )}

      {ofereceHandoffQr && (
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 6px" }}>Sem celular à mão? Você ainda pode enviar um arquivo:</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {previewUrl || (enviado && doc.storage_path) ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <button
              type="button"
              onClick={handleVerImagem}
              aria-label="Ver imagem em tamanho real"
              style={{ padding: 0, border: "none", background: "none", cursor: "pointer", lineHeight: 0 }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Pré-visualização" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 22 }}>✅</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleVerImagem}
              style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontSize: 10, color: "#B45309", fontWeight: 600 }}
            >
              🔍 Ver
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 22, opacity: 0.4 }}>⬜</span>
        )}

        <button
          onClick={() => (usaEnquadramento ? setCapturando(true) : inputRef.current?.click())}
          disabled={enviando || otimizando || verificando}
          style={{
            flex: 1, minHeight: 44, fontSize: 14, fontWeight: 600, borderRadius: 10, cursor: "pointer",
            border: ofereceHandoffQr || (enviado && !rejeitado) ? "1px solid #D1D5DB" : "none",
            background: ofereceHandoffQr || (enviado && !rejeitado) ? "#fff" : "#000",
            color: ofereceHandoffQr || (enviado && !rejeitado) ? "#374151" : "#FFD700",
            opacity: enviando || otimizando || verificando ? 0.7 : 1,
          }}
        >
          {verificando ? "Verificando qualidade..." : otimizando ? "Otimizando imagem..." : enviando ? "Enviando..." : enviado && !rejeitado ? "Reenviar arquivo" : "Enviar arquivo"}
        </button>

        {!usaEnquadramento && (
          <input
            ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        )}
      </div>

      {erro && <p style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{erro}</p>}
    </div>
  );
}

// Linha compacta pra um arquivo já confirmado dentro de um slot multi-arquivo — mesma
// lógica de reenvio do DocumentoCard, mas escopada a UMA linha específica (doc_id),
// senão o backend não sabe qual das várias linhas do tipo deve ser substituída.
function ArquivoEnviadoLinha({ doc, index, token, onAtualizado, enquadramento, titulo }: { doc: DocumentoToken; index: number; token: string; onAtualizado: (doc: DocumentoToken) => void; enquadramento?: "cartao" | "retrato_3x4" | "folha"; titulo: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMobile] = useState(detectarMobile);
  const [capturando, setCapturando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState("");
  const rejeitado = doc.status === "rejeitado";
  const aprovado = doc.status === "aprovado";
  const usaEnquadramento = isMobile && !!enquadramento;

  const handleFile = async (file: File) => {
    setErro("");
    const erroValidacao = validarArquivo(file);
    if (erroValidacao) { setErro(erroValidacao); return; }

    setVerificando(true);
    const erroQualidade = await validarQualidadeOuErro(file);
    setVerificando(false);
    if (erroQualidade) { setErro(erroQualidade); return; }

    setOtimizando(true);
    const arquivoFinal = await comprimirImagem(file);
    setOtimizando(false);

    setEnviando(true);
    const resultado = await enviarArquivo(token, doc.tipo_documento, arquivoFinal, doc.id);
    if (!resultado.ok) { setErro(resultado.erro); setEnviando(false); return; }

    onAtualizado(resultado.data);
    setEnviando(false);
  };

  if (usaEnquadramento && capturando) {
    const cfg = ENQUADRAMENTO_CONFIG[enquadramento!];
    return (
      <CapturaComEnquadramento
        proporcaoLargura={cfg.proporcaoLargura}
        proporcaoAltura={cfg.proporcaoAltura}
        orientacao={cfg.orientacao}
        instrucao={cfg.instrucaoPadrao}
        titulo={titulo}
        ehFoto3x4={enquadramento === "retrato_3x4"}
        onArquivoEscolhido={(file) => { setCapturando(false); handleFile(file); }}
        onCancelar={() => setCapturando(false)}
      />
    );
  }

  const handleVerImagem = async () => {
    if (!doc.storage_path) return;
    const erroVisualizacao = await abrirVisualizacao(token, doc.id);
    if (erroVisualizacao) setErro(erroVisualizacao);
  };

  return (
    <div style={{ border: rejeitado ? "2px solid #DC2626" : "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          Arquivo {index + 1} {aprovado ? "✅" : rejeitado ? "❌" : "⏳"}
        </span>
        {doc.storage_path && (
          <button
            type="button"
            onClick={handleVerImagem}
            style={{ fontSize: 12, fontWeight: 600, color: "#374151", background: "none", border: "none", cursor: "pointer" }}
          >
            🔍 Ver
          </button>
        )}
        <button
          onClick={() => (usaEnquadramento ? setCapturando(true) : inputRef.current?.click())}
          disabled={enviando || otimizando || verificando}
          style={{ fontSize: 12, fontWeight: 600, color: "#B45309", background: "none", border: "none", cursor: "pointer", opacity: enviando || otimizando || verificando ? 0.6 : 1 }}
        >
          {verificando ? "Verificando..." : otimizando ? "Otimizando..." : enviando ? "Enviando..." : "Reenviar"}
        </button>
        {!usaEnquadramento && (
          <input
            ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        )}
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
  const [isMobile] = useState(detectarMobile);
  const [capturando, setCapturando] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState("");
  const usaEnquadramento = isMobile && !!def.enquadramento;

  const enviados = rows.filter((r) => r.storage_path);

  const handleSelecionarArquivos = async (arquivos: File[]) => {
    setErro("");
    const validos: File[] = [];
    for (const file of arquivos) {
      const erroValidacao = validarArquivo(file);
      if (erroValidacao) { setErro(erroValidacao); continue; }
      validos.push(file);
    }
    if (validos.length === 0) return;

    setVerificando(true);
    const verificados: File[] = [];
    for (const file of validos) {
      const erroQualidade = await validarQualidadeOuErro(file);
      if (erroQualidade) { setErro(erroQualidade); continue; }
      verificados.push(file);
    }
    setVerificando(false);
    if (verificados.length === 0) return;

    setOtimizando(true);
    const comprimidos = await Promise.all(verificados.map((file) => comprimirImagem(file)));
    setOtimizando(false);

    setStaged((prev) => [...prev, ...comprimidos]);
  };

  const handleSelecionar = (files: FileList) => handleSelecionarArquivos(Array.from(files));

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

  if (usaEnquadramento && capturando) {
    const cfg = ENQUADRAMENTO_CONFIG[def.enquadramento!];
    return (
      <CapturaComEnquadramento
        proporcaoLargura={cfg.proporcaoLargura}
        proporcaoAltura={cfg.proporcaoAltura}
        orientacao={cfg.orientacao}
        instrucao={cfg.instrucaoPadrao}
        titulo={def.label}
        ehFoto3x4={def.enquadramento === "retrato_3x4"}
        onArquivoEscolhido={(file) => { setCapturando(false); handleSelecionarArquivos([file]); }}
        onCancelar={() => setCapturando(false)}
      />
    );
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 12, border: temRejeitado ? "2px solid #DC2626" : cardStyle.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{def.label}</p>
        <span
          style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap",
            background: def.obrigatorio ? "#FEE2E2" : "#F3F4F6",
            color: def.obrigatorio ? "#991B1B" : "#6B7280",
          }}
        >
          {def.obrigatorio ? "Obrigatório" : "Opcional"}
        </span>
      </div>

      {nota && <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, margin: "0 0 8px" }}>{nota}</p>}

      <div style={{ ...infoBoxStyle, fontSize: 11, padding: "8px 10px", marginBottom: 10 }}>{NOTA_HEIC_IPHONE}</div>

      {enviados.length === 0 && staged.length === 0 && (
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 10px" }}>Nenhum arquivo enviado ainda.</p>
      )}

      {enviados.map((doc, idx) => (
        <ArquivoEnviadoLinha key={doc.id} doc={doc} index={idx} token={token} onAtualizado={onAtualizado} enquadramento={def.enquadramento} titulo={def.label} />
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
        onClick={() => (usaEnquadramento ? setCapturando(true) : inputRef.current?.click())}
        disabled={enviando || otimizando || verificando}
        style={{
          width: "100%", minHeight: 40, fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: "pointer",
          border: "1px solid #D1D5DB", background: "#fff", color: "#374151", opacity: enviando || otimizando || verificando ? 0.7 : 1,
        }}
      >
        {verificando ? "Verificando qualidade..." : otimizando ? "Otimizando imagem..." : "+ Adicionar outro arquivo"}
      </button>
      {!usaEnquadramento && (
        <input
          ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
          onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleSelecionar(e.target.files); e.target.value = ""; }}
        />
      )}

      {erro && <p style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{erro}</p>}
    </div>
  );
}

export default function PassoUploadDocumentos({ token, documentos, setDocumentos, sexo, isMotorista, possuiDependentes }: Props) {
  // apenasPainel é exclusivo do upload manual pela equipe — nunca aparece aqui, mesmo
  // defensivamente (a linha em admissao_documentos nem chega a existir pra um tipo assim,
  // já que o seed automático da criação também o exclui). Hoje nenhum tipo usa isso.
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
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Envie os arquivos dos documentos abaixo (imagem ou PDF, até 10MB cada).</p>
      </div>

      <div style={{ marginTop: 12 }}>
        {tiposVisiveis.map((def) => {
          const rows = documentos.filter((d) => d.tipo_documento === def.tipo_documento);
          if (def.multiArquivo) {
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
