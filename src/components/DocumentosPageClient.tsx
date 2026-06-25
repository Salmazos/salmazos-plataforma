"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  Upload,
  Eye,
  Download,
  Trash2,
  X,
  FileText,
  FileSpreadsheet,
  File,
  Search,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ClienteRef {
  id: string;
  nome: string;
}

interface Documento {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  tipo: string;
  cliente_id: string | null;
  storage_path: string;
  tamanho_bytes: number | null;
  extensao: string | null;
  uploaded_by: string | null;
  created_at: string;
  clientes?: { nome: string } | null;
}

interface Props {
  clientes: ClienteRef[];
  isFullAccess: boolean;
  isSupervisorOrAbove: boolean;
  analistaId: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SALMAZOS_CATEGORIAS = [
  { key: "manuais", label: "Manuais e Procedimentos" },
  { key: "politicas", label: "Políticas da Empresa" },
  { key: "formularios", label: "Formulários" },
  { key: "treinamentos", label: "Treinamentos" },
];

const CLIENTE_CATEGORIAS = [
  { key: "limpeza", label: "Limpeza e Higienização" },
  { key: "checklists", label: "Checklists" },
  { key: "cronogramas", label: "Cronogramas" },
  { key: "seguranca", label: "Segurança" },
  { key: "contratos", label: "Contratos" },
];

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.xlsx,.xls,.doc";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function ExtIcon({ ext }: { ext: string | null }) {
  const e = ext?.toLowerCase() ?? "";
  if (e === "pdf")
    return <FileText size={20} style={{ color: "#DC2626", flexShrink: 0 }} />;
  if (["xlsx", "xls"].includes(e))
    return (
      <FileSpreadsheet size={20} style={{ color: "#16A34A", flexShrink: 0 }} />
    );
  if (["doc", "docx"].includes(e))
    return <FileText size={20} style={{ color: "#2563EB", flexShrink: 0 }} />;
  return <File size={20} style={{ color: "#6B7280", flexShrink: 0 }} />;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DocumentosPageClient({
  clientes,
  isFullAccess,
  isSupervisorOrAbove,
  analistaId,
}: Props) {
  const canUpload = isFullAccess || isSupervisorOrAbove;
  const canDelete = isFullAccess;

  // Navigation state
  const [tab, setTab] = useState<"salmazos" | "clientes">("salmazos");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [clienteSel, setClienteSel] = useState<ClienteRef | null>(null);
  const [clienteSearch, setClienteSearch] = useState("");

  // Document list
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadErro, setUploadErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isInsideCategoria = categoria !== null;
  const isInsideCliente = clienteSel !== null;

  const categoriaLabel =
    tab === "salmazos"
      ? SALMAZOS_CATEGORIAS.find((c) => c.key === categoria)?.label
      : CLIENTE_CATEGORIAS.find((c) => c.key === categoria)?.label;

  const filteredClientes = clientes.filter((c) =>
    c.nome.toLowerCase().includes(clienteSearch.toLowerCase())
  );

  // ── Fetch documents ────────────────────────────────────────────────────────

  const fetchDocumentos = useCallback(async () => {
    if (!categoria) return;
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams({ tipo: tab, categoria });
      if (tab === "clientes" && clienteSel) {
        params.set("cliente_id", clienteSel.id);
      }
      const res = await fetch(`/api/documentos?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar documentos");
      setDocumentos(json.data ?? []);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [tab, categoria, clienteSel]);

  useEffect(() => {
    if (categoria) fetchDocumentos();
  }, [categoria, fetchDocumentos]);

  // ── Navigation handlers ────────────────────────────────────────────────────

  function handleTabChange(t: "salmazos" | "clientes") {
    setTab(t);
    setCategoria(null);
    setClienteSel(null);
    setClienteSearch("");
    setDocumentos([]);
  }

  function handleSelectCategoria(key: string) {
    setCategoria(key);
  }

  function handleSelectCliente(c: ClienteRef) {
    setClienteSel(c);
  }

  function handleBack() {
    if (tab === "salmazos") {
      setCategoria(null);
      setDocumentos([]);
    } else {
      if (categoria) {
        setCategoria(null);
        setDocumentos([]);
      } else {
        setClienteSel(null);
      }
    }
  }

  // ── Download / View ────────────────────────────────────────────────────────

  async function handleView(doc: Documento) {
    try {
      const res = await fetch("/api/documentos/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: doc.storage_path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      window.open(json.signedUrl, "_blank");
    } catch {
      alert("Erro ao gerar link de visualização.");
    }
  }

  async function handleDownload(doc: Documento) {
    try {
      const res = await fetch("/api/documentos/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: doc.storage_path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const a = document.createElement("a");
      a.href = json.signedUrl;
      a.download = doc.nome + (doc.extensao ? `.${doc.extensao}` : "");
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert("Erro ao gerar link de download.");
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(doc: Documento) {
    if (!confirm(`Excluir o documento "${doc.nome}"? Esta ação não pode ser desfeita.`))
      return;
    try {
      const res = await fetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDocumentos((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      alert("Erro ao excluir documento.");
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  function openUploadModal() {
    setUploadFile(null);
    setUploadErro("");
    setUploadProgress(0);
    setUploading(false);
    setShowUpload(true);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !categoria) return;
    const nomeDocumento = uploadFile.name.replace(/\.[^/.]+$/, "");

    setUploading(true);
    setUploadErro("");
    setUploadProgress(0);

    try {
      const ext = getExtension(uploadFile.name);
      const timestamp = Date.now();
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      let storagePath: string;

      if (tab === "salmazos") {
        storagePath = `salmazos/${categoria}/${timestamp}_${safeName}`;
      } else {
        storagePath = `clientes/${clienteSel!.id}/${categoria}/${timestamp}_${safeName}`;
      }

      // 1. Get signed upload URL
      setUploadProgress(10);
      const urlRes = await fetch("/api/documentos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storagePath }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlJson.error ?? "Erro ao gerar URL de upload");

      // 2. Upload file via XHR for progress tracking
      setUploadProgress(20);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) {
            const pct = 20 + Math.round((ev.loaded / ev.total) * 60);
            setUploadProgress(pct);
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error("Falha no upload do arquivo"));
        });
        xhr.addEventListener("error", () => reject(new Error("Erro de rede no upload")));
        xhr.open("PUT", urlJson.signedUrl);
        xhr.setRequestHeader("Content-Type", uploadFile.type || "application/octet-stream");
        xhr.send(uploadFile);
      });

      // 3. Register document
      setUploadProgress(85);
      const regRes = await fetch("/api/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeDocumento,
          descricao: null,
          categoria,
          tipo: tab,
          cliente_id: tab === "clientes" ? clienteSel!.id : null,
          storage_path: storagePath,
          tamanho_bytes: uploadFile.size,
          extensao: ext || null,
          uploaded_by: analistaId,
        }),
      });
      const regJson = await regRes.json();
      if (!regRes.ok) throw new Error(regJson.error ?? "Erro ao registrar documento");

      setUploadProgress(100);
      setShowUpload(false);
      fetchDocumentos();
    } catch (err) {
      setUploadErro(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Documentos
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Arquivos e procedimentos internos
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
        {(["salmazos", "clientes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              borderBottom: tab === t ? "3px solid #FFD700" : "3px solid transparent",
              background: "transparent",
              color: tab === t ? "#111827" : "#9CA3AF",
              transition: "all 0.15s",
            }}
          >
            {t === "salmazos" ? "Salmazos" : "Clientes"}
          </button>
        ))}
      </div>

      {/* Breadcrumb + Upload button */}
      {(isInsideCategoria || isInsideCliente) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={handleBack}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                background: "#fff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                marginRight: 8,
              }}
            >
              <ArrowLeft size={14} />
              Voltar
            </button>
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>Documentos</span>
            <ChevronRight size={12} style={{ color: "#D1D5DB" }} />
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>
              {tab === "salmazos" ? "Salmazos" : "Clientes"}
            </span>
            {tab === "clientes" && clienteSel && (
              <>
                <ChevronRight size={12} style={{ color: "#D1D5DB" }} />
                <span
                  style={{
                    fontSize: 13,
                    color: isInsideCategoria ? "#9CA3AF" : "#111827",
                    fontWeight: isInsideCategoria ? 400 : 600,
                  }}
                >
                  {clienteSel.nome}
                </span>
              </>
            )}
            {isInsideCategoria && (
              <>
                <ChevronRight size={12} style={{ color: "#D1D5DB" }} />
                <span style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>
                  {categoriaLabel}
                </span>
              </>
            )}
          </div>

          {canUpload && isInsideCategoria && (
            <button
              onClick={openUploadModal}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#111827",
                color: "#FFD700",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Upload size={15} />
              Upload
            </button>
          )}
        </div>
      )}

      {/* ── Tab: Salmazos ───────────────────────────────────────────────────── */}
      {tab === "salmazos" && !isInsideCategoria && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {SALMAZOS_CATEGORIAS.map((cat) => (
            <CategoryCard
              key={cat.key}
              label={cat.label}
              onClick={() => handleSelectCategoria(cat.key)}
            />
          ))}
        </div>
      )}

      {/* ── Tab: Clientes ─ list ────────────────────────────────────────────── */}
      {tab === "clientes" && !isInsideCliente && (
        <div>
          <div style={{ position: "relative", marginBottom: 16, maxWidth: 400 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
              }}
            />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clienteSearch}
              onChange={(e) => setClienteSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {filteredClientes.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCliente(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  background: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#FFD700";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(255,215,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#E5E7EB";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "#FFF9E0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FolderOpen size={18} style={{ color: "#FFD700" }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  {c.nome}
                </span>
              </button>
            ))}
            {filteredClientes.length === 0 && (
              <p style={{ fontSize: 14, color: "#9CA3AF", gridColumn: "1 / -1", textAlign: "center", padding: "32px 0" }}>
                Nenhum cliente encontrado.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Clientes ─ subcategorias ───────────────────────────────────── */}
      {tab === "clientes" && isInsideCliente && !isInsideCategoria && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {CLIENTE_CATEGORIAS.map((cat) => (
            <CategoryCard
              key={cat.key}
              label={cat.label}
              onClick={() => handleSelectCategoria(cat.key)}
            />
          ))}
        </div>
      )}

      {/* ── Document list ───────────────────────────────────────────────────── */}
      {isInsideCategoria && (
        <div>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#9CA3AF",
                padding: "32px 0",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "2px solid #FFD700",
                  borderTopColor: "transparent",
                  display: "inline-block",
                  animation: "doc-spin 0.7s linear infinite",
                }}
              />
              <style>{`@keyframes doc-spin { to { transform: rotate(360deg); } }`}</style>
              Carregando documentos…
            </div>
          ) : erro ? (
            <div
              style={{
                background: "#FEE2E2",
                color: "#991B1B",
                padding: "12px 16px",
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              {erro}
            </div>
          ) : documentos.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 0",
                color: "#9CA3AF",
              }}
            >
              <FolderOpen size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
                Nenhum documento encontrado
              </p>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                {canUpload
                  ? 'Clique em "Upload" para adicionar o primeiro documento.'
                  : "Ainda não há documentos nesta pasta."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {documentos.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 10,
                    border: "1px solid #E5E7EB",
                    background: "#fff",
                    flexWrap: "wrap",
                  }}
                >
                  <ExtIcon ext={doc.extensao} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#111827",
                        margin: 0,
                        wordBreak: "break-word",
                      }}
                    >
                      {doc.nome}
                    </p>
                    {doc.descricao && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#6B7280",
                          margin: "2px 0 0",
                          wordBreak: "break-word",
                        }}
                      >
                        {doc.descricao}
                      </p>
                    )}
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
                      {formatDate(doc.created_at)} · {formatBytes(doc.tamanho_bytes)}
                      {doc.extensao && (
                        <span
                          style={{
                            marginLeft: 8,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "#F3F4F6",
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          {doc.extensao}
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <ActionBtn
                      icon={<Eye size={14} />}
                      label="Visualizar"
                      onClick={() => handleView(doc)}
                    />
                    <ActionBtn
                      icon={<Download size={14} />}
                      label="Baixar"
                      onClick={() => handleDownload(doc)}
                    />
                    {canDelete && (
                      <ActionBtn
                        icon={<Trash2 size={14} />}
                        label="Excluir"
                        variant="danger"
                        onClick={() => handleDelete(doc)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upload Modal ────────────────────────────────────────────────────── */}
      {showUpload && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
          }}
          onClick={() => !uploading && setShowUpload(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "100%",
              maxWidth: 480,
              margin: "0 16px",
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>
                Upload de Documento
              </h2>
              <button
                onClick={() => !uploading && setShowUpload(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: uploading ? "not-allowed" : "pointer",
                  color: "#9CA3AF",
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpload}>
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 4,
                  }}
                >
                  Arquivo *
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  required
                  disabled={uploading}
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    fontSize: 13,
                    background: "#FAFAFA",
                    boxSizing: "border-box",
                  }}
                />
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
                  Formatos aceitos: PDF, Word, Excel
                </p>
              </div>

              {/* Progress bar */}
              {uploading && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: "#F3F4F6",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        background: "#FFD700",
                        borderRadius: 3,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4, marginBottom: 0 }}>
                    {uploadProgress < 20
                      ? "Preparando upload..."
                      : uploadProgress < 80
                        ? "Enviando arquivo..."
                        : uploadProgress < 100
                          ? "Registrando documento..."
                          : "Concluído!"}
                  </p>
                </div>
              )}

              {uploadErro && (
                <p
                  style={{
                    fontSize: 13,
                    color: "#DC2626",
                    marginBottom: 12,
                    background: "#FEE2E2",
                    padding: "8px 12px",
                    borderRadius: 6,
                  }}
                >
                  {uploadErro}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  disabled={uploading}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#fff",
                    color: "#374151",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: uploading ? "not-allowed" : "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: uploading || !uploadFile ? "#D1D5DB" : "#111827",
                    color: uploading || !uploadFile ? "#9CA3AF" : "#FFD700",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: uploading || !uploadFile ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CategoryCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "28px 16px",
        borderRadius: 12,
        border: "1px solid #E5E7EB",
        background: "#fff",
        cursor: "pointer",
        transition: "all 0.15s",
        textAlign: "center",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#FFD700";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(255,215,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#E5E7EB";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "#FFF9E0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FolderOpen size={24} style={{ color: "#FFD700" }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
        {label}
      </span>
    </button>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  const isDanger = variant === "danger";
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 10px",
        borderRadius: 6,
        border: `1px solid ${isDanger ? "#FCA5A5" : "#E5E7EB"}`,
        background: "#fff",
        color: isDanger ? "#DC2626" : "#374151",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isDanger ? "#DC2626" : "#FFD700";
        e.currentTarget.style.background = isDanger ? "#FEF2F2" : "#FFFDF0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isDanger ? "#FCA5A5" : "#E5E7EB";
        e.currentTarget.style.background = "#fff";
      }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
