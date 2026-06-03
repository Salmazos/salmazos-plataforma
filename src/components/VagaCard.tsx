"use client";

import { useState } from "react";
import Link from "next/link";

const TIPO_MAP: Record<string, { label: string; bg: string }> = {
  recrutamento_selecao:  { label: "Recrutamento e Seleção",    bg: "#1D6FA4" },
  mao_obra_temporaria:   { label: "Mão de Obra Temporária",    bg: "#F59E0B" },
  terceirizacao:         { label: "Terceirização de Serviços", bg: "#10B981" },
  avaliacao_psicologica: { label: "Avaliação Psicológica",     bg: "#8B5CF6" },
};

interface Props {
  id: string;
  slug: string;
  titulo: string;
  cidade: string | null;
  estado: string | null;
  salario: string | null;
  tipoServico: string | null;
  tipoLabel: string | null;
  salarioFormatado: string;
}

export default function VagaCard({ slug, titulo, cidade, estado, tipoServico, salarioFormatado }: Props) {
  const [hovered, setHovered] = useState(false);
  const chip = tipoServico
    ? (TIPO_MAP[tipoServico] ?? { label: tipoServico, bg: "#6b7280" })
    : null;

  return (
    <Link
      href={`/vagas/${slug}`}
      className="flex flex-col gap-3 rounded-2xl p-5 transition-all"
      style={{
        backgroundColor: "#fff",
        border: "1px solid #e5e7eb",
        textDecoration: "none",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {chip && (
        <span style={{
          display: "inline-block",
          alignSelf: "flex-start",
          backgroundColor: chip.bg,
          color: "#fff",
          fontSize: "12px",
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: "20px",
        }}>
          {chip.label}
        </span>
      )}

      <h2 style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1.35, color: "#111827" }}>
        {titulo}
      </h2>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-auto" style={{ fontSize: "12px", color: "#6b7280" }}>
        {(cidade || estado) && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            {[cidade, estado].filter(Boolean).join(" / ")}
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {salarioFormatado}
        </span>
      </div>

      <span style={{ fontSize: "12px", fontWeight: 600, color: "#FFD700", alignSelf: "flex-start" }}>
        Ver vaga →
      </span>
    </Link>
  );
}
