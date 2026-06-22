"use client";

import { useState } from "react";
import VagaCard from "./VagaCard";

interface VagaItem {
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

interface Props {
  vagas: VagaItem[];
}

export default function VagasListaClient({ vagas }: Props) {
  const [busca, setBusca] = useState("");

  const filtradas = busca
    ? vagas.filter((v) => v.titulo.toLowerCase().includes(busca.toLowerCase()))
    : vagas;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "#fff" }}>Vagas Abertas</h1>
        <p className="mt-1 text-sm" style={{ color: "#9ca3af" }}>
          {vagas.length} {vagas.length === 1 ? "vaga disponível" : "vagas disponíveis"} no momento
        </p>

        {/* Campo de pesquisa */}
        <div style={{ position: "relative", marginTop: "20px" }}>
          <svg
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "18px",
              height: "18px",
              color: "#9ca3af",
              pointerEvents: "none",
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar vaga por título..."
            style={{
              width: "100%",
              backgroundColor: "#ffffff",
              color: "#111827",
              border: "1px solid #d1d5db",
              borderRadius: "12px",
              padding: "12px 16px 12px 42px",
              fontSize: "15px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <style>{`
          @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 0 0px rgba(255, 215, 0, 0); transform: scale(1); }
            50% { box-shadow: 0 0 18px 4px rgba(255, 215, 0, 0.45); transform: scale(1.02); }
          }
        `}</style>
        <a
          href="/candidatura"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: "20px",
            padding: "16px 32px",
            backgroundColor: "#FFD700",
            color: "#111",
            borderRadius: "12px",
            fontSize: "15px",
            fontWeight: "bold",
            textDecoration: "none",
            animation: "pulseGlow 2.4s ease-in-out infinite",
            maxWidth: "520px",
            margin: "20px auto 0",
            whiteSpace: "normal",
            lineHeight: "1.6",
          }}
        >
          Não encontrou uma vaga para você?<br />Clique aqui e se cadastre em nosso Banco de Talentos! →
        </a>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}>
          <p className="text-sm" style={{ color: "#9ca3af" }}>
            {busca
              ? "Nenhuma vaga encontrada para sua pesquisa."
              : "Nenhuma vaga aberta no momento. Volte em breve!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtradas.map((v) => (
            <VagaCard
              key={v.id}
              id={v.id}
              slug={v.slug}
              titulo={v.titulo}
              cidade={v.cidade}
              estado={v.estado}
              salario={v.salario}
              tipoServico={v.tipoServico}
              tipoLabel={v.tipoLabel}
              salarioFormatado={v.salarioFormatado}
            />
          ))}
        </div>
      )}
    </>
  );
}
