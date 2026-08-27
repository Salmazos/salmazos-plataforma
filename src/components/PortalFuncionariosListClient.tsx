"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import PortalDocumentoBadge from "@/components/PortalDocumentoBadge";

// Rótulo em cima, valor embaixo — mesmo padrão visual da tela (ver Campo em
// funcionarios/page.tsx), duplicado aqui só porque virou componente client separado.
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 90 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 3px", whiteSpace: "nowrap" }}>
        {label}
      </p>
      <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{children}</div>
    </div>
  );
}

// Mesma técnica de remoção de acento usada em slugify()/lib/utils.ts e em
// calcularMatchCandidato.ts — busca ignora acento e caixa.
function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface FuncionarioPortalRow {
  id: string;
  nomeCompleto: string;
  encaminhamentoId: string | null;
  dataNascimento: string;
  rg: string;
  cpf: string;
  pis: string;
  dataAdmissao: string;
  cargo: string;
  turno: string;
  celular: string;
  badgeAso: { label: string; bg: string; text: string; url: string | null };
  badgeContrato: { label: string; bg: string; text: string; url: string | null };
}

interface Props {
  funcionarios: FuncionarioPortalRow[];
}

export default function PortalFuncionariosListClient({ funcionarios }: Props) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return funcionarios;
    return funcionarios.filter((f) => normalizarBusca(f.nomeCompleto).includes(termo));
  }, [busca, funcionarios]);

  const totalGeral = funcionarios.length;
  const buscaAtiva = busca.trim().length > 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:w-56">
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none"
            style={{ padding: "9px 12px 9px 36px" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#FFD700")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#6B7280", whiteSpace: "nowrap" }}>
          {buscaAtiva ? `Funcionários encontrados  [ ${filtrados.length} ]` : `Total Funcionários  [ ${totalGeral} ]`}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtrados.length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
            {buscaAtiva ? "Nenhum funcionário encontrado para essa busca." : "Nenhum funcionário ativo encontrado."}
          </p>
        ) : (
          filtrados.map((f, i) => {
            const nomeStyle: React.CSSProperties = {
              fontSize: 16,
              fontWeight: 700,
              color: "#111827",
              textDecoration: "underline",
              textDecorationThickness: 1,
              margin: "0 0 12px",
            };
            return (
              <div
                key={f.id}
                style={{
                  padding: "16px 20px",
                  borderBottom: i < filtrados.length - 1 ? "1px solid #F3F4F6" : "none",
                }}
              >
                {f.encaminhamentoId ? (
                  <Link
                    href={`/portal/candidato/${f.encaminhamentoId}`}
                    style={{ ...nomeStyle, display: "inline-block" }}
                    className="hover:text-[#92400E] transition-colors"
                  >
                    {f.nomeCompleto}
                  </Link>
                ) : (
                  <p style={nomeStyle}>{f.nomeCompleto}</p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 28, rowGap: 14 }}>
                  <Campo label="Data de nascimento">{f.dataNascimento}</Campo>
                  <Campo label="RG">{f.rg}</Campo>
                  <Campo label="CPF">{f.cpf}</Campo>
                  <Campo label="PIS">{f.pis}</Campo>
                  <Campo label="Data de admissão">{f.dataAdmissao}</Campo>
                  <Campo label="Função">{f.cargo}</Campo>
                  <Campo label="Turno de trabalho">{f.turno}</Campo>
                  <Campo label="Celular">{f.celular}</Campo>
                  <Campo label="ASO Periódico">
                    <PortalDocumentoBadge label={f.badgeAso.label} bg={f.badgeAso.bg} text={f.badgeAso.text} url={f.badgeAso.url} />
                  </Campo>
                  <Campo label="Contrato">
                    <PortalDocumentoBadge label={f.badgeContrato.label} bg={f.badgeContrato.bg} text={f.badgeContrato.text} url={f.badgeContrato.url} />
                  </Campo>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
