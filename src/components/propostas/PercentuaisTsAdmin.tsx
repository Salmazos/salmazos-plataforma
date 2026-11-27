"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BP_MAXIMO, CHAVES_ENCARGOS_TS, CHAVES_GANHO_TS, GANHO_MAXIMO_BP, calcularPostoTs, precoDoCustoTs, type ParametrosTs, type PostoTsEntrada } from "@/lib/propostaTsCalculo";
import { MSG_GANHO_MINIMO_MAIOR, ROTULO_PARAMETRO_TS } from "@/lib/propostaTs";
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

// Os percentuais digitados (o interruptor dos encargos é à parte), na ordem da tela.
type Chave = (typeof CHAVES_ENCARGOS_TS)[number] | (typeof CHAVES_GANHO_TS)[number];
const ORDEM: Chave[] = ["inss_bp", "fgts_bp", "multa_fgts_bp", "ganho_padrao_bp", "ganho_minimo_bp"];
const maximoDe = (k: Chave) => (k === "ganho_padrao_bp" || k === "ganho_minimo_bp" ? GANHO_MAXIMO_BP : BP_MAXIMO);

const AJUDA: Record<Chave, string> = {
  inss_bp: "Incide sobre a base, o 13º e o aviso prévio.",
  fgts_bp: "Incide sobre a base, as férias, o 13º e o aviso prévio.",
  multa_fgts_bp: "Percentual sobre o FGTS calculado.",
  ganho_padrao_bp: "Preço = custo + este percentual. 0 = não configurado.",
  ganho_minimo_bp: "Abaixo disso só o gestor libera, com justificativa.",
};
const AJUDA_ENCARGOS = "Ligado: insalubridade, adicionais e horas extras entram na base dos encargos. Desligado: só o salário.";

// Casos da planilha do negócio (salário de R$ 1.000,00, 1 efetivo, tudo pago pela Salmazos).
const casoPlanilha = (adicionais: [string, number][], beneficios: [string, number][], uniforme: number, operacao: number): PostoTsEntrada => ({
  salarioCentavos: 100000,
  adicionais: adicionais.map(([tipo, valorCentavos]) => ({ tipo, modo: "valor" as const, valorCentavos })),
  beneficios: beneficios.map(([tipo, valorCentavos]) => ({ tipo, valorCentavos, quemPaga: "salmazos" as const })),
  uniformeEpiCentavos: uniforme, uniformeEpiQuemPaga: "salmazos", insumosCentavos: 0, insumosQuemPaga: "salmazos", operacaoCentavos: operacao, efetivos: 1,
});
export const CASOS_SIMULADOR_TS: { codigo: string; rotulo: string; posto: PostoTsEntrada }[] = [
  { codigo: "limpeza", rotulo: "LIMPEZA", posto: casoPlanilha([], [["vale_transporte", 20000], ["refeicao", 48000], ["cesta_basica", 15191]], 10000, 25000) },
  { codigo: "maxsoy", rotulo: "LIMPEZA Maxsoy", posto: casoPlanilha([["insalubridade", 129680]], [["vale_transporte", 72600], ["cesta_basica", 60794]], 30000, 40000) },
  { codigo: "porteiro2025", rotulo: "PORTEIRO 2025", posto: casoPlanilha([["assiduidade", 30000]], [["ajuda_de_custo", 40000], ["vale_transporte", 35000], ["refeicao", 45000], ["cesta_basica", 14468]], 10000, 0) },
  { codigo: "porteiro2026", rotulo: "PORTEIRO 2026", posto: casoPlanilha([["hora_extra", 19500], ["hora_extra", 4000]], [["vale_transporte", 10000], ["cesta_basica", 15191]], 10000, 0) },
];

// Simulador local: as MESMAS funções puras que o servidor usa (propostaTsCalculo), sem rota e sem gravar nada.
export function simularPostoTs(posto: PostoTsEntrada, p: ParametrosTs): { custo: number; encargos: number; preco: number | null } {
  const c = calcularPostoTs(posto, p);
  return { custo: c.custoUnitCentavos, encargos: c.encargosCentavos, preco: p.ganho_padrao_bp > 0 ? precoDoCustoTs(c.custoUnitCentavos, p.ganho_padrao_bp) : null };
}

const bpParaTexto = (bp: number) => formatarPercentualBp(bp).replace("%", "");
const MSG_FORMATO = (k: Chave) => `${ROTULO_PARAMETRO_TS[k]}: informe o percentual com até 2 casas (ex.: 23 ou 3,5).`;

export default function PercentuaisTsAdmin({ podeEditar = true }: { podeEditar?: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [data, setData] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [sobreAdicionais, setSobreAdicionais] = useState(true);
  const [casoSim, setCasoSim] = useState(CASOS_SIMULADOR_TS[0].codigo);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const emAndamento = useRef(false);
  const jaCarregou = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const r = await lerResposta<Dados>(await fetch("/api/comercial/propostas/ts/parametros"));
      if (!r.ok) { setErroCarga(r.json.error ?? "Não foi possível carregar os percentuais da Terceirização."); return; }
      setDados(r.json as Dados);
      setErroCarga("");
      // Primeira carga: o formulário já começa com os percentuais de hoje (a diretoria só muda o que mudou).
      setValores((atual) => (Object.keys(atual).length > 0 || !r.json.vigentes ? atual : Object.fromEntries(ORDEM.map((k) => [k, bpParaTexto((r.json.vigentes as Linha)[k])]))));
      if (!jaCarregou.current && r.json.vigentes) setSobreAdicionais((r.json.vigentes as Linha).encargos_sobre_adicionais !== false);
      jaCarregou.current = true;
    } catch {
      setErroCarga("Não foi possível carregar os percentuais da Terceirização.");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // O que está digitado, em pontos-base (null = campo inválido). Alimenta o simulador e o envio.
  const digitados = Object.fromEntries(ORDEM.map((k) => [k, percentualParaBp(valores[k] ?? "")])) as Record<Chave, number | null>;
  const todosValidos = ORDEM.every((k) => digitados[k] !== null && (digitados[k] as number) <= maximoDe(k));
  const parametrosDigitados: ParametrosTs | null = todosValidos ? { ...(digitados as Record<Chave, number>), encargos_sobre_adicionais: sobreAdicionais } : null;

  // Só compara quando os dois estão digitados e válidos.
  const minimoMaior = digitados.ganho_padrao_bp !== null && digitados.ganho_minimo_bp !== null && digitados.ganho_minimo_bp > digitados.ganho_padrao_bp;

  function conferir(): { erro: string } | { bp: ParametrosTs } {
    if (!dados) return { erro: "Aguarde o carregamento." };
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data)) return { erro: "Informe a data de início da vigência." };
    if (data < dados.hoje) return { erro: MSG_VIGENCIA_NO_PASSADO };
    for (const k of ORDEM) {
      const v = digitados[k];
      if (v === null) return { erro: MSG_FORMATO(k) };
      if (v > maximoDe(k)) return { erro: `${ROTULO_PARAMETRO_TS[k]} passa do limite de ${formatarPercentualBp(maximoDe(k))}.` };
    }
    if (minimoMaior) return { erro: MSG_GANHO_MINIMO_MAIOR };
    return { bp: parametrosDigitados as ParametrosTs };
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

  const simNao = (v: boolean) => (v ? "Sim" : "Não");
  const celulas = (l: Linha) => (
    <>
      {ORDEM.map((k) => <td key={k} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatarPercentualBp(l[k])}</td>)}
      <td style={{ padding: "6px 8px", textAlign: "right" }}>{simNao(l.encargos_sobre_adicionais)}</td>
    </>
  );
  const vigenteConfigurada = (dados.vigentes?.ganho_padrao_bp ?? 0) > 0;
  const escolhido = CASOS_SIMULADOR_TS.find((c) => c.codigo === casoSim) ?? CASOS_SIMULADOR_TS[0];
  const sim = parametrosDigitados ? simularPostoTs(escolhido.posto, parametrosDigitados) : null;

  return (
    <div data-percentuais-ts style={{ display: "grid", gap: 16 }}>
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Vigência de hoje</h3>
        {dados.vigentes ? (
          <>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>Em vigor desde {fmtData(dados.vigentes.vigente_desde)}. É com estes percentuais que as propostas da Terceirização são calculadas hoje.</div>
            {!vigenteConfigurada && <Aviso tipo="alerta">O ganho padrão ainda não foi configurado: sem ele, a proposta só é calculada se o gestor informar o ganho nela. Cadastre uma vigência abaixo.</Aviso>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              {ORDEM.map((k) => (
                <div key={k} data-vigente={k} style={{ fontSize: 14 }}><span style={{ color: "#6B7280" }}>{ROTULO_PARAMETRO_TS[k]}: </span><strong>{formatarPercentualBp(dados.vigentes![k])}</strong></div>
              ))}
              <div data-vigente="encargos_sobre_adicionais" style={{ fontSize: 14 }}><span style={{ color: "#6B7280" }}>{ROTULO_PARAMETRO_TS.encargos_sobre_adicionais}: </span><strong>{simNao(dados.vigentes.encargos_sobre_adicionais)}</strong></div>
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
            {ORDEM.map((k) => (
              <div key={k}>
                <label style={labelStyle}>{ROTULO_PARAMETRO_TS[k]} (%)</label>
                <input style={inputStyle} inputMode="decimal" value={valores[k] ?? ""} disabled={salvando} data-campo={k}
                  onChange={(e) => { setValores({ ...valores, [k]: e.target.value }); setConfirmando(false); setErro(""); }} />
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{AJUDA[k]}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={sobreAdicionais} disabled={salvando} data-campo="encargos_sobre_adicionais" onChange={(e) => { setSobreAdicionais(e.target.checked); setConfirmando(false); setErro(""); }} />
              {ROTULO_PARAMETRO_TS.encargos_sobre_adicionais}
            </label>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{AJUDA_ENCARGOS}</div>
          </div>

          <div data-simulador style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Simulador (não grava nada)</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Casos da planilha (salário R$ 1.000,00, 1 efetivo): o mesmo cálculo das propostas, com os percentuais e o ganho padrão digitados acima.</div>
            <div style={{ maxWidth: 260, marginBottom: 6 }}>
              <select style={inputStyle} value={casoSim} aria-label="Caso do simulador" data-campo="caso_simulador" onChange={(e) => setCasoSim(e.target.value)}>
                {CASOS_SIMULADOR_TS.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}
              </select>
            </div>
            {sim ? (
              <div style={{ display: "grid", gap: 2 }}>
                <div>Custo por efetivo: <strong data-sim-custo>{formatarCentavosBRL(sim.custo)}</strong></div>
                <div>Encargos: <strong data-sim-encargos>{formatarCentavosBRL(sim.encargos)}</strong></div>
                <div>Preço mensal: <strong data-sim-preco>{sim.preco !== null ? formatarCentavosBRL(sim.preco) : "—"}</strong>{sim.preco === null && <span style={{ color: "#6B7280", fontSize: 12 }}> (informe o ganho padrão)</span>}</div>
              </div>
            ) : (
              <div data-sim-incompleto style={{ color: "#6B7280", fontSize: 13 }}>Preencha todos os percentuais com até 2 casas para simular.</div>
            )}
          </div>

          {minimoMaior && <div data-erro-minimo style={{ marginTop: 12 }}><Aviso tipo="erro">{MSG_GANHO_MINIMO_MAIOR}</Aviso></div>}
          {erro && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erro}</Aviso></div>}
          {ok && <div style={{ marginTop: 12 }}><Aviso tipo="info">{ok}</Aviso></div>}
          {confirmando ? (
            <div style={{ marginTop: 12 }}>
              <Aviso tipo="alerta">Confirma cadastrar estes percentuais a partir de {fmtData(data)}? Depois de salvos, não dá para editar nem apagar.</Aviso>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={{ ...btnPrimario, opacity: salvando ? 0.6 : 1 }} disabled={salvando || minimoMaior} onClick={gravar}>{salvando ? "Salvando…" : "Sim, cadastrar"}</button>
                <button type="button" style={btnSecundario} disabled={salvando} onClick={() => setConfirmando(false)}>Voltar</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <button type="button" style={{ ...btnPrimario, opacity: minimoMaior ? 0.6 : 1 }} disabled={minimoMaior} onClick={pedirConfirmacao}>Cadastrar nova vigência</button>
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
                {ORDEM.map((k) => <th key={k} style={{ padding: "6px 8px", textAlign: "right" }}>{ROTULO_PARAMETRO_TS[k]}</th>)}
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Encargos sobre adicionais</th>
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
