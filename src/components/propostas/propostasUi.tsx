"use client";

import React from "react";
import { diasRestantes, ROTULO_SITUACAO, type SituacaoProposta } from "@/lib/propostas";

export interface PropostaResumo {
  id: string;
  numero: string;
  modelo: string;
  revisao_atual: number;
  situacao: SituacaoProposta;
  cliente_nome: string;
  aos_cuidados: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  validade_ate: string | null;
  valor_estimado: number | null;
  enviada_em: string | null;
  created_at: string;
  updated_at: string;
}

export const inputStyle: React.CSSProperties = { padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", width: "100%", boxSizing: "border-box" };
export const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
export const btnPrimario: React.CSSProperties = { padding: "9px 16px", background: "#FFB800", color: "#111", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" };
export const btnSecundario: React.CSSProperties = { padding: "9px 16px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" };
export const btnPerigo: React.CSSProperties = { padding: "9px 16px", background: "#fff", color: "#B91C1C", border: "1px solid #FCA5A5", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" };
export const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 16 };

const COR_SITUACAO: Record<SituacaoProposta, { bg: string; fg: string }> = {
  rascunho: { bg: "#F3F4F6", fg: "#374151" },
  enviada: { bg: "#DBEAFE", fg: "#1E40AF" },
  em_negociacao: { bg: "#FEF3C7", fg: "#92400E" },
  aceita: { bg: "#DCFCE7", fg: "#166534" },
  recusada: { bg: "#FEE2E2", fg: "#991B1B" },
  vencida: { bg: "#FFEDD5", fg: "#9A3412" },
  cancelada: { bg: "#E5E7EB", fg: "#4B5563" },
};

export function SituacaoBadge({ situacao }: { situacao: SituacaoProposta }) {
  const c = COR_SITUACAO[situacao];
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{ROTULO_SITUACAO[situacao]}</span>;
}

export function fmtData(d: string | null): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(d).toLocaleDateString("pt-BR");
}
export function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function fmtMoeda(v: number | null): string {
  return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Validade com dias restantes; vermelho quando vencida ou a 3 dias (ou menos) de vencer.
export function ValidadeTexto({ validadeAte, situacao, hoje }: { validadeAte: string | null; situacao: SituacaoProposta; hoje: string }) {
  if (!validadeAte) return <span style={{ color: "#9CA3AF" }}>—</span>;
  const restantes = diasRestantes(validadeAte, hoje);
  const aberta = situacao === "enviada" || situacao === "em_negociacao";
  const vencida = situacao === "vencida" || (aberta && restantes < 0);
  const critico = vencida || (aberta && restantes <= 3);
  let sufixo = "";
  if (aberta) sufixo = restantes < 0 ? ` · venceu há ${-restantes} dia${restantes === -1 ? "" : "s"}` : restantes === 0 ? " · vence hoje" : ` · ${restantes} dia${restantes === 1 ? "" : "s"}`;
  else if (situacao === "vencida") sufixo = " · vencida";
  return <span style={{ color: critico ? "#B91C1C" : "#374151", fontWeight: critico ? 700 : 400 }}>{fmtData(validadeAte)}{sufixo}</span>;
}

export function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: React.ReactNode; largo?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: largo ? 720 : 520, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280" }} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "alerta" | "info"; children: React.ReactNode }) {
  const cores = { erro: ["#FEF2F2", "#FCA5A5", "#991B1B"], alerta: ["#FFFBEB", "#FCD34D", "#92400E"], info: ["#EFF6FF", "#BFDBFE", "#1E40AF"] }[tipo];
  return <div role={tipo === "erro" ? "alert" : "status"} style={{ background: cores[0], border: `1px solid ${cores[1]}`, color: cores[2], borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{children}</div>;
}

// As rotas devolvem { error } com texto pronto para exibir.
export async function lerResposta<T = Record<string, unknown>>(r: Response): Promise<{ ok: boolean; status: number; json: T & { error?: string } }> {
  let json = {} as T & { error?: string };
  try { json = await r.json(); } catch { /* resposta sem corpo */ }
  return { ok: r.ok, status: r.status, json };
}
