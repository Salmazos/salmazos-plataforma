"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BP_MAXIMO, CHAVES_PARAMETROS_TS, MSG_DEDUCOES_TS_INVALIDAS, PARAMETROS_TS_INICIAIS, calcularPostoTs, deducoesPrecoTs, parametrosTsValidos, precoDoCustoTs, type ParametrosTs, type PostoTsEntrada } from "@/lib/propostaTsCalculo";
import { ROTULO_PARAMETRO_TS } from "@/lib/propostaTs";
import { formatarCentavosBRL, formatarPercentualBp } from "@/lib/propostaMotCalculo";
import { percentualParaBp, MSG_VIGENCIA_NO_PASSADO } from "@/components/propostas/PercentuaisMotAdmin";
import { Aviso, btnPrimario, btnSecundario, cardStyle, fmtData, fmtDataHora, inputStyle, labelStyle, lerResposta } from "@/components/propostas/propostasUi";

// Aba "Percentuais da Terceirização" (só gestor/diretoria: a página só a mostra para eles e a rota confere de novo). Os percentuais ficam em pontos-base no banco
// (23% = 2300) e aparecem aqui em %, com até 2 casas. A tabela é SÓ INSERÇÃO: mudar um percentual é cadastrar uma nova vigência (o que já foi enviado não muda).

interface Linha extends ParametrosTs {
  id: string;
  vigente_desde: string;
  created_at: string;
  alterado_por_nome: string | null;
}
interface Dados {
  hoje: string;
  vigentes: Linha | null;
  historico: Linha[];
}

const AJUDA: Record<keyof ParametrosTs, string> = {
  fgts_bp: "Incide sobre remuneração, férias, 13º e aviso prévio.",
  inss_bp: "Incide sobre remuneração, 13º e aviso prévio.",
  multa_fgts_bp: "Percentual sobre o FGTS calculado.",
  cobertura_bp: "Cobertura de ausências, sobre remuneração + encargos + benefícios. Pode ser trocada por posto.",
  iss_bp: "Tributo sobre o preço. Pode ser trocado por proposta.",
  pis_bp: "Tributo sobre o preço.",
  cofins_bp: "Tributo sobre o preço.",
  irpj_bp: "Tributo sobre o preço.",
  csll_bp: "Tributo sobre o preço.",
  despesas_bp: "Despesas, sobre o preço.",
  lucro_bp: "Lucro desejado, sobre o preço.",
  margem_minima_bp: "Abaixo disso a proposta pede justificativa do gestor.",
};

// Caso de referência do negócio (Auxiliar de Limpeza 44h, fornecimento do cliente): com os percentuais abaixo (D = 22,24%) o custo é R$ 5.357,71 e o preço R$ 6.890,06.
export const POSTO_SIMULADOR_TS: PostoTsEntrada = {
  salarioCentavos: 183740,
  adicionais: [{ tipo: "insalubridade", modo: "valor", valorCentavos: 32420 }, { tipo: "assiduidade", modo: "valor", valorCentavos: 31500 }],
  beneficios: [{ tipo: "vale_transporte", valorCentavos: 20000 }, { tipo: "refeicao", valorCentavos: 48000 }, { tipo: "cesta_basica", valorCentavos: 15191 }],
  uniformeEpiCentavos: 10000, insumosCentavos: 0, operacaoCentavos: 25000, efetivos: 1,
};
export const PARAMETROS_REFERENCIA_TS: ParametrosTs = { ...PARAMETROS_TS_INICIAIS, iss_bp: 500, pis_bp: 65, cofins_bp: 300, irpj_bp: 480, csll_bp: 288, despesas_bp: 300, lucro_bp: 291, margem_minima_bp: 200 };

// Simulador local: a MESMA função pura que o servidor usa (propostaTsCalculo), sem rota e sem gravar nada.
export function simularPostoTs(p: ParametrosTs): { custo: number; encargos: number; preco: number | null } {
  const c = calcularPostoTs(POSTO_SIMULADOR_TS, p, { insumosContam: false });
  const d = deducoesPrecoTs(p).totalBp;
  return { custo: c.custoUnitCentavos, encargos: c.encargosCentavos, preco: d > 0 && d < BP_MAXIMO ? precoDoCustoTs(c.custoUnitCentavos, p) : null };
}

const bpParaTexto = (bp: number) => formatarPercentualBp(bp).replace("%", "");
const MSG_FORMATO = (k: keyof ParametrosTs) => `${ROTULO_PARAMETRO_TS[k]}: informe o percentual com até 2 casas (ex.: 23 ou 3,5).`;

export default function PercentuaisTsAdmin({ podeEditar = true }: { podeEditar?: boolean }) {
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
      const r = await lerResposta<Dados>(await fetch("/api/comercial/propostas/ts/parametros"));
      if (!r.ok) { setErroCarga(r.json.error ?? "Não foi possível carregar os percentuais da Terceirização."); return; }
      setDados(r.json as Dados);
      setErroCarga("");
      // Primeira carga: o formulário já começa com os percentuais de hoje (a diretoria só muda o que mudou).
      setValores((atual) => (Object.keys(atual).length > 0 || !r.json.vigentes ? atual : Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, bpParaTexto((r.json.vigentes as Linha)[k])]))));
    } catch {
      setErroCarga("Não foi possível carregar os percentuais da Terceirização.");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // O que está digitado, em pontos-base (null = campo inválido). Alimenta a soma, o simulador e o envio.
  const digitados = Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, percentualParaBp(valores[k] ?? "")])) as Record<keyof ParametrosTs, number | null>;
  const todosValidos = CHAVES_PARAMETROS_TS.every((k) => digitados[k] !== null && (digitados[k] as number) <= BP_MAXIMO);
  const parametrosDigitados: ParametrosTs | null = todosValidos ? (Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, digitados[k]])) as unknown as ParametrosTs) : null;
  const somaD = (["iss_bp", "pis_bp", "cofins_bp", "irpj_bp", "csll_bp", "despesas_bp", "lucro_bp"] as const).reduce((t, k) => t + (digitados[k] ?? 0), 0);
  const deducoesInvalidas = somaD >= BP_MAXIMO;

  function conferir(): { erro: string } | { bp: Record<string, number> } {
    if (!dados) return { erro: "Aguarde o carregamento." };
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data)) return { erro: "Informe a data de início da vigência." };
    if (data < dados.hoje) return { erro: MSG_VIGENCIA_NO_PASSADO };
    const bp: Record<string, number> = {};
    for (const k of CHAVES_PARAMETROS_TS) {
      const v = digitados[k];
      if (v === null) return { erro: MSG_FORMATO(k) };
      if (v > BP_MAXIMO) return { erro: `${ROTULO_PARAMETRO_TS[k]} passa do limite de ${formatarPercentualBp(BP_MAXIMO)}.` };
      bp[k] = v;
    }
    if (deducoesInvalidas) return { erro: MSG_DEDUCOES_TS_INVALIDAS };
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
      const r = await lerResposta(await fetch("/api/comercial/propostas/ts/parametros", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vigente_desde: data, ...c.bp }),
      }));
      if (!r.ok) {
        // 409 = já existe vigência nesta data: a rota diz qual é o problema e a pessoa só precisa escolher outra data.
        setErro(r.status === 409 ? (r.json.error ?? "Já existe uma vigência com esta data. Escolha outra data.") : (r.json.error ?? "Não foi possível salvar os percentuais."));
        setConfirmando(false);
        return;
      }
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

  const celulas = (l: Linha) => CHAVES_PARAMETROS_TS.map((k) => <td key={k} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatarPercentualBp(l[k])}</td>);
  const vigenteConfigurada = dados.vigentes ? deducoesPrecoTs(dados.vigentes).totalBp > 0 : false;
  const sim = parametrosDigitados && parametrosTsValidos(parametrosDigitados) ? simularPostoTs(parametrosDigitados) : null;
  const ref = simularPostoTs(PARAMETROS_REFERENCIA_TS);

  return (
    <div data-percentuais-ts style={{ display: "grid", gap: 16 }}>
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Vigência de hoje</h3>
        {dados.vigentes ? (
          <>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>Em vigor desde {fmtData(dados.vigentes.vigente_desde)}. É com estes percentuais que as propostas da Terceirização são calculadas hoje.</div>
            {!vigenteConfigurada && <Aviso tipo="alerta">Os percentuais de preço (tributos, despesas e lucro) ainda não foram configurados: enquanto estiverem zerados, nenhuma proposta da Terceirização pode ser calculada. Cadastre uma vigência abaixo.</Aviso>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              {CHAVES_PARAMETROS_TS.map((k) => (
                <div key={k} data-vigente={k} style={{ fontSize: 14 }}><span style={{ color: "#6B7280" }}>{ROTULO_PARAMETRO_TS[k]}: </span><strong>{formatarPercentualBp(dados.vigentes![k])}</strong></div>
              ))}
            </div>
          </>
        ) : (
          <Aviso tipo="alerta">Não há percentuais em vigor hoje: as propostas da Terceirização não podem ser calculadas.{podeEditar ? " Cadastre uma vigência abaixo." : ""}</Aviso>
        )}
      </div>

      {podeEditar && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Cadastrar nova vigência</h3>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
            Os percentuais novos valem a partir da data escolhida (hoje ou depois). O que já foi enviado não muda. Uma vez cadastrada, a vigência não pode ser editada nem apagada: para corrigir, cadastre outra com uma data diferente.
          </div>
          <div style={{ maxWidth: 240, marginBottom: 12 }}>
            <label style={labelStyle}>Vale a partir de *</label>
            <input type="date" style={inputStyle} value={data} min={dados.hoje} data-campo="vigente_desde" onChange={(e) => { setData(e.target.value); setConfirmando(false); setErro(""); }} disabled={salvando} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {CHAVES_PARAMETROS_TS.map((k) => (
              <div key={k}>
                <label style={labelStyle}>{ROTULO_PARAMETRO_TS[k]} (%)</label>
                <input style={inputStyle} inputMode="decimal" value={valores[k] ?? ""} disabled={salvando} data-campo={k}
                  onChange={(e) => { setValores({ ...valores, [k]: e.target.value }); setConfirmando(false); setErro(""); }} />
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{AJUDA[k]}</div>
              </div>
            ))}
          </div>

          <div data-soma-d style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, border: `1px solid ${deducoesInvalidas ? "#FCA5A5" : "#E5E7EB"}`, background: deducoesInvalidas ? "#FEF2F2" : "#F9FAFB", fontSize: 14 }}>
            Soma dos percentuais sobre o preço (D): <strong data-valor-d>{formatarPercentualBp(somaD)}</strong>
            <div style={{ fontSize: 12, color: "#6B7280" }}>ISS + PIS + COFINS + IRPJ + CSLL + despesas + lucro. O preço é o custo ÷ (100% − D), então D precisa ficar abaixo de 100%.</div>
            {deducoesInvalidas && <div data-erro-d style={{ color: "#991B1B", fontWeight: 600, marginTop: 4 }}>{MSG_DEDUCOES_TS_INVALIDAS}</div>}
          </div>

          <div data-simulador style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Simulador (não grava nada)</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Auxiliar de Limpeza 44h, 1 efetivo, insumos do cliente: o mesmo cálculo que o sistema usa nas propostas, com os percentuais digitados acima.</div>
            {sim ? (
              <div style={{ display: "grid", gap: 2 }}>
                <div>Custo por efetivo: <strong data-sim-custo>{formatarCentavosBRL(sim.custo)}</strong></div>
                <div>Encargos: <strong data-sim-encargos>{formatarCentavosBRL(sim.encargos)}</strong></div>
                <div>Preço mensal: <strong data-sim-preco>{sim.preco !== null ? formatarCentavosBRL(sim.preco) : "—"}</strong>{sim.preco === null && <span style={{ color: "#6B7280", fontSize: 12 }}> (sem percentuais de preço, ou D de 100% ou mais)</span>}</div>
              </div>
            ) : (
              <div data-sim-incompleto style={{ color: "#6B7280", fontSize: 13 }}>Preencha todos os percentuais com até 2 casas para simular.</div>
            )}
            <div data-sim-referencia style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
              Referência (D = {formatarPercentualBp(deducoesPrecoTs(PARAMETROS_REFERENCIA_TS).totalBp)}): custo {formatarCentavosBRL(ref.custo)}, encargos {formatarCentavosBRL(ref.encargos)}, preço {ref.preco !== null ? formatarCentavosBRL(ref.preco) : "—"}.
            </div>
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
              <button type="button" style={{ ...btnPrimario, opacity: deducoesInvalidas ? 0.6 : 1 }} disabled={deducoesInvalidas} onClick={pedirConfirmacao}>Cadastrar nova vigência</button>
            </div>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Histórico</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280" }}>
                <th style={{ padding: "6px 8px" }}>Vale desde</th>
                <th style={{ padding: "6px 8px" }}>Cadastrada em</th>
                <th style={{ padding: "6px 8px" }}>Por</th>
                {CHAVES_PARAMETROS_TS.map((k) => <th key={k} style={{ padding: "6px 8px", textAlign: "right" }}>{ROTULO_PARAMETRO_TS[k]}</th>)}
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
