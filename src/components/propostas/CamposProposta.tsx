"use client";

import React from "react";
import {
  MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL, MAX_TEXTO_INTRODUTORIO, PADROES_RS, TEXTO_INTRODUTORIO_PADRAO_RS, type ConteudoRs,
} from "@/lib/propostaModelos";
import { caracteresOmitidos } from "@/lib/propostaTexto";
import { VALIDADE_MAX_DIAS, VALIDADE_MIN_DIAS, VALIDADE_PADRAO_DIAS } from "@/lib/propostas";
import { btnSecundario, inputStyle, labelStyle } from "@/components/propostas/propostasUi";

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
  texto_introdutorio: string;
  clausulas_adicionais: string[];
}

// Reordenação da lista de cláusulas (índice fora do intervalo não muda nada).
export function moverClausula(lista: string[], de: number, para: number): string[] {
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length || de === para) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

export function camposPadrao(): CamposForm {
  return {
    aos_cuidados: "", cliente_cnpj: "", cliente_endereco: "", validade_dias: String(VALIDADE_PADRAO_DIAS),
    taxa_sem_reposicao_pct: String(PADROES_RS.taxa_sem_reposicao_pct),
    taxa_com_reposicao_pct: String(PADROES_RS.taxa_com_reposicao_pct),
    prazo_envio_curriculos_dias_uteis: String(PADROES_RS.prazo_envio_curriculos_dias_uteis),
    taxa_cancelamento_pct: String(PADROES_RS.taxa_cancelamento_pct),
    prazo_faturamento_dias: String(PADROES_RS.prazo_faturamento_dias),
    texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_RS,
    clausulas_adicionais: [],
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
    // Proposta anterior ao texto editável (campo ausente) abre com o padrão; texto apagado de propósito continua vazio (= usa o padrão no PDF).
    texto_introdutorio: p.conteudo?.texto_introdutorio ?? TEXTO_INTRODUTORIO_PADRAO_RS,
    clausulas_adicionais: p.conteudo?.clausulas_adicionais ?? [],
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
    texto_introdutorio: f.texto_introdutorio.trim(),
    // Linha em branco é cláusula que o vendedor não preencheu: sai da lista em vez de virar erro.
    clausulas_adicionais: f.clausulas_adicionais.map((c) => c.trim()).filter(Boolean),
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
  const set = (k: Exclude<keyof CamposForm, "clausulas_adicionais">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...valor, [k]: e.target.value });
  const numerico = (k: Exclude<keyof CamposForm, "clausulas_adicionais" | "texto_introdutorio">, rotulo: string, sufixo: string) => (
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
        <label style={labelStyle}>Texto introdutório</label>
        <textarea style={{ ...inputStyle, minHeight: 150, resize: "vertical", fontFamily: "inherit" }} value={valor.texto_introdutorio} onChange={set("texto_introdutorio")}
          maxLength={MAX_TEXTO_INTRODUTORIO} disabled={desabilitado} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#6B7280", marginTop: 4, flexWrap: "wrap" }}>
          <span>Aparece antes das cláusulas. Se ficar vazio, o PDF usa o texto padrão.</span>
          <span>
            {valor.texto_introdutorio.length}/{MAX_TEXTO_INTRODUTORIO}
            {!desabilitado && valor.texto_introdutorio !== TEXTO_INTRODUTORIO_PADRAO_RS && (
              <button type="button" style={{ ...linkBotao, marginLeft: 10 }} onClick={() => onChange({ ...valor, texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_RS })}>Restaurar texto padrão</button>
            )}
          </span>
        </div>
        <AvisoOmitidos texto={valor.texto_introdutorio} />
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
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Cláusulas adicionais (opcional)</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
          Entram no PDF depois da cláusula 1.7, numeradas em sequência (1.8, 1.9…). Até {MAX_CLAUSULAS_ADICIONAIS} cláusulas de {MAX_CLAUSULA_ADICIONAL} caracteres.
        </div>
        {valor.clausulas_adicionais.map((texto, i) => (
          <div key={i} data-clausula={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 8, alignItems: "start", marginBottom: 8 }}>
            <strong style={{ fontSize: 14, paddingTop: 9 }}>{`1.${8 + i}`}</strong>
            <div>
              <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} value={texto} maxLength={MAX_CLAUSULA_ADICIONAL} disabled={desabilitado}
                onChange={(e) => onChange({ ...valor, clausulas_adicionais: valor.clausulas_adicionais.map((c, k) => (k === i ? e.target.value : c)) })} />
              <div style={{ fontSize: 12, color: "#6B7280", textAlign: "right" }}>{texto.length}/{MAX_CLAUSULA_ADICIONAL}</div>
              <AvisoOmitidos texto={texto} />
            </div>
            {!desabilitado && (
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" title="Subir" aria-label={`Subir cláusula 1.${8 + i}`} style={btnMini} disabled={i === 0}
                  onClick={() => onChange({ ...valor, clausulas_adicionais: moverClausula(valor.clausulas_adicionais, i, i - 1) })}>↑</button>
                <button type="button" title="Descer" aria-label={`Descer cláusula 1.${8 + i}`} style={btnMini} disabled={i === valor.clausulas_adicionais.length - 1}
                  onClick={() => onChange({ ...valor, clausulas_adicionais: moverClausula(valor.clausulas_adicionais, i, i + 1) })}>↓</button>
                <button type="button" title="Remover" aria-label={`Remover cláusula 1.${8 + i}`} style={{ ...btnMini, color: "#B91C1C" }}
                  onClick={() => onChange({ ...valor, clausulas_adicionais: valor.clausulas_adicionais.filter((_, k) => k !== i) })}>✕</button>
              </div>
            )}
          </div>
        ))}
        {!desabilitado && (
          <button type="button" style={btnSecundario} disabled={valor.clausulas_adicionais.length >= MAX_CLAUSULAS_ADICIONAIS}
            onClick={() => onChange({ ...valor, clausulas_adicionais: [...valor.clausulas_adicionais, ""] })}>
            + Adicionar cláusula{valor.clausulas_adicionais.length >= MAX_CLAUSULAS_ADICIONAIS ? ` (limite de ${MAX_CLAUSULAS_ADICIONAIS})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

const btnMini: React.CSSProperties = { padding: "6px 10px", background: "#fff", border: "1px solid #D1D5DB", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const linkBotao: React.CSSProperties = { background: "none", border: "none", color: "#B45309", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 };

// O PDF só imprime letras latinas, números e pontuação comum: o resto (emoji, setas...) é omitido, e o vendedor precisa saber disso.
function AvisoOmitidos({ texto }: { texto: string }) {
  const omitidos = caracteresOmitidos(texto);
  if (omitidos.length === 0) return null;
  return <div style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>O PDF não imprime estes caracteres e eles serão omitidos: {omitidos.join(" ")}</div>;
}
