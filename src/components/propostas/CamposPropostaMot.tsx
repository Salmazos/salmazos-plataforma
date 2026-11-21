"use client";

import React, { useEffect, useState } from "react";
import { MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL } from "@/lib/propostaClausulas";
import { FUNCAO_MOT_PADRAO, MAX_FUNCOES_MOT, MAX_TEXTO_INTRODUTORIO_MOT, TEXTO_INTRODUTORIO_PADRAO_MOT, type ConteudoMot, type PreviaMot } from "@/lib/propostaMot";
import { caracteresOmitidos } from "@/lib/propostaTexto";
import { VALIDADE_MAX_DIAS, VALIDADE_MIN_DIAS, VALIDADE_PADRAO_DIAS } from "@/lib/propostas";
import { moverClausula } from "@/components/propostas/CamposProposta";
import CampoMoeda from "@/components/ui/CampoMoeda";
import { ResumoFuncoesMot } from "@/components/propostas/PlanilhaMotView";
import { Aviso, btnSecundario, inputStyle, labelStyle, lerResposta } from "@/components/propostas/propostasUi";

// Formulário da proposta de Mão de Obra Temporária. Sem CNPJ e sem endereço (igual ao Word). O salário fica em REAIS na tela e vai em CENTAVOS no envio.
export interface FuncaoForm {
  area: string;
  descricao: string;
  salario: number; // reais; 0 = ainda não preenchido
  jornada: string;
  horario: string;
}
export interface CamposMotForm {
  aos_cuidados: string;
  validade_dias: string;
  funcoes: FuncaoForm[];
  vencimentos_dias: string; // "15, 30"
  antecedencia_dias: string;
  texto_introdutorio: string;
  cargo_supervisao: string;
  clausulas_adicionais: string[];
}

export const funcaoMotNova = (): FuncaoForm => ({ ...FUNCAO_MOT_PADRAO, descricao: "", salario: 0 });

export function camposMotPadrao(): CamposMotForm {
  return {
    aos_cuidados: "",
    validade_dias: String(VALIDADE_PADRAO_DIAS),
    funcoes: [funcaoMotNova()],
    vencimentos_dias: "15, 30",
    antecedencia_dias: "5",
    texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_MOT,
    cargo_supervisao: "",
    clausulas_adicionais: [],
  };
}

export function camposMotDeProposta(p: { aos_cuidados: string | null; validade_dias: number; conteudo: Partial<ConteudoMot> | null }): CamposMotForm {
  const c = p.conteudo;
  const funcoes = (c?.funcoes ?? []).map((f) => ({
    area: f.area ?? "", descricao: f.descricao ?? "", salario: typeof f.salario_centavos === "number" ? f.salario_centavos / 100 : 0, jornada: f.jornada ?? "", horario: f.horario ?? "",
  }));
  return {
    aos_cuidados: p.aos_cuidados ?? "",
    validade_dias: String(p.validade_dias),
    funcoes: funcoes.length > 0 ? funcoes : [funcaoMotNova()],
    vencimentos_dias: (c?.condicoes?.vencimentos_dias ?? [15, 30]).join(", "),
    antecedencia_dias: String(c?.condicoes?.antecedencia_dias ?? 5),
    texto_introdutorio: c?.texto_introdutorio ?? TEXTO_INTRODUTORIO_PADRAO_MOT,
    cargo_supervisao: c?.cargo_supervisao ?? "",
    clausulas_adicionais: c?.clausulas_adicionais ?? [],
  };
}

export const centavosDoSalario = (reais: number): number => Math.round((reais || 0) * 100);
const numeroTexto = (v: string) => v.trim().replace(",", ".");
export const validadeMotDoForm = (f: CamposMotForm) => numeroTexto(f.validade_dias);

// Dias de vencimento digitados ("15, 30" ou "15 e 30"): o que não for número vai como null e o servidor responde com a mensagem do campo.
function diasDoTexto(t: string): (number | null)[] {
  return t.split(/[^0-9a-zA-Z]+/).filter((x) => x !== "" && !/^e$/i.test(x)).map((x) => (/^[0-9]+$/.test(x) ? Number(x) : null));
}

export function conteudoMotDoForm(f: CamposMotForm) {
  const antecedencia = numeroTexto(f.antecedencia_dias);
  return {
    texto_introdutorio: f.texto_introdutorio.trim(),
    cargo_supervisao: f.cargo_supervisao.trim() || null,
    funcoes: f.funcoes.map((x) => ({
      area: x.area.trim(), descricao: x.descricao.trim() || null, salario_centavos: centavosDoSalario(x.salario), jornada: x.jornada.trim(), horario: x.horario.trim(),
    })),
    condicoes: { vencimentos_dias: diasDoTexto(f.vencimentos_dias), antecedencia_dias: antecedencia === "" ? null : Number(antecedencia) },
    // Linha em branco é cláusula que o vendedor não preencheu: sai da lista em vez de virar erro.
    clausulas_adicionais: f.clausulas_adicionais.map((c) => c.trim()).filter(Boolean),
  };
}

// Salários a mandar para a prévia (null = função ainda sem salário).
export const salariosDaPrevia = (funcoes: FuncaoForm[]): (number | null)[] => funcoes.map((f) => (f.salario > 0 ? centavosDoSalario(f.salario) : null));

// ── Prévia do cálculo (servidor) ─────────────────────────────────────────────────────────────────────────────────
export interface EstadoPrevia {
  previa: PreviaMot | null;
  erro: string | null;
  carregando: boolean;
}

// Pede ao servidor o cálculo dos salários digitados (uma chamada por pausa na digitação). O que vale é o resultado do servidor: a tela não calcula nada.
export function usePreviaMot(salarios: (number | null)[]): EstadoPrevia {
  const chave = JSON.stringify(salarios);
  const [estado, setEstado] = useState<EstadoPrevia>({ previa: null, erro: null, carregando: false });
  useEffect(() => {
    const lista = JSON.parse(chave) as (number | null)[];
    if (!lista.some((s) => s !== null)) { setEstado({ previa: null, erro: null, carregando: false }); return; }
    let cancelado = false;
    setEstado((e) => ({ ...e, carregando: true }));
    const t = setTimeout(async () => {
      try {
        const r = await lerResposta<{ data: PreviaMot }>(await fetch("/api/comercial/propostas/mot/previa", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salarios_centavos: lista }),
        }));
        if (cancelado) return;
        if (r.ok) setEstado({ previa: r.json.data, erro: null, carregando: false });
        else setEstado({ previa: null, erro: r.json.error ?? "Não foi possível calcular os valores.", carregando: false });
      } catch {
        if (cancelado) return;
        setEstado({ previa: null, erro: "Não foi possível calcular os valores.", carregando: false });
      }
    }, 400);
    return () => { cancelado = true; clearTimeout(t); };
  }, [chave]);
  return estado;
}

interface Props {
  valor: CamposMotForm;
  onChange: (v: CamposMotForm) => void;
  contatos?: { id: string; nome: string; cargo: string | null }[];
  contatoId?: string;
  onContato?: (id: string) => void;
  desabilitado?: boolean;
  // Avisa quem está em volta do resultado do cálculo (para travar o botão de criar quando não há percentuais vigentes).
  onPrevia?: (e: EstadoPrevia) => void;
}

export default function CamposPropostaMot({ valor, onChange, contatos = [], contatoId = "", onContato, desabilitado, onPrevia }: Props) {
  const estado = usePreviaMot(salariosDaPrevia(valor.funcoes));
  useEffect(() => { onPrevia?.(estado); }, [estado, onPrevia]);

  const set = (k: "aos_cuidados" | "validade_dias" | "vencimentos_dias" | "antecedencia_dias" | "texto_introdutorio" | "cargo_supervisao") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...valor, [k]: e.target.value });
  const setFuncao = (i: number, parte: Partial<FuncaoForm>) => onChange({ ...valor, funcoes: valor.funcoes.map((f, k) => (k === i ? { ...f, ...parte } : f)) });
  const noLimite = valor.funcoes.length >= MAX_FUNCOES_MOT;

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
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Funções</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
          Uma proposta pode ter de 1 a {MAX_FUNCOES_MOT} funções. Área, jornada e horário são obrigatórios; a descrição é opcional. O valor mensal de cada função aparece logo abaixo, calculado pelo sistema.
        </div>
        {valor.funcoes.map((f, i) => (
          <div key={i} data-funcao={i} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, marginBottom: 10, background: "#FAFAFA" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>Função {i + 1}</strong>
              {!desabilitado && (
                <button type="button" aria-label={`Remover função ${i + 1}`} title={valor.funcoes.length <= 1 ? "A proposta precisa de pelo menos uma função" : "Remover função"} disabled={valor.funcoes.length <= 1}
                  style={{ ...btnMini, color: "#B91C1C" }} onClick={() => onChange({ ...valor, funcoes: valor.funcoes.filter((_, k) => k !== i) })}>✕ Remover</button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <div><label style={labelStyle}>Área *</label><input style={inputStyle} value={f.area} maxLength={80} disabled={desabilitado} onChange={(e) => setFuncao(i, { area: e.target.value })} /></div>
              <div><label style={labelStyle}>Descrição (opcional)</label><input style={inputStyle} value={f.descricao} maxLength={200} disabled={desabilitado} placeholder="Ex.: Auxiliar de produção" onChange={(e) => setFuncao(i, { descricao: e.target.value })} /></div>
              <div>
                <label style={labelStyle}>Salário *</label>
                <CampoMoeda value={f.salario || null} onChange={(v) => setFuncao(i, { salario: v })} placeholder="R$ 0,00" disabled={desabilitado} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div><label style={labelStyle}>Jornada *</label><input style={inputStyle} value={f.jornada} maxLength={120} disabled={desabilitado} onChange={(e) => setFuncao(i, { jornada: e.target.value })} /></div>
              <div><label style={labelStyle}>Horário *</label><input style={inputStyle} value={f.horario} maxLength={120} disabled={desabilitado} onChange={(e) => setFuncao(i, { horario: e.target.value })} /></div>
            </div>
          </div>
        ))}
        {!desabilitado && (
          <button type="button" style={btnSecundario} disabled={noLimite} onClick={() => onChange({ ...valor, funcoes: [...valor.funcoes, funcaoMotNova()] })}>
            + Adicionar função{noLimite ? ` (limite de ${MAX_FUNCOES_MOT})` : ""}
          </button>
        )}
      </div>

      <div data-bloco-calculo>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Cálculo do valor mensal</div>
        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
        {!estado.erro && !estado.previa && !estado.carregando && <div style={{ fontSize: 13, color: "#6B7280" }}>Preencha o salário de uma função para ver o valor mensal.</div>}
        {estado.carregando && !estado.previa && !estado.erro && <div style={{ fontSize: 13, color: "#6B7280" }}>Calculando…</div>}
        {estado.previa && (
          <div style={{ opacity: estado.carregando ? 0.6 : 1 }}>
            <ResumoFuncoesMot previa={estado.previa} funcoes={valor.funcoes.map((f) => ({ area: f.area, descricao: f.descricao.trim() || null }))} rotuloVigencia="Cálculo com os percentuais em vigor desde" />
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Texto introdutório</label>
        <textarea style={{ ...inputStyle, minHeight: 130, resize: "vertical", fontFamily: "inherit" }} value={valor.texto_introdutorio} onChange={set("texto_introdutorio")} maxLength={MAX_TEXTO_INTRODUTORIO_MOT} disabled={desabilitado} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#6B7280", marginTop: 4, flexWrap: "wrap" }}>
          <span>Aparece no começo da proposta. Se ficar vazio, o PDF usa o texto padrão.</span>
          <span>
            {valor.texto_introdutorio.length}/{MAX_TEXTO_INTRODUTORIO_MOT}
            {!desabilitado && valor.texto_introdutorio !== TEXTO_INTRODUTORIO_PADRAO_MOT && (
              <button type="button" style={{ ...linkBotao, marginLeft: 10 }} onClick={() => onChange({ ...valor, texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_MOT })}>Restaurar texto padrão</button>
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
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>De 1 a 4 dias do mês, separados por vírgula (ex.: 15, 30).</div>
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
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Entram no PDF depois das condições fixas. Até {MAX_CLAUSULAS_ADICIONAIS} cláusulas de {MAX_CLAUSULA_ADICIONAL} caracteres.</div>
        {valor.clausulas_adicionais.map((texto, i) => (
          <div key={i} data-clausula={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 8, alignItems: "start", marginBottom: 8 }}>
            <strong style={{ fontSize: 14, paddingTop: 9 }}>{i + 1}.</strong>
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

const btnMini: React.CSSProperties = { padding: "6px 10px", background: "#fff", border: "1px solid #D1D5DB", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const linkBotao: React.CSSProperties = { background: "none", border: "none", color: "#B45309", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 };

// O PDF só imprime letras latinas, números e pontuação comum: o resto (emoji, setas...) é omitido, e o vendedor precisa saber disso.
function AvisoOmitidos({ texto }: { texto: string }) {
  const omitidos = caracteresOmitidos(texto);
  if (omitidos.length === 0) return null;
  return <div style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>O PDF não imprime estes caracteres e eles serão omitidos: {omitidos.join(" ")}</div>;
}
