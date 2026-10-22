"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ROTULO_MODELO, ROTULO_SITUACAO, SITUACOES } from "@/lib/propostas";
import { Aviso, cardStyle, fmtData, fmtMoeda, lerResposta } from "@/components/propostas/propostasUi";

interface Painel {
  hoje: string;
  total: number;
  por_situacao: Record<string, number>;
  por_modelo: Record<string, number>;
  valor_em_aberto: number;
  por_vendedor: { vendedor_id: string; vendedor_nome: string | null; total: number; abertas: number; valor_aberto: number; aceitas: number; valor_aceito: number }[];
  vencendo_em_7_dias: { id: string; numero: string; cliente_nome: string; validade_ate: string; vendedor_nome: string | null }[];
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: boolean }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: destaque ? "#B45309" : "#111827", marginTop: 2 }}>{valor}</div>
    </div>
  );
}

export default function PropostaPainelGestao() {
  const [dados, setDados] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await lerResposta<Painel>(await fetch("/api/comercial/propostas/painel"));
        if (!r.ok) { setErro(r.json.error ?? "Não foi possível carregar o painel."); return; }
        setDados(r.json);
      } catch {
        setErro("Não foi possível carregar o painel.");
      }
    })();
  }, []);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <p style={{ color: "#6B7280" }}>Carregando…</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Numero rotulo="Total de propostas" valor={dados.total} />
        <Numero rotulo="Valor estimado em aberto" valor={fmtMoeda(dados.valor_em_aberto)} destaque />
        <Numero rotulo="Vencendo em 7 dias" valor={dados.vencendo_em_7_dias.length} destaque={dados.vencendo_em_7_dias.length > 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Por situação</h3>
          {/* Em negociação não é mais registrada; a linha só aparece enquanto houver proposta legada nessa situação. */}
          {SITUACOES.filter((s) => s !== "em_negociacao" || (dados.por_situacao[s] ?? 0) > 0).map((s) => (
            <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
              <span>{ROTULO_SITUACAO[s]}</span><strong>{dados.por_situacao[s] ?? 0}</strong>
            </div>
          ))}
        </div>
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Por modelo</h3>
          {Object.keys(dados.por_modelo).length === 0 ? <span style={{ color: "#6B7280", fontSize: 14 }}>Sem propostas.</span> : Object.entries(dados.por_modelo).map(([m, n]) => (
            <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
              <span>{ROTULO_MODELO[m as keyof typeof ROTULO_MODELO] ?? m}</span><strong>{n}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Por vendedor</h3>
        {dados.por_vendedor.length === 0 ? <span style={{ color: "#6B7280", fontSize: 14 }}>Sem propostas.</span> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 12 }}>
                <th style={{ padding: "6px 8px" }}>Vendedor</th><th style={{ padding: "6px 8px" }}>Propostas</th><th style={{ padding: "6px 8px" }}>Em aberto</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Valor em aberto</th><th style={{ padding: "6px 8px" }}>Aceitas</th><th style={{ padding: "6px 8px", textAlign: "right" }}>Valor aceito</th>
              </tr>
            </thead>
            <tbody>
              {dados.por_vendedor.map((v) => (
                <tr key={v.vendedor_id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "6px 8px" }}>{v.vendedor_nome ?? "—"}</td><td style={{ padding: "6px 8px" }}>{v.total}</td><td style={{ padding: "6px 8px" }}>{v.abertas}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtMoeda(v.valor_aberto)}</td><td style={{ padding: "6px 8px" }}>{v.aceitas}</td><td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtMoeda(v.valor_aceito)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Vencendo em 7 dias</h3>
        {dados.vencendo_em_7_dias.length === 0 ? <span style={{ color: "#6B7280", fontSize: 14 }}>Nenhuma proposta perto de vencer.</span> : dados.vencendo_em_7_dias.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid #F3F4F6", fontSize: 14, flexWrap: "wrap" }}>
            <span><Link href={`/painel/comercial/propostas/${p.id}`} style={{ fontWeight: 800, color: "#111827" }}>{p.numero}</Link> · {p.cliente_nome}{p.vendedor_nome ? ` · ${p.vendedor_nome}` : ""}</span>
            <span style={{ color: "#B91C1C", fontWeight: 700 }}>vence em {fmtData(p.validade_ate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
