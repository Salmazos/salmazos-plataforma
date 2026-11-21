"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CHAVES_PARAMETROS_MOT, formatarPercentualBp, type ParametrosMot } from "@/lib/propostaMotCalculo";
import { ROTULO_PARAMETRO_MOT } from "@/lib/propostaMot";
import { Aviso, btnPrimario, btnSecundario, cardStyle, fmtData, fmtDataHora, inputStyle, labelStyle, lerResposta } from "@/components/propostas/propostasUi";

// Aba "Percentuais do MOT" (só a diretoria: a página só a mostra para o gestor e a rota confere de novo). Os percentuais ficam em pontos-base no banco
// (31,2% = 3120) e aparecem aqui em %. A tabela é SÓ INSERÇÃO: não existe editar nem apagar; mudar um percentual é cadastrar uma nova vigência.
export const MSG_VIGENCIA_NO_PASSADO = "A vigência não pode começar antes de hoje: os percentuais que já valeram não são reescritos.";

interface Linha extends ParametrosMot {
  id: string;
  vigente_desde: string;
  created_at: string;
  alterado_por_nome: string | null;
}
interface Dados {
  hoje: string;
  vigentes: Linha | null;
  historico: Linha[];
  limites: Record<keyof ParametrosMot, number>;
}

// "31,2" → 3120 (sem passar por ponto flutuante). Aceita até 2 casas; qualquer outra coisa devolve null.
export function percentualParaBp(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  const m = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}
const bpParaTexto = (bp: number) => formatarPercentualBp(bp).replace("%", "");

export default function PercentuaisMotAdmin() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [data, setData] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const emAndamento = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const r = await lerResposta<Dados>(await fetch("/api/comercial/propostas/mot/parametros"));
      if (!r.ok) { setErroCarga(r.json.error ?? "Não foi possível carregar os percentuais do MOT."); return; }
      setDados(r.json as Dados);
      setErroCarga("");
      // Primeira carga: o formulário já começa com os percentuais de hoje (a diretoria só muda o que mudou).
      setValores((atual) => (Object.keys(atual).length > 0 || !r.json.vigentes ? atual : Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k) => [k, bpParaTexto((r.json.vigentes as Linha)[k])]))));
    } catch {
      setErroCarga("Não foi possível carregar os percentuais do MOT.");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Confere o formulário; devolve a mensagem de erro ou os pontos-base prontos para enviar.
  function conferir(): { erro: string } | { bp: Record<string, number> } {
    if (!dados) return { erro: "Aguarde o carregamento." };
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data)) return { erro: "Informe a data de início da vigência." };
    if (data < dados.hoje) return { erro: MSG_VIGENCIA_NO_PASSADO };
    const bp: Record<string, number> = {};
    for (const k of CHAVES_PARAMETROS_MOT) {
      const v = percentualParaBp(valores[k] ?? "");
      if (v === null) return { erro: `${ROTULO_PARAMETRO_MOT[k]}: informe o percentual com até 2 casas (ex.: 31,2).` };
      if (v > dados.limites[k]) return { erro: `${ROTULO_PARAMETRO_MOT[k]} passa do limite de ${formatarPercentualBp(dados.limites[k])}.` };
      bp[k] = v;
    }
    return { bp };
  }

  function pedirConfirmacao() {
    setOk("");
    const c = conferir();
    if ("erro" in c) { setErro(c.erro); setConfirmando(false); return; }
    setErro("");
    setConfirmando(true);
  }

  async function gravar() {
    if (emAndamento.current) return;
    const c = conferir();
    if ("erro" in c) { setErro(c.erro); setConfirmando(false); return; }
    emAndamento.current = true;
    setSalvando(true);
    setErro("");
    try {
      const r = await lerResposta(await fetch("/api/comercial/propostas/mot/parametros", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vigente_desde: data, ...c.bp }),
      }));
      if (!r.ok) { setErro(r.json.error ?? "Não foi possível salvar os percentuais."); setConfirmando(false); return; }
      setOk(`Nova vigência cadastrada, valendo a partir de ${fmtData(data)}.`);
      setConfirmando(false);
      setData("");
      await carregar();
    } catch {
      setErro("Não foi possível salvar os percentuais. Nada foi alterado.");
      setConfirmando(false);
    } finally {
      setSalvando(false);
      emAndamento.current = false;
    }
  }

  if (erroCarga) return <Aviso tipo="erro">{erroCarga}</Aviso>;
  if (!dados) return <div style={{ padding: 16, color: "#6B7280" }}>Carregando…</div>;

  const celulas = (l: Linha) => CHAVES_PARAMETROS_MOT.map((k) => <td key={k} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatarPercentualBp(l[k])}</td>);

  return (
    <div data-percentuais-mot style={{ display: "grid", gap: 16 }}>
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Vigência de hoje</h3>
        {dados.vigentes ? (
          <>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>Em vigor desde {fmtData(dados.vigentes.vigente_desde)}. É com estes percentuais que as propostas MOT são calculadas hoje.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              {CHAVES_PARAMETROS_MOT.map((k) => (
                <div key={k} data-vigente={k} style={{ fontSize: 14 }}><span style={{ color: "#6B7280" }}>{ROTULO_PARAMETRO_MOT[k]}: </span><strong>{formatarPercentualBp(dados.vigentes![k])}</strong></div>
              ))}
            </div>
          </>
        ) : (
          <Aviso tipo="alerta">Não há percentuais em vigor hoje: as propostas MOT não podem ser calculadas. Cadastre uma vigência abaixo.</Aviso>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Cadastrar nova vigência</h3>
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
          Os percentuais novos valem a partir da data escolhida (hoje ou depois). O que já foi enviado não muda. Uma vez cadastrada, a vigência não pode ser editada nem apagada: para corrigir, cadastre outra com uma data diferente.
        </div>
        <div style={{ maxWidth: 240, marginBottom: 12 }}>
          <label style={labelStyle}>Vale a partir de *</label>
          <input type="date" style={inputStyle} value={data} min={dados.hoje} onChange={(e) => { setData(e.target.value); setConfirmando(false); setErro(""); }} disabled={salvando} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {CHAVES_PARAMETROS_MOT.map((k) => (
            <div key={k}>
              <label style={labelStyle}>{ROTULO_PARAMETRO_MOT[k]} (%)</label>
              <input style={inputStyle} inputMode="decimal" value={valores[k] ?? ""} disabled={salvando} data-campo={k}
                onChange={(e) => { setValores({ ...valores, [k]: e.target.value }); setConfirmando(false); setErro(""); }} />
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>até {formatarPercentualBp(dados.limites[k])}</div>
            </div>
          ))}
        </div>
        {erro && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erro}</Aviso></div>}
        {ok && <div style={{ marginTop: 12 }}><Aviso tipo="info">{ok}</Aviso></div>}
        {confirmando ? (
          <div style={{ marginTop: 12 }}>
            <Aviso tipo="alerta">Confirma cadastrar estes percentuais a partir de {fmtData(data)}? Depois de salvos, não dá para editar nem apagar.</Aviso>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={{ ...btnPrimario, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={gravar}>{salvando ? "Salvando…" : "Sim, cadastrar"}</button>
              <button type="button" style={btnSecundario} disabled={salvando} onClick={() => setConfirmando(false)}>Voltar</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <button type="button" style={btnPrimario} onClick={pedirConfirmacao}>Cadastrar nova vigência</button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Histórico</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280" }}>
                <th style={{ padding: "6px 8px" }}>Vale desde</th>
                <th style={{ padding: "6px 8px" }}>Cadastrada em</th>
                <th style={{ padding: "6px 8px" }}>Por</th>
                {CHAVES_PARAMETROS_MOT.map((k) => <th key={k} style={{ padding: "6px 8px", textAlign: "right" }}>{ROTULO_PARAMETRO_MOT[k].replace("Retenção de ", "Ret. ")}</th>)}
              </tr>
            </thead>
            <tbody>
              {dados.historico.map((l) => (
                <tr key={l.id} data-vigencia={l.vigente_desde} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtData(l.vigente_desde)}{l.vigente_desde > dados.hoje ? " (futura)" : l.id === dados.vigentes?.id ? " (em vigor)" : ""}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtDataHora(l.created_at)}</td>
                  <td style={{ padding: "6px 8px" }}>{l.alterado_por_nome ?? "—"}</td>
                  {celulas(l)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
