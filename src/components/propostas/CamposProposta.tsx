"use client";

import React from "react";
import { PADROES_RS, type ConteudoRs } from "@/lib/propostaModelos";
import { VALIDADE_MAX_DIAS, VALIDADE_MIN_DIAS, VALIDADE_PADRAO_DIAS } from "@/lib/propostas";
import { inputStyle, labelStyle } from "@/components/propostas/propostasUi";

// Tudo como texto: campo apagado chega vazio ao servidor, que recusa ("Informe o percentual."), em vez de virar 0.
export interface CamposForm {
  aos_cuidados: string;
  cliente_cnpj: string;
  cliente_endereco: string;
  validade_dias: string;
  taxa_sem_reposicao_pct: string;
  taxa_com_reposicao_pct: string;
  prazo_envio_curriculos_dias_uteis: string;
  taxa_cancelamento_pct: string;
  prazo_faturamento_dias: string;
}

export function camposPadrao(): CamposForm {
  return {
    aos_cuidados: "", cliente_cnpj: "", cliente_endereco: "", validade_dias: String(VALIDADE_PADRAO_DIAS),
    taxa_sem_reposicao_pct: String(PADROES_RS.taxa_sem_reposicao_pct),
    taxa_com_reposicao_pct: String(PADROES_RS.taxa_com_reposicao_pct),
    prazo_envio_curriculos_dias_uteis: String(PADROES_RS.prazo_envio_curriculos_dias_uteis),
    taxa_cancelamento_pct: String(PADROES_RS.taxa_cancelamento_pct),
    prazo_faturamento_dias: String(PADROES_RS.prazo_faturamento_dias),
  };
}

export function camposDeProposta(p: { aos_cuidados: string | null; validade_dias: number; conteudo: Partial<ConteudoRs> | null }): CamposForm {
  const c = p.conteudo?.condicoes ?? PADROES_RS;
  return {
    aos_cuidados: p.aos_cuidados ?? "",
    cliente_cnpj: p.conteudo?.cliente_cnpj ?? "",
    cliente_endereco: p.conteudo?.cliente_endereco ?? "",
    validade_dias: String(p.validade_dias),
    taxa_sem_reposicao_pct: String(c.taxa_sem_reposicao_pct ?? ""),
    taxa_com_reposicao_pct: String(c.taxa_com_reposicao_pct ?? ""),
    prazo_envio_curriculos_dias_uteis: String(c.prazo_envio_curriculos_dias_uteis ?? ""),
    taxa_cancelamento_pct: String(c.taxa_cancelamento_pct ?? ""),
    prazo_faturamento_dias: String(c.prazo_faturamento_dias ?? ""),
  };
}

const numero = (v: string) => v.trim().replace(",", ".");

export function conteudoDoForm(f: CamposForm) {
  return {
    cliente_cnpj: f.cliente_cnpj.trim() || null,
    cliente_endereco: f.cliente_endereco.trim() || null,
    condicoes: {
      taxa_sem_reposicao_pct: numero(f.taxa_sem_reposicao_pct),
      taxa_com_reposicao_pct: numero(f.taxa_com_reposicao_pct),
      prazo_envio_curriculos_dias_uteis: numero(f.prazo_envio_curriculos_dias_uteis),
      taxa_cancelamento_pct: numero(f.taxa_cancelamento_pct),
      prazo_faturamento_dias: numero(f.prazo_faturamento_dias),
    },
  };
}

export const validadeDoForm = (f: CamposForm) => numero(f.validade_dias);

interface Props {
  valor: CamposForm;
  onChange: (v: CamposForm) => void;
  contatos?: { id: string; nome: string; cargo: string | null }[];
  contatoId?: string;
  onContato?: (id: string) => void;
  desabilitado?: boolean;
}

export default function CamposProposta({ valor, onChange, contatos = [], contatoId = "", onContato, desabilitado }: Props) {
  const set = (k: keyof CamposForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...valor, [k]: e.target.value });
  const numerico = (k: keyof CamposForm, rotulo: string, sufixo: string) => (
    <div>
      <label style={labelStyle}>{rotulo}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input style={inputStyle} inputMode="decimal" value={valor[k]} onChange={set(k)} disabled={desabilitado} />
        <span style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap" }}>{sufixo}</span>
      </div>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div>
          <label style={labelStyle}>A/C (aos cuidados de)</label>
          {contatos.length > 0 && onContato && (
            <select style={{ ...inputStyle, marginBottom: 6 }} value={contatoId} disabled={desabilitado}
              onChange={(e) => {
                const c = contatos.find((x) => x.id === e.target.value);
                onContato(e.target.value);
                if (c) onChange({ ...valor, aos_cuidados: c.nome });
              }}>
              <option value="">Digitar outro nome…</option>
              {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` — ${c.cargo}` : ""}</option>)}
            </select>
          )}
          <input style={inputStyle} value={valor.aos_cuidados} onChange={set("aos_cuidados")} placeholder="Nome de quem vai receber a proposta" maxLength={200} disabled={desabilitado} />
        </div>
        <div>
          <label style={labelStyle}>Validade da proposta</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input style={inputStyle} inputMode="numeric" value={valor.validade_dias} onChange={set("validade_dias")} disabled={desabilitado} />
            <span style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap" }}>dias ({VALIDADE_MIN_DIAS} a {VALIDADE_MAX_DIAS})</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div>
          <label style={labelStyle}>CNPJ do cliente (opcional)</label>
          <input style={inputStyle} value={valor.cliente_cnpj} onChange={set("cliente_cnpj")} maxLength={30} disabled={desabilitado} />
        </div>
        <div>
          <label style={labelStyle}>Endereço do cliente (opcional)</label>
          <input style={inputStyle} value={valor.cliente_endereco} onChange={set("cliente_endereco")} maxLength={300} disabled={desabilitado} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Condições da proposta</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {numerico("taxa_sem_reposicao_pct", "Taxa sobre o 1º salário — vagas sem reposição", "%")}
          {numerico("taxa_com_reposicao_pct", "Taxa sobre o 1º salário — vagas com 01 reposição em 30 dias", "%")}
          {numerico("prazo_envio_curriculos_dias_uteis", "Envio dos currículos em até", "dias úteis")}
          {numerico("taxa_cancelamento_pct", "Taxa em caso de cancelamento/congelamento", "%")}
          {numerico("prazo_faturamento_dias", "Faturamento com vencimento em até", "dias")}
        </div>
      </div>
    </div>
  );
}
