"use client";

import { useMemo, useState } from "react";
import type { AbaConfig } from "@/lib/abasConfig";

export interface AnalistaRow {
  analistaPerfilId: string;
  nomeCompleto: string;
  email: string;
  cargo: string | null;
  nivelAcesso: string | null;
}

export interface ExcecaoInicial {
  analistaPerfilId: string;
  chaveAba: string;
  liberado: boolean;
}

interface Props {
  analistasIniciais: AnalistaRow[];
  abas: AbaConfig[];
  excecoesIniciais: ExcecaoInicial[];
  // Chave "analistaPerfilId::chaveAba" -> teria acesso por papel, sem exceção (calculado no
  // server component com acessoPadraoPorPapel — ver regraPadraoPorPapel.ts). Não pode ser
  // calculado aqui porque essa função importa PAPEIS_FULL_ACCESS/PAPEIS_PAINEL_*, que puxam
  // createServiceClient (next/headers) na cadeia de import — inválido em componente cliente.
  regraPadrao: Record<string, boolean>;
}

// null = sem exceção (comportamento de papel padrão), true = liberado, false = bloqueado —
// mesmos 3 estados que a célula da matriz cicla ao clicar.
type Estado = boolean | null;

function chave(analistaPerfilId: string, chaveAba: string) {
  return `${analistaPerfilId}::${chaveAba}`;
}

function proximoEstado(atual: Estado): Estado {
  if (atual === null) return true;
  if (atual === true) return false;
  return null;
}

const ESTILO_ESTADO: Record<string, { bg: string; border: string; color: string; label: string }> = {
  sem_excecao: { bg: "#F9FAFB", border: "#E5E7EB", color: "#9CA3AF", label: "—" },
  liberado: { bg: "#DCFCE7", border: "#86EFAC", color: "#15803D", label: "Liberado" },
  bloqueado: { bg: "#FEE2E2", border: "#FCA5A5", color: "#B91C1C", label: "Bloqueado" },
};

function estiloDoEstado(estado: Estado) {
  if (estado === true) return ESTILO_ESTADO.liberado;
  if (estado === false) return ESTILO_ESTADO.bloqueado;
  return ESTILO_ESTADO.sem_excecao;
}

export default function AcessoCustomizadoConfigClient({ analistasIniciais, abas, excecoesIniciais, regraPadrao }: Props) {
  const [busca, setBusca] = useState("");
  const [mapa, setMapa] = useState<Map<string, Estado>>(
    () => new Map(excecoesIniciais.map((e) => [chave(e.analistaPerfilId, e.chaveAba), e.liberado]))
  );
  const [salvando, setSalvando] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    const porGrupo = new Map<string, AbaConfig[]>();
    for (const aba of abas) {
      const lista = porGrupo.get(aba.grupo) ?? [];
      lista.push(aba);
      porGrupo.set(aba.grupo, lista);
    }
    return [...porGrupo.entries()];
  }, [abas]);

  const analistasFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return analistasIniciais;
    return analistasIniciais.filter(
      (a) => a.nomeCompleto.toLowerCase().includes(termo) || a.email.toLowerCase().includes(termo)
    );
  }, [analistasIniciais, busca]);

  const handleClickCelula = async (analistaPerfilId: string, chaveAba: string) => {
    const k = chave(analistaPerfilId, chaveAba);
    const atual = mapa.get(k) ?? null;
    const proximo = proximoEstado(atual);

    setMapa((prev) => new Map(prev).set(k, proximo));
    setSalvando((prev) => new Set(prev).add(k));

    try {
      const res = await fetch("/api/configuracoes/acesso-customizado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analista_perfil_id: analistaPerfilId, chave_aba: chaveAba, liberado: proximo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMapa((prev) => new Map(prev).set(k, atual));
    } finally {
      setSalvando((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Acesso Customizado</h1>
        <p className="text-sm text-gray-500 mt-1">
          Exceção individual por pessoa e aba. Uma exceção sempre vence sobre o papel padrão do usuário —
          clique numa célula pra ciclar entre Sem exceção → Liberado → Bloqueado → Sem exceção. Esta tabela
          ainda não afeta nenhuma tela hoje; cada módulo passa a respeitar a exceção só quando for migrado
          pra usar este sistema.
        </p>
      </div>

      <div className="card mb-4">
        <input
          type="text"
          placeholder="Buscar analista por nome ou e-mail..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 360,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            fontSize: 13,
          }}
        />
      </div>

      <div className="card">
        {analistasFiltrados.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum analista encontrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "#fff",
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#6B7280",
                      textTransform: "uppercase",
                      borderBottom: "1px solid #F3F4F6",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Analista
                  </th>
                  {grupos.map(([grupo, lista]) => (
                    <th
                      key={grupo}
                      colSpan={lista.length}
                      style={{
                        textAlign: "center",
                        padding: "6px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#6B7280",
                        textTransform: "uppercase",
                        borderBottom: "1px solid #F3F4F6",
                        borderLeft: "1px solid #F3F4F6",
                      }}
                    >
                      {grupo}
                    </th>
                  ))}
                </tr>
                <tr>
                  {grupos.flatMap(([grupo, lista]) =>
                    lista.map((aba, idx) => (
                      <th
                        key={aba.chave}
                        title={aba.rotulo}
                        style={{
                          padding: "6px 6px",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#9CA3AF",
                          borderBottom: "1px solid #F3F4F6",
                          borderLeft: idx === 0 ? "1px solid #F3F4F6" : undefined,
                          maxWidth: 90,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {aba.rotulo}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {analistasFiltrados.map((a) => (
                  <tr key={a.analistaPerfilId} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        background: "#fff",
                        padding: "6px 12px",
                        fontWeight: 600,
                        color: "#111827",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.nomeCompleto}
                      <div style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF", textTransform: "capitalize" }}>
                        {a.nivelAcesso ?? "—"}
                      </div>
                    </td>
                    {grupos.flatMap(([, lista]) =>
                      lista.map((aba, idx) => {
                        const k = chave(a.analistaPerfilId, aba.chave);
                        const estado = mapa.get(k) ?? null;
                        const estilo = estiloDoEstado(estado);
                        const ocupado = salvando.has(k);
                        const acessoPadrao = estado === null ? (regraPadrao[k] ?? false) : null;
                        return (
                          <td
                            key={aba.chave}
                            style={{ padding: 3, borderLeft: idx === 0 ? "1px solid #F3F4F6" : undefined }}
                          >
                            <button
                              type="button"
                              onClick={() => handleClickCelula(a.analistaPerfilId, aba.chave)}
                              disabled={ocupado}
                              title={`${aba.rotulo}: ${estilo.label === "—" ? "Sem exceção" : estilo.label}`}
                              style={{
                                width: 64,
                                height: 24,
                                borderRadius: 6,
                                border: `1px solid ${estilo.border}`,
                                background: estilo.bg,
                                color: estilo.color,
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: ocupado ? "wait" : "pointer",
                                opacity: ocupado ? 0.6 : 1,
                              }}
                            >
                              {estilo.label}
                            </button>
                            {acessoPadrao !== null && (
                              <div
                                style={{
                                  width: 64,
                                  textAlign: "center",
                                  fontSize: 9,
                                  color: acessoPadrao ? "#86EFAC" : "#FCA5A5",
                                  marginTop: 2,
                                }}
                              >
                                Acesso: {acessoPadrao ? "Sim" : "Não"}
                              </div>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
