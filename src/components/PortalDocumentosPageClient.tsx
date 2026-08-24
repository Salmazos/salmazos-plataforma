"use client";

import { useState } from "react";
import { FolderOpen, ArrowLeft, FileText, FileSpreadsheet, File } from "lucide-react";
import { CLIENTE_CATEGORIAS } from "@/lib/documentosCategorias";
import PortalDocumentoBadge from "./PortalDocumentoBadge";

interface CategoriaCustomizada {
  id: string;
  chave: string;
  label: string;
}

interface Documento {
  id: string;
  nome: string;
  categoria: string;
  extensao: string | null;
  created_at: string;
}

interface Props {
  categoriasCustomizadas: CategoriaCustomizada[];
  documentos: Documento[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ExtIcon({ ext }: { ext: string | null }) {
  const e = ext?.toLowerCase() ?? "";
  if (e === "pdf") return <FileText size={20} style={{ color: "#DC2626", flexShrink: 0 }} />;
  if (["xlsx", "xls"].includes(e)) return <FileSpreadsheet size={20} style={{ color: "#16A34A", flexShrink: 0 }} />;
  if (["doc", "docx"].includes(e)) return <FileText size={20} style={{ color: "#2563EB", flexShrink: 0 }} />;
  return <File size={20} style={{ color: "#6B7280", flexShrink: 0 }} />;
}

// Só leitura — sem upload/exclusão (isso continua exclusivo do painel interno, ver
// DocumentosPageClient.tsx). As 5 categorias fixas (CLIENTE_CATEGORIAS) sempre aparecem,
// mesmo vazias, + as customizadas desse cliente específico (documentos_categorias_customizadas).
export default function PortalDocumentosPageClient({ categoriasCustomizadas, documentos }: Props) {
  const [categoria, setCategoria] = useState<string | null>(null);

  const categoriasTodas: { key: string; label: string; custom?: boolean }[] = [
    ...CLIENTE_CATEGORIAS,
    ...categoriasCustomizadas.map((c) => ({ key: c.chave, label: c.label, custom: true })),
  ];
  const categoriaAtual = categoriasTodas.find((c) => c.key === categoria);
  const documentosDaCategoria = documentos.filter((d) => d.categoria === categoria);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Documentos</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Arquivos compartilhados pela Salmazos com sua empresa. Somente leitura.
        </p>
      </div>

      {categoria && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setCategoria(null)}
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
              marginBottom: 12,
            }}
          >
            <ArrowLeft size={14} />
            Voltar
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>
            {categoriaAtual?.label ?? categoria}
          </h2>
        </div>
      )}

      {!categoria ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {categoriasTodas.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoria(cat.key)}
              style={{
                position: "relative",
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
                textAlign: "center",
              }}
            >
              {cat.custom && (
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#F3F4F6",
                    color: "#6B7280",
                    textTransform: "uppercase",
                  }}
                >
                  Personalizada
                </span>
              )}
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
              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.label}</span>
            </button>
          ))}
        </div>
      ) : documentosDaCategoria.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF" }}>
          <FolderOpen size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Nenhum documento nesta pasta ainda</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documentosDaCategoria.map((doc) => (
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
                <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: 0, wordBreak: "break-word" }}>
                  {doc.nome}
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>{formatDate(doc.created_at)}</p>
              </div>
              <PortalDocumentoBadge
                label="Baixar"
                bg="#EFF6FF"
                text="#1D4ED8"
                url={`/api/portal/documentos/${doc.id}/url`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
