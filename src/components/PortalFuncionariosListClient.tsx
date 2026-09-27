"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import PortalDocumentoBadge from "@/components/PortalDocumentoBadge";
import PortalDocumentosFuncionarioModal from "@/components/PortalDocumentosFuncionarioModal";

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

// Avatar circular — foto (própria ou reaproveitada da Foto 3x4 da admissão, resolvida no
// server, ver lib/funcionarioFoto.ts) ou iniciais como placeholder quando não há nenhuma.
// Mesmo componente usado no painel interno (ver FuncionariosPageClient.tsx) — mantido
// duplicado aqui de propósito, igual ao resto deste arquivo (Campo, normalizarBusca), já que
// portal e painel são bundles/apps separados e não compartilham client components hoje.
function AvatarFuncionario({ fotoUrl, nome, tamanho = 44 }: { fotoUrl: string | null; nome: string; tamanho?: number }) {
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- signed URL temporária (expira em
    // ~2h), não faz sentido pro otimizador de imagem do Next cachear/reprocessar.
    return (
      <img
        src={fotoUrl}
        alt={nome}
        width={tamanho}
        height={tamanho}
        style={{ width: tamanho, height: tamanho, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: "50%",
        background: "#F3F4F6",
        color: "#9CA3AF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: tamanho * 0.36,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {iniciais || "?"}
    </div>
  );
}

export interface FuncionarioPortalRow {
  id: string;
  nomeCompleto: string;
  fotoUrl: string | null;
  status: "ativo" | "desligado";
  encaminhamentoId: string | null;
  dataNascimento: string;
  rg: string;
  cpf: string;
  pis: string;
  dataAdmissao: string;
  dataDesligamento: string | null;
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
  const [aba, setAba] = useState<"ativo" | "desligado">("ativo");
  const [busca, setBusca] = useState("");
  const [funcionarioDocsAberto, setFuncionarioDocsAberto] = useState<{ id: string; nome: string } | null>(null);

  const doTab = useMemo(() => funcionarios.filter((f) => f.status === aba), [funcionarios, aba]);
  const totalAtivos = useMemo(() => funcionarios.filter((f) => f.status === "ativo").length, [funcionarios]);
  const totalDesligados = useMemo(() => funcionarios.filter((f) => f.status === "desligado").length, [funcionarios]);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return doTab;
    return doTab.filter((f) => normalizarBusca(f.nomeCompleto).includes(termo));
  }, [busca, doTab]);

  const buscaAtiva = busca.trim().length > 0;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(
          [
            { valor: "ativo" as const, label: "Ativos", total: totalAtivos },
            { valor: "desligado" as const, label: "Rescindidos", total: totalDesligados },
          ]
        ).map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => setAba(opcao.valor)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: aba === opcao.valor ? "1px solid #FFD700" : "1px solid #E5E7EB",
              background: aba === opcao.valor ? "#FFD700" : "#FFFFFF",
              color: aba === opcao.valor ? "#111827" : "#6B7280",
              transition: "all .15s",
            }}
          >
            {opcao.label} [ {opcao.total} ]
          </button>
        ))}
      </div>

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
        {buscaAtiva && (
          <p style={{ fontSize: 15, fontWeight: 700, color: "#6B7280", whiteSpace: "nowrap" }}>
            Encontrados [ {filtrados.length} ]
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtrados.length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
            {buscaAtiva
              ? "Nenhum funcionário encontrado para essa busca."
              : aba === "ativo"
                ? "Nenhum funcionário ativo encontrado."
                : "Nenhum funcionário rescindido encontrado."}
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AvatarFuncionario fotoUrl={f.fotoUrl} nome={f.nomeCompleto} />
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
                  </div>
                  {/* Rescindido não tem acesso a documento (ASSUNÇÃO DE NEGÓCIO CONFIRMADA
                      COM O OLVER — ver comentário em portal/(app)/funcionarios/page.tsx),
                      então o botão nem aparece pra não sugerir uma ação que vai falhar. */}
                  {f.status === "ativo" && (
                    <button
                      type="button"
                      onClick={() => setFuncionarioDocsAberto({ id: f.id, nome: f.nomeCompleto })}
                      className="btn-outline flex-shrink-0"
                      style={{ padding: "5px 12px", fontSize: 12 }}
                    >
                      Ver documentos
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 28, rowGap: 14 }}>
                  <Campo label="Data de nascimento">{f.dataNascimento}</Campo>
                  <Campo label="RG">{f.rg}</Campo>
                  <Campo label="CPF">{f.cpf}</Campo>
                  <Campo label="PIS">{f.pis}</Campo>
                  <Campo label="Data de admissão">{f.dataAdmissao}</Campo>
                  {f.status === "desligado" && (
                    <Campo label="Data de desligamento">{f.dataDesligamento ?? "—"}</Campo>
                  )}
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

      {funcionarioDocsAberto && (
        <PortalDocumentosFuncionarioModal
          funcionarioId={funcionarioDocsAberto.id}
          nomeFuncionario={funcionarioDocsAberto.nome}
          onClose={() => setFuncionarioDocsAberto(null)}
        />
      )}
    </div>
  );
}
