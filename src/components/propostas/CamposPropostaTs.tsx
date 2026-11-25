"use client";

import React, { useEffect, useState } from "react";
import { MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL } from "@/lib/propostaClausulas";
import { numeroClausulaAdicionalMot } from "@/lib/propostaMot";
import { ESCALAS_TS, MAX_SERVICOS_TS, MAX_TEXTO_INTRODUTORIO_TS, TEXTO_INTRODUTORIO_PADRAO_TS, TIPOS_ADICIONAL_TS, TIPOS_BENEFICIO_TS, type ConteudoTs } from "@/lib/propostaTs";
import type { PreviaTs } from "@/lib/propostaServico";
import { caracteresOmitidos } from "@/lib/propostaTexto";
import { VALIDADE_MAX_DIAS, VALIDADE_MIN_DIAS, VALIDADE_PADRAO_DIAS } from "@/lib/propostas";
import { moverClausula } from "@/components/propostas/CamposProposta";
import { percentualParaBp } from "@/components/propostas/PercentuaisMotAdmin";
import { PlanilhaTsView } from "@/components/propostas/PlanilhaTsView";
import CampoMoeda from "@/components/ui/CampoMoeda";
import { Aviso, btnSecundario, inputStyle, labelStyle, lerResposta } from "@/components/propostas/propostasUi";

// Formulário da proposta de Terceirização. Cada POSTO da tela vira um serviço do tipo "postos" com um posto só (o schema aceita vários postos por serviço; esta tela não
// os cria). Dinheiro fica em REAIS na tela e vai em CENTAVOS no envio; a tela não calcula nada: o valor vem da prévia do servidor.
export const URL_CONFIGURAR_PERCENTUAIS_TS = "/painel/comercial/propostas?aba=percentuais-ts";
export const MSG_JUSTIFICATIVA_MARGEM = "Informe a justificativa para liberar a margem abaixo do mínimo.";

export interface AdicionalForm { tipo: string; modo: "valor" | "percentual"; valor: number; percentual: string }
export interface BeneficioForm { tipo: string; valor: number }
export interface PostoForm {
  kind: "posto";
  nome: string; // serviço/função
  escopo: string; // opcional
  escala: string;
  escala_texto: string;
  horas_semanais: string; // só na tela (informativa): o que vai é horas_mensais
  horas_mensais: string;
  efetivos: string;
  salario: number;
  adicionais: AdicionalForm[];
  beneficios: BeneficioForm[];
  uniforme: number;
  salmazos_fornece: boolean;
  insumos: number; // por efetivo
  operacao: number; // por efetivo
  // Só da diretoria na tela. O preço manual (e a justificativa dele) viaja escondido para quem não é gestor, para a edição não apagar o que a diretoria definiu.
  preco_manual: number;
  justificativa_preco_manual: string;
  cobertura: string; // "" = usa a cobertura padrão
}
// Serviço que esta tela não sabe editar (serviço fechado ou com vários postos): fica guardado como veio e volta igual ao salvar.
export interface BlocoForm { kind: "bloco"; servico: Record<string, unknown> }
export type ItemForm = PostoForm | BlocoForm;
export interface CamposTsForm {
  aos_cuidados: string;
  validade_dias: string;
  itens: ItemForm[];
  vencimentos_dias: string;
  antecedencia_dias: string;
  texto_introdutorio: string;
  cargo_supervisao: string;
  clausulas_adicionais: string[];
  iss_override: string; // só diretoria; "" = usa o ISS dos percentuais
  justificativa_margem: string; // só gestor, e só pedida quando a margem fica abaixo do mínimo
}

export const postoTsNovo = (): PostoForm => ({
  kind: "posto", nome: "", escopo: "", escala: "44h", escala_texto: "", horas_semanais: "44", horas_mensais: "220", efetivos: "1", salario: 0, adicionais: [], beneficios: [],
  uniforme: 0, salmazos_fornece: false, insumos: 0, operacao: 0, preco_manual: 0, justificativa_preco_manual: "", cobertura: "",
});

export function camposTsPadrao(): CamposTsForm {
  return {
    aos_cuidados: "", validade_dias: String(VALIDADE_PADRAO_DIAS), itens: [postoTsNovo()], vencimentos_dias: "15, 30", antecedencia_dias: "5",
    texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_TS, cargo_supervisao: "", clausulas_adicionais: [], iss_override: "", justificativa_margem: "",
  };
}

const centavos = (reais: number): number => Math.round((reais || 0) * 100);
const reais = (c: unknown): number => (typeof c === "number" ? c / 100 : 0);
const numeroTexto = (v: string) => v.trim().replace(",", ".");
const bpTexto = (bp: unknown): string => (typeof bp === "number" ? String(bp / 100).replace(".", ",") : "");
export const validadeTsDoForm = (f: CamposTsForm) => numeroTexto(f.validade_dias);
function inteiroOuNull(t: string): number | null {
  const x = numeroTexto(t);
  return x === "" || Number.isNaN(Number(x)) ? null : Number(x);
}
function diasDoTexto(t: string): (number | null)[] {
  return t.split(/[^0-9a-zA-Z]+/).filter((x) => x !== "" && !/^e$/i.test(x)).map((x) => (/^[0-9]+$/.test(x) ? Number(x) : null));
}

type Cru = Record<string, any>;
// Conteúdo gravado → formulário. Serviço de um posto vira posto da tela; o resto vira bloco preservado.
export function camposTsDeProposta(p: { aos_cuidados: string | null; validade_dias: number; conteudo: Partial<ConteudoTs> | null }): CamposTsForm {
  const c = (p.conteudo ?? {}) as Cru;
  const itens: ItemForm[] = ((c.servicos ?? []) as Cru[]).map((s): ItemForm => {
    if (s.modo !== "postos" || !Array.isArray(s.postos) || s.postos.length !== 1) return { kind: "bloco", servico: s };
    const po = s.postos[0] as Cru;
    const mensais = typeof po.horas_mensais === "number" ? po.horas_mensais : 220;
    return {
      kind: "posto",
      nome: s.nome ?? po.funcao ?? "", escopo: s.descricao ?? "", escala: po.escala ?? "44h", escala_texto: po.escala_texto ?? "",
      horas_semanais: String(Math.round(mensais / 5)), horas_mensais: String(mensais), efetivos: String(po.efetivos ?? 1), salario: reais(po.salario_centavos),
      adicionais: ((po.adicionais ?? []) as Cru[]).map((a) => ({ tipo: a.tipo, modo: a.modo === "percentual" ? "percentual" : "valor", valor: reais(a.valor_centavos), percentual: bpTexto(a.percentual_bp) })),
      beneficios: ((po.beneficios ?? []) as Cru[]).map((b) => ({ tipo: b.tipo, valor: reais(b.valor_centavos) })),
      uniforme: reais(po.uniforme_epi_centavos),
      salmazos_fornece: s.fornecimento?.equipamentos === "salmazos" || s.fornecimento?.produtos === "salmazos",
      insumos: reais(po.insumos_centavos), operacao: reais(po.operacao_centavos),
      preco_manual: reais(s.preco_manual_centavos), justificativa_preco_manual: s.justificativa_preco_manual ?? "", cobertura: bpTexto(po.cobertura_bp_override),
    };
  });
  return {
    aos_cuidados: p.aos_cuidados ?? "",
    validade_dias: String(p.validade_dias),
    itens: itens.length > 0 ? itens : [postoTsNovo()],
    vencimentos_dias: (c.condicoes?.vencimentos_dias ?? [15, 30]).join(", "),
    antecedencia_dias: String(c.condicoes?.antecedencia_dias ?? 5),
    texto_introdutorio: c.texto_introdutorio ?? TEXTO_INTRODUTORIO_PADRAO_TS,
    cargo_supervisao: c.cargo_supervisao ?? "",
    clausulas_adicionais: c.clausulas_adicionais ?? [],
    iss_override: bpTexto(c.iss_override_bp),
    justificativa_margem: c.justificativa_margem_minima ?? "",
  };
}

// Posto com o mínimo para o servidor calcular (a prévia só leva os postos completos: um posto pela metade não derruba o cálculo dos outros).
export function postoTsPronto(p: PostoForm): boolean {
  const efetivos = inteiroOuNull(p.efetivos), mensais = inteiroOuNull(p.horas_mensais);
  return p.nome.trim() !== "" && p.salario > 0 && efetivos !== null && efetivos >= 1 && mensais !== null && mensais >= 1 && (p.escala !== "outra" || p.escala_texto.trim() !== "");
}

function servicoDoPosto(p: PostoForm, gestor: boolean) {
  // Linha sem valor é linha que o vendedor não preencheu: sai da lista em vez de virar erro.
  const adicionais = p.adicionais.flatMap((a): Record<string, unknown>[] => {
    if (a.modo === "valor") return a.valor > 0 ? [{ tipo: a.tipo, modo: "valor" as const, valor_centavos: centavos(a.valor) }] : [];
    return a.percentual.trim() === "" ? [] : [{ tipo: a.tipo, modo: "percentual" as const, percentual_bp: percentualParaBp(a.percentual) }];
  });
  const beneficios = p.beneficios.filter((b) => b.valor > 0).map((b) => ({ tipo: b.tipo, valor_centavos: centavos(b.valor) }));
  const fornece = p.salmazos_fornece ? "salmazos" : "cliente";
  const cobertura = gestor ? { cobertura_bp_override: p.cobertura.trim() === "" ? null : percentualParaBp(p.cobertura) } : {};
  return {
    modo: "postos" as const,
    nome: p.nome.trim(),
    descricao: p.escopo.trim() || null,
    fornecimento: { equipamentos: fornece, produtos: fornece },
    preco_manual_centavos: p.preco_manual > 0 ? centavos(p.preco_manual) : null,
    justificativa_preco_manual: p.justificativa_preco_manual.trim() || null,
    postos: [{
      funcao: p.nome.trim(), escala: p.escala, escala_texto: p.escala === "outra" ? p.escala_texto.trim() : null,
      horas_mensais: inteiroOuNull(p.horas_mensais), efetivos: inteiroOuNull(p.efetivos), salario_centavos: centavos(p.salario),
      adicionais, beneficios, uniforme_epi_centavos: centavos(p.uniforme), insumos_centavos: p.salmazos_fornece ? centavos(p.insumos) : 0, operacao_centavos: centavos(p.operacao),
      ...cobertura,
    }],
  };
}

// gestor: só ele manda ISS por proposta, cobertura por posto e justificativa de margem. Quem não é gestor NÃO manda esses campos: o servidor devolve o que já estava gravado.
export function conteudoTsDoForm(f: CamposTsForm, opcoes: { gestor: boolean; itens?: ItemForm[] }) {
  const antecedencia = numeroTexto(f.antecedencia_dias);
  const base = {
    texto_introdutorio: f.texto_introdutorio.trim(),
    cargo_supervisao: f.cargo_supervisao.trim() || null,
    servicos: (opcoes.itens ?? f.itens).map((it) => (it.kind === "bloco" ? it.servico : servicoDoPosto(it, opcoes.gestor))),
    condicoes: { vencimentos_dias: diasDoTexto(f.vencimentos_dias), antecedencia_dias: antecedencia === "" ? null : Number(antecedencia) },
    clausulas_adicionais: f.clausulas_adicionais.map((c) => c.trim()).filter(Boolean),
  };
  if (!opcoes.gestor) return base;
  return { ...base, iss_override_bp: f.iss_override.trim() === "" ? null : percentualParaBp(f.iss_override), justificativa_margem_minima: f.justificativa_margem.trim() || null };
}

// ── Prévia (servidor) ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface EstadoPreviaTs {
  previa: PreviaTs | null;
  erro: string | null;
  status: number | null;
  carregando: boolean;
  // Índice (no formulário) do item de cada serviço devolvido pela prévia: ela só leva os postos completos.
  mapa: number[];
}
const PREVIA_VAZIA: EstadoPreviaTs = { previa: null, erro: null, status: null, carregando: false, mapa: [] };

// Motivo que impede salvar com o que a prévia mostrou (null = pode salvar): o cálculo falhou, ou o gestor ainda não justificou a margem abaixo do mínimo.
export function bloqueioTs(f: CamposTsForm, e: EstadoPreviaTs, gestor: boolean): string | null {
  if (e.erro) return e.erro;
  if (gestor && e.previa?.margem?.exige_justificativa && f.justificativa_margem.trim() === "") return MSG_JUSTIFICATIVA_MARGEM;
  return null;
}

// Pede ao servidor o cálculo do que está preenchido (uma chamada por pausa na digitação) e DESCARTA a resposta que chega atrasada: só vale a da última digitação.
export function usePreviaTs(f: CamposTsForm, gestor: boolean): EstadoPreviaTs {
  const completos = f.itens.map((it, i) => (it.kind === "bloco" || postoTsPronto(it) ? i : -1)).filter((i) => i >= 0);
  const chave = completos.length === 0 ? "" : JSON.stringify({ mapa: completos, conteudo: conteudoTsDoForm(f, { gestor, itens: completos.map((i) => f.itens[i]) }) });
  const [estado, setEstado] = useState<EstadoPreviaTs>(PREVIA_VAZIA);
  useEffect(() => {
    if (chave === "") { setEstado(PREVIA_VAZIA); return; }
    const { mapa, conteudo } = JSON.parse(chave) as { mapa: number[]; conteudo: unknown };
    let cancelado = false;
    setEstado((e) => ({ ...e, carregando: true }));
    const t = setTimeout(async () => {
      try {
        const r = await lerResposta<{ data: PreviaTs }>(await fetch("/api/comercial/propostas/ts/previa", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conteudo }),
        }));
        if (cancelado) return;
        if (r.ok) setEstado({ previa: r.json.data, erro: null, status: null, carregando: false, mapa });
        else setEstado({ previa: null, erro: friendly(r.status, r.json.error), status: r.status, carregando: false, mapa });
      } catch {
        if (cancelado) return;
        setEstado({ previa: null, erro: "Não foi possível calcular os valores.", status: null, carregando: false, mapa });
      }
    }, 400);
    return () => { cancelado = true; clearTimeout(t); };
  }, [chave]);
  return estado;
}

// 403 vira mensagem amigável (a da rota, quando existe); sem mensagem, uma genérica.
function friendly(status: number, erro: string | undefined): string {
  if (erro) return erro;
  if (status === 403) return "Você não tem permissão para fazer esta alteração.";
  return "Não foi possível calcular os valores.";
}

interface Props {
  valor: CamposTsForm;
  onChange: (v: CamposTsForm) => void;
  gestor: boolean;
  contatos?: { id: string; nome: string; cargo: string | null }[];
  contatoId?: string;
  onContato?: (id: string) => void;
  desabilitado?: boolean;
  onPrevia?: (e: EstadoPreviaTs) => void;
}

const btnMini: React.CSSProperties = { padding: "6px 10px", background: "#fff", border: "1px solid #D1D5DB", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const linkBotao: React.CSSProperties = { background: "none", border: "none", color: "#B45309", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 };
const ajuda: React.CSSProperties = { fontSize: 12, color: "#6B7280", marginTop: 4 };
const moedaStyle: React.CSSProperties = { ...inputStyle, width: "100%", boxSizing: "border-box" };

export default function CamposPropostaTs({ valor, onChange, gestor, contatos = [], contatoId = "", onContato, desabilitado, onPrevia }: Props) {
  const estado = usePreviaTs(valor, gestor);
  useEffect(() => { onPrevia?.(estado); }, [estado, onPrevia]);
  const [removendo, setRemovendo] = useState<number | null>(null);

  const set = (k: "aos_cuidados" | "validade_dias" | "vencimentos_dias" | "antecedencia_dias" | "texto_introdutorio" | "cargo_supervisao" | "iss_override" | "justificativa_margem") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...valor, [k]: e.target.value });
  const setItem = (i: number, parte: Partial<PostoForm>) => onChange({ ...valor, itens: valor.itens.map((it, k) => (k === i && it.kind === "posto" ? { ...it, ...parte } : it)) });
  const noLimite = valor.itens.length >= MAX_SERVICOS_TS;
  const abaixoDoMinimo = estado.previa?.margem?.abaixo ?? [];
  const exigeJustificativa = gestor && estado.previa?.margem?.exige_justificativa === true;
  const semPercentuais = estado.status === 422 && /percentuais/i.test(estado.erro ?? "");

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

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Postos</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
          Uma proposta pode ter de 1 a {MAX_SERVICOS_TS} postos. O valor de cada posto aparece logo abaixo, calculado pelo sistema.
        </div>
        {valor.itens.map((it, i) => it.kind === "bloco" ? (
          <div key={i} data-posto-form={i} data-bloco style={{ border: "1px dashed #D1D5DB", borderRadius: 10, padding: 12, marginBottom: 10, background: "#F9FAFB", fontSize: 13, color: "#374151" }}>
            <strong>{String(it.servico.nome ?? `Item ${i + 1}`)}</strong> — {it.servico.modo === "fechado" ? "serviço fechado" : "serviço com mais de um posto"}: esta tela não edita este item; ele é mantido como está ao salvar.
          </div>
        ) : (
          <div key={i} data-posto-form={i} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, marginBottom: 10, background: "#FAFAFA" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>Posto {i + 1}</strong>
              {!desabilitado && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button type="button" aria-label={`Duplicar posto ${i + 1}`} style={btnMini} disabled={noLimite}
                    onClick={() => onChange({ ...valor, itens: [...valor.itens.slice(0, i + 1), structuredClone(it), ...valor.itens.slice(i + 1)] })}>Duplicar</button>
                  {removendo === i ? (
                    <>
                      <span style={{ fontSize: 13, color: "#B91C1C" }}>Remover o posto {i + 1}?</span>
                      <button type="button" aria-label={`Confirmar remoção do posto ${i + 1}`} style={{ ...btnMini, color: "#B91C1C" }}
                        onClick={() => { onChange({ ...valor, itens: valor.itens.filter((_, k) => k !== i) }); setRemovendo(null); }}>Sim, remover</button>
                      <button type="button" aria-label="Manter o posto" style={btnMini} onClick={() => setRemovendo(null)}>Manter</button>
                    </>
                  ) : (
                    <button type="button" aria-label={`Remover posto ${i + 1}`} title={valor.itens.length <= 1 ? "A proposta precisa de pelo menos um posto" : "Remover posto"} disabled={valor.itens.length <= 1}
                      style={{ ...btnMini, color: "#B91C1C" }} onClick={() => setRemovendo(i)}>✕ Remover</button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <div><label style={labelStyle}>Serviço / função *</label><input style={inputStyle} value={it.nome} maxLength={100} disabled={desabilitado} placeholder="Ex.: Auxiliar de Limpeza" onChange={(e) => setItem(i, { nome: e.target.value })} /></div>
              <div><label style={labelStyle}>Escopo (opcional)</label><input style={inputStyle} value={it.escopo} maxLength={300} disabled={desabilitado} placeholder="Ex.: limpeza geral da unidade" onChange={(e) => setItem(i, { escopo: e.target.value })} /></div>
              <div>
                <label style={labelStyle}>Efetivos *</label>
                <input style={inputStyle} inputMode="numeric" value={it.efetivos} disabled={desabilitado} data-campo="efetivos" onChange={(e) => setItem(i, { efetivos: e.target.value })} />
                <div style={ajuda}>Quantas pessoas neste posto.</div>
              </div>
              <div>
                <label style={labelStyle}>Escala *</label>
                <select style={inputStyle} value={it.escala} disabled={desabilitado} onChange={(e) => setItem(i, { escala: e.target.value })}>
                  {ESCALAS_TS.map((e) => <option key={e.codigo} value={e.codigo}>{e.rotulo}</option>)}
                </select>
              </div>
              {it.escala === "outra" && (
                <div><label style={labelStyle}>Descrição da escala *</label><input style={inputStyle} value={it.escala_texto} maxLength={120} disabled={desabilitado} onChange={(e) => setItem(i, { escala_texto: e.target.value })} /></div>
              )}
              <div>
                <label style={labelStyle}>Horas semanais</label>
                <input style={inputStyle} inputMode="numeric" value={it.horas_semanais} disabled={desabilitado} data-campo="horas_semanais"
                  onChange={(e) => {
                    const n = inteiroOuNull(e.target.value);
                    setItem(i, { horas_semanais: e.target.value, ...(n !== null && n > 0 ? { horas_mensais: String(n * 5) } : {}) });
                  }} />
                <div style={ajuda}>Informativa: não entra no cálculo.</div>
              </div>
              <div>
                <label style={labelStyle}>Horas mensais *</label>
                <input style={inputStyle} inputMode="numeric" value={it.horas_mensais} disabled={desabilitado} data-campo="horas_mensais" onChange={(e) => setItem(i, { horas_mensais: e.target.value })} />
                <div style={ajuda}>Informativa: sugerida como semanais × 5; pode ajustar.</div>
              </div>
              <div>
                <label style={labelStyle}>Salário *</label>
                <CampoMoeda value={it.salario || null} onChange={(v) => setItem(i, { salario: v })} placeholder="R$ 0,00" disabled={desabilitado} style={moedaStyle} />
                <div style={ajuda}>Por efetivo, por mês.</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Adicionais</div>
              {it.adicionais.map((a, k) => (
                <div key={k} data-adicional={k} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) 130px minmax(120px, 1fr) auto", gap: 8, alignItems: "end", marginBottom: 6 }}>
                  <select style={inputStyle} value={a.tipo} disabled={desabilitado} aria-label={`Tipo do adicional ${k + 1}`}
                    onChange={(e) => setItem(i, { adicionais: it.adicionais.map((x, j) => (j === k ? { ...x, tipo: e.target.value } : x)) })}>
                    {TIPOS_ADICIONAL_TS.map((t) => <option key={t.codigo} value={t.codigo}>{t.rotulo}</option>)}
                  </select>
                  <select style={inputStyle} value={a.modo} disabled={desabilitado} aria-label={`Forma do adicional ${k + 1}`}
                    onChange={(e) => setItem(i, { adicionais: it.adicionais.map((x, j) => (j === k ? { ...x, modo: e.target.value as "valor" | "percentual" } : x)) })}>
                    <option value="valor">Valor (R$)</option>
                    <option value="percentual">% do salário</option>
                  </select>
                  {a.modo === "valor" ? (
                    <CampoMoeda value={a.valor || null} onChange={(v) => setItem(i, { adicionais: it.adicionais.map((x, j) => (j === k ? { ...x, valor: v } : x)) })} placeholder="R$ 0,00" disabled={desabilitado} style={moedaStyle} />
                  ) : (
                    <input style={inputStyle} inputMode="decimal" value={a.percentual} placeholder="Ex.: 20" disabled={desabilitado} aria-label={`Percentual do adicional ${k + 1}`}
                      onChange={(e) => setItem(i, { adicionais: it.adicionais.map((x, j) => (j === k ? { ...x, percentual: e.target.value } : x)) })} />
                  )}
                  {!desabilitado && <button type="button" style={{ ...btnMini, color: "#B91C1C" }} aria-label={`Remover adicional ${k + 1}`} onClick={() => setItem(i, { adicionais: it.adicionais.filter((_, j) => j !== k) })}>✕</button>}
                </div>
              ))}
              {!desabilitado && <button type="button" style={btnMini} onClick={() => setItem(i, { adicionais: [...it.adicionais, { tipo: TIPOS_ADICIONAL_TS[0].codigo, modo: "valor", valor: 0, percentual: "" }] })}>+ Adicionar adicional</button>}
              <div style={ajuda}>Adicionais compõem a remuneração e entram nos encargos. Linhas sem valor são ignoradas.</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Benefícios</div>
              {it.beneficios.map((b, k) => (
                <div key={k} data-beneficio={k} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) minmax(120px, 1fr) auto", gap: 8, alignItems: "end", marginBottom: 6 }}>
                  <select style={inputStyle} value={b.tipo} disabled={desabilitado} aria-label={`Tipo do benefício ${k + 1}`}
                    onChange={(e) => setItem(i, { beneficios: it.beneficios.map((x, j) => (j === k ? { ...x, tipo: e.target.value } : x)) })}>
                    {TIPOS_BENEFICIO_TS.map((t) => <option key={t.codigo} value={t.codigo}>{t.rotulo}</option>)}
                  </select>
                  <CampoMoeda value={b.valor || null} onChange={(v) => setItem(i, { beneficios: it.beneficios.map((x, j) => (j === k ? { ...x, valor: v } : x)) })} placeholder="R$ 0,00" disabled={desabilitado} style={moedaStyle} />
                  {!desabilitado && <button type="button" style={{ ...btnMini, color: "#B91C1C" }} aria-label={`Remover benefício ${k + 1}`} onClick={() => setItem(i, { beneficios: it.beneficios.filter((_, j) => j !== k) })}>✕</button>}
                </div>
              ))}
              {!desabilitado && <button type="button" style={btnMini} onClick={() => setItem(i, { beneficios: [...it.beneficios, { tipo: TIPOS_BENEFICIO_TS[0].codigo, valor: 0 }] })}>+ Adicionar benefício</button>}
              <div style={ajuda}>Valor mensal por efetivo. Linhas sem valor são ignoradas.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Uniforme / EPI</label>
                <CampoMoeda value={it.uniforme || null} onChange={(v) => setItem(i, { uniforme: v })} placeholder="R$ 0,00" disabled={desabilitado} style={moedaStyle} />
                <div style={ajuda}>Por efetivo, por mês.</div>
              </div>
              <div>
                <label style={labelStyle}>Operação</label>
                <CampoMoeda value={it.operacao || null} onChange={(v) => setItem(i, { operacao: v })} placeholder="R$ 0,00" disabled={desabilitado} style={moedaStyle} />
                <div style={ajuda}>Custo de operação/supervisão por efetivo. Sempre entra no custo.</div>
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={it.salmazos_fornece} disabled={desabilitado} data-campo="salmazos_fornece" onChange={(e) => setItem(i, { salmazos_fornece: e.target.checked })} />
                  Salmazos fornece os insumos
                </label>
                {it.salmazos_fornece ? (
                  <>
                    <CampoMoeda value={it.insumos || null} onChange={(v) => setItem(i, { insumos: v })} placeholder="R$ 0,00" disabled={desabilitado} style={moedaStyle} />
                    <div style={ajuda}>Produtos e equipamentos, por efetivo. Entram no custo porque a Salmazos fornece.</div>
                  </>
                ) : (
                  <div style={ajuda}>Desligado: o cliente fornece e os insumos não entram no custo.</div>
                )}
              </div>
            </div>

            {gestor && (
              <div data-campos-diretoria style={{ marginTop: 12, padding: 10, border: "1px solid #FCD34D", background: "#FFFBEB", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>Só a diretoria</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Preço manual do posto</label>
                    <CampoMoeda value={it.preco_manual || null} onChange={(v) => setItem(i, { preco_manual: v })} placeholder="Usa o preço calculado" disabled={desabilitado} style={moedaStyle} />
                    <div style={ajuda}>Substitui o preço calculado deste posto. Vazio = preço calculado.</div>
                  </div>
                  {it.preco_manual > 0 && (
                    <div>
                      <label style={labelStyle}>Justificativa do preço manual</label>
                      <input style={inputStyle} value={it.justificativa_preco_manual} maxLength={500} disabled={desabilitado} onChange={(e) => setItem(i, { justificativa_preco_manual: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Cobertura de ausências (%)</label>
                    <input style={inputStyle} inputMode="decimal" value={it.cobertura} placeholder="Padrão" disabled={desabilitado} data-campo="cobertura" onChange={(e) => setItem(i, { cobertura: e.target.value })} />
                    <div style={ajuda}>Vazio = a cobertura padrão dos percentuais.</div>
                  </div>
                </div>
              </div>
            )}
            {gestor && abaixoDoMinimo.includes(estado.mapa.indexOf(i)) && estado.mapa.indexOf(i) >= 0 && (
              <div data-abaixo-margem-posto={i} style={{ marginTop: 8 }}><Aviso tipo="alerta">Este posto ficou abaixo da margem mínima.</Aviso></div>
            )}
          </div>
        ))}
        {!desabilitado && (
          <button type="button" style={btnSecundario} disabled={noLimite} onClick={() => onChange({ ...valor, itens: [...valor.itens, postoTsNovo()] })}>
            + Adicionar posto{noLimite ? ` (limite de ${MAX_SERVICOS_TS})` : ""}
          </button>
        )}
      </div>

      {gestor && (
        <div data-campo-iss style={{ padding: 10, border: "1px solid #FCD34D", background: "#FFFBEB", borderRadius: 8, maxWidth: 360 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>Só a diretoria</div>
          <label style={labelStyle}>ISS desta proposta (%)</label>
          <input style={inputStyle} inputMode="decimal" value={valor.iss_override} placeholder="Padrão" disabled={desabilitado} data-campo="iss_override" onChange={set("iss_override")} />
          <div style={ajuda}>Vazio = o ISS dos percentuais em vigor. Vale só para esta proposta.</div>
        </div>
      )}

      <div data-bloco-calculo>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Cálculo do valor mensal</div>
        {estado.erro && (
          <div data-erro-previa style={semPercentuais ? { border: "2px solid #B45309", borderRadius: 10, padding: 10, background: "#FFFBEB" } : undefined}>
            <Aviso tipo={semPercentuais ? "alerta" : "erro"}>{estado.erro}</Aviso>
            {semPercentuais && gestor && <a data-configurar-percentuais href={URL_CONFIGURAR_PERCENTUAIS_TS} style={{ color: "#B45309", fontWeight: 700, fontSize: 13 }}>Configurar percentuais</a>}
          </div>
        )}
        {!estado.erro && !estado.previa && !estado.carregando && <div style={{ fontSize: 13, color: "#6B7280" }}>Preencha serviço, efetivos, horas e salário de um posto para ver o valor mensal.</div>}
        {estado.carregando && !estado.previa && !estado.erro && <div style={{ fontSize: 13, color: "#6B7280" }}>Calculando…</div>}
        {estado.previa && (
          <div style={{ opacity: estado.carregando ? 0.6 : 1 }}>
            <PlanilhaTsView planilha={estado.previa.planilha} gestor={gestor} rotuloVigencia="Cálculo com os percentuais em vigor desde" />
          </div>
        )}
        {exigeJustificativa && (
          <div data-justificativa-margem style={{ marginTop: 10 }}>
            <Aviso tipo="alerta">A margem ficou abaixo do mínimo definido pela diretoria. Para salvar, informe a justificativa.</Aviso>
            <label style={labelStyle}>Justificativa da margem abaixo do mínimo *</label>
            <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} value={valor.justificativa_margem} maxLength={500} disabled={desabilitado} onChange={set("justificativa_margem")} />
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Texto introdutório</label>
        <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} value={valor.texto_introdutorio} onChange={set("texto_introdutorio")} maxLength={MAX_TEXTO_INTRODUTORIO_TS} disabled={desabilitado} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#6B7280", marginTop: 4, flexWrap: "wrap" }}>
          <span>Aparece no começo da proposta. Se ficar vazio, usa o texto padrão.</span>
          <span>
            {valor.texto_introdutorio.length}/{MAX_TEXTO_INTRODUTORIO_TS}
            {!desabilitado && valor.texto_introdutorio !== TEXTO_INTRODUTORIO_PADRAO_TS && (
              <button type="button" style={{ ...linkBotao, marginLeft: 10 }} onClick={() => onChange({ ...valor, texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_TS })}>Restaurar texto padrão</button>
            )}
          </span>
        </div>
        <AvisoOmitidos texto={valor.texto_introdutorio} />
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Condições da proposta</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle}>Dias de vencimento da fatura</label>
            <input style={inputStyle} value={valor.vencimentos_dias} onChange={set("vencimentos_dias")} disabled={desabilitado} placeholder="15, 30" />
            <div style={ajuda}>De 1 a 4 dias do mês, separados por vírgula (ex.: 15, 30).</div>
          </div>
          <div>
            <label style={labelStyle}>Antecedência do faturamento</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input style={inputStyle} inputMode="numeric" value={valor.antecedencia_dias} onChange={set("antecedencia_dias")} disabled={desabilitado} />
              <span style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap" }}>dias antes do pagamento</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Cargo na assinatura (opcional)</label>
            <input style={inputStyle} value={valor.cargo_supervisao} maxLength={100} onChange={set("cargo_supervisao")} disabled={desabilitado} placeholder="Se vazio, usa o cargo do seu perfil" />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Cláusulas adicionais (opcional)</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Até {MAX_CLAUSULAS_ADICIONAIS} cláusulas de {MAX_CLAUSULA_ADICIONAL} caracteres.</div>
        {valor.clausulas_adicionais.map((texto, i) => (
          <div key={i} data-clausula={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 8, alignItems: "start", marginBottom: 8 }}>
            <strong style={{ fontSize: 14, paddingTop: 9 }}>{numeroClausulaAdicionalMot(i)}</strong>
            <div>
              <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} value={texto} maxLength={MAX_CLAUSULA_ADICIONAL} disabled={desabilitado}
                onChange={(e) => onChange({ ...valor, clausulas_adicionais: valor.clausulas_adicionais.map((c, k) => (k === i ? e.target.value : c)) })} />
              <div style={{ fontSize: 12, color: "#6B7280", textAlign: "right" }}>{texto.length}/{MAX_CLAUSULA_ADICIONAL}</div>
              <AvisoOmitidos texto={texto} />
            </div>
            {!desabilitado && (
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" title="Subir" aria-label={`Subir cláusula ${i + 1}`} style={btnMini} disabled={i === 0}
                  onClick={() => onChange({ ...valor, clausulas_adicionais: moverClausula(valor.clausulas_adicionais, i, i - 1) })}>↑</button>
                <button type="button" title="Descer" aria-label={`Descer cláusula ${i + 1}`} style={btnMini} disabled={i === valor.clausulas_adicionais.length - 1}
                  onClick={() => onChange({ ...valor, clausulas_adicionais: moverClausula(valor.clausulas_adicionais, i, i + 1) })}>↓</button>
                <button type="button" title="Remover" aria-label={`Remover cláusula ${i + 1}`} style={{ ...btnMini, color: "#B91C1C" }}
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

// O PDF só imprime letras latinas, números e pontuação comum: o resto é omitido, e o vendedor precisa saber disso.
function AvisoOmitidos({ texto }: { texto: string }) {
  const omitidos = caracteresOmitidos(texto);
  if (omitidos.length === 0) return null;
  return <div style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>O PDF não imprime estes caracteres e eles serão omitidos: {omitidos.join(" ")}</div>;
}
