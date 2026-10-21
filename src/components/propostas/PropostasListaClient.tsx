"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODELOS, ROTULO_MODELO, ROTULO_SITUACAO, SITUACOES, type SituacaoProposta } from "@/lib/propostas";
import PropostaPainelGestao from "@/components/propostas/PropostaPainelGestao";
import { Aviso, btnPrimario, cardStyle, fmtMoeda, inputStyle, lerResposta, SituacaoBadge, ValidadeTexto, type PropostaResumo } from "@/components/propostas/propostasUi";

interface Props {
  podeCriar: boolean;
  gestor: boolean;
  vendedores: { id: string; nome_completo: string }[];
}

export default function PropostasListaClient({ podeCriar, gestor, vendedores }: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<"lista" | "painel">("lista");
  const [propostas, setPropostas] = useState<PropostaResumo[]>([]);
  const [hoje, setHoje] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [situacao, setSituacao] = useState<SituacaoProposta | "">("");
  const [modelo, setModelo] = useState("");
  const [vendedor, setVendedor] = useState("");

  // Uma busca por mudança de filtro (modelo/vendedor); a situação filtra na tela para os chips mostrarem as contagens.
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const qs = new URLSearchParams();
      if (modelo) qs.set("modelo", modelo);
      if (vendedor) qs.set("vendedor", vendedor);
      const r = await lerResposta<{ data: PropostaResumo[]; hoje: string }>(await fetch(`/api/comercial/propostas${qs.toString() ? `?${qs.toString()}` : ""}`));
      if (!r.ok) { setErro(r.json.error ?? "Não foi possível carregar as propostas."); return; }
      setPropostas(r.json.data ?? []);
      setHoje(r.json.hoje ?? "");
    } catch {
      setErro("Não foi possível carregar as propostas.");
    } finally {
      setCarregando(false);
    }
  }, [modelo, vendedor]);
  useEffect(() => { carregar(); }, [carregar]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of propostas) c[p.situacao] = (c[p.situacao] ?? 0) + 1;
    return c;
  }, [propostas]);
  const visiveis = situacao ? propostas.filter((p) => p.situacao === situacao) : propostas;

  const chip = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 999, border: ativo ? "1px solid #111827" : "1px solid #D1D5DB", background: ativo ? "#111827" : "#fff",
    color: ativo ? "#fff" : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer",
  });

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" }}>Propostas</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>{gestor && !podeCriar ? "Acompanhamento das propostas comerciais (somente leitura)." : "Propostas comerciais por cliente, com número oficial e revisões."}</p>
        </div>
        {podeCriar && <button style={btnPrimario} onClick={() => router.push("/painel/comercial/propostas/nova")}>Nova proposta</button>}
      </div>

      {gestor && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button style={chip(aba === "lista")} onClick={() => setAba("lista")}>Propostas</button>
          <button style={chip(aba === "painel")} onClick={() => setAba("painel")}>Painel de gestão</button>
        </div>
      )}

      {aba === "painel" && gestor ? <PropostaPainelGestao /> : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button style={chip(situacao === "")} onClick={() => setSituacao("")}>Todas ({propostas.length})</button>
            {SITUACOES.map((s) => <button key={s} style={chip(situacao === s)} onClick={() => setSituacao(s)}>{ROTULO_SITUACAO[s]} ({contagem[s] ?? 0})</button>)}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <select style={{ ...inputStyle, width: 220 }} value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Filtrar por modelo">
              <option value="">Todos os modelos</option>
              {MODELOS.map((m) => <option key={m} value={m}>{ROTULO_MODELO[m]}</option>)}
            </select>
            {gestor && (
              <select style={{ ...inputStyle, width: 240 }} value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Filtrar por vendedor">
                <option value="">Todos os vendedores</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome_completo}</option>)}
              </select>
            )}
          </div>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {carregando ? <p style={{ color: "#6B7280" }}>Carregando…</p> : visiveis.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", color: "#6B7280" }}>
              {propostas.length === 0 ? "Nenhuma proposta ainda." : "Nenhuma proposta nesta situação."}
              {podeCriar && propostas.length === 0 && <div style={{ marginTop: 10 }}><Link href="/painel/comercial/propostas/nova" style={{ color: "#B45309", fontWeight: 700 }}>Criar a primeira proposta</Link></div>}
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB", textAlign: "left", color: "#6B7280", fontSize: 12 }}>
                    <th style={{ padding: "10px 14px" }}>Número</th>
                    <th style={{ padding: "10px 14px" }}>Cliente</th>
                    {gestor && <th style={{ padding: "10px 14px" }}>Vendedor</th>}
                    <th style={{ padding: "10px 14px" }}>Situação</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Valor estimado</th>
                    <th style={{ padding: "10px 14px" }}>Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => (
                    <tr key={p.id} onClick={() => router.push(`/painel/comercial/propostas/${p.id}`)} style={{ borderTop: "1px solid #F3F4F6", cursor: "pointer" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <Link href={`/painel/comercial/propostas/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 800, color: "#111827", fontSize: 15 }}>{p.numero}</Link>
                        {p.revisao_atual > 0 && <span style={{ marginLeft: 6, fontSize: 12, color: "#6B7280" }}>Rev. {p.revisao_atual}</span>}
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{ROTULO_MODELO[p.modelo as keyof typeof ROTULO_MODELO] ?? p.modelo}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{p.cliente_nome}{p.aos_cuidados && <div style={{ fontSize: 12, color: "#6B7280" }}>A/C {p.aos_cuidados}</div>}</td>
                      {gestor && <td style={{ padding: "10px 14px" }}>{p.vendedor_nome ?? "—"}</td>}
                      <td style={{ padding: "10px 14px" }}><SituacaoBadge situacao={p.situacao} /></td>
                      <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoeda(p.valor_estimado)}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}><ValidadeTexto validadeAte={p.validade_ate} situacao={p.situacao} hoje={hoje} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
