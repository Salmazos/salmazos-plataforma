"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ROTULO_MODELO, ROTULO_SITUACAO, numeroComRevisao, type SituacaoProposta } from "@/lib/propostas";
import { MSG_PDF_TS_INDISPONIVEL, PDF_TS_DISPONIVEL, type ConteudoTs } from "@/lib/propostaTs";
import { numeroClausulaAdicionalMot } from "@/lib/propostaMot";
import type { PlanilhaTsDetalhe } from "@/lib/propostaServico";
import CamposPropostaTs, { bloqueioTs, camposTsDeProposta, conteudoTsDoForm, validadeTsDoForm, type CamposTsForm, type EstadoPreviaTs } from "@/components/propostas/CamposPropostaTs";
import { PlanilhaTsView } from "@/components/propostas/PlanilhaTsView";
import ModalSituacaoProposta, { type AcaoSituacao } from "@/components/propostas/ModalSituacaoProposta";
import { Aviso, btnPerigo, btnPrimario, btnSecundario, cardStyle, fmtDataHora, fmtMoeda, lerResposta, SeloTeste, SituacaoBadge, ValidadeTexto } from "@/components/propostas/propostasUi";

// Detalhe da proposta de Terceirização (variante do detalhe do MOT). Enquanto o PDF da Terceirização não existe (etapa 2E), "Marcar como enviada" fica desabilitado e a
// rota também recusa; o PDF do rascunho e das revisões não é oferecido.

interface Revisao { id: string; revisao: number; template_versao: number; vendedor_nome: string | null; created_at: string }
interface Historico { id: string; de: string | null; para: string; autor_nome: string | null; observacao: string | null; created_at: string }
export interface DetalheTs {
  id: string; numero: string; modelo: string; revisao_atual: number; situacao: SituacaoProposta; cliente_nome: string; aos_cuidados: string | null;
  empresa_visitada_id: string | null; conteudo: Partial<ConteudoTs> | null;
  validade_dias: number; validade_ate: string | null; valor_estimado: number | null; enviada_em: string | null; updated_at: string;
  vendedor_nome: string | null; vendedor_telefone: string | null; revisoes: Revisao[]; historico: Historico[]; teste?: boolean;
}
interface Contato { id: string; nome: string; cargo: string | null }

const ROTULO_HISTORICO = (h: Historico) =>
  h.de === null ? `Criada como ${ROTULO_SITUACAO[h.para as SituacaoProposta] ?? h.para}`
  : h.de === h.para ? "Revisão emitida"
  : `${ROTULO_SITUACAO[h.de as SituacaoProposta] ?? h.de} → ${ROTULO_SITUACAO[h.para as SituacaoProposta] ?? h.para}`;

interface Props {
  d: DetalheTs;
  hoje: string;
  gestor: boolean;
  podeEditar: boolean;
  somenteLeitura: boolean;
  temFunil: boolean;
  oportunidadeAbertaPropria: boolean;
  planilha: PlanilhaTsDetalhe | null;
  aviso: string | null;
  onAviso: (a: string | null) => void;
  onRecarregar: () => Promise<void>;
}

export default function PropostaDetalheTs({ d, hoje, gestor, podeEditar, somenteLeitura, temFunil, oportunidadeAbertaPropria, planilha, aviso, onAviso, onRecarregar }: Props) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<CamposTsForm | null>(null);
  const [previa, setPrevia] = useState<EstadoPreviaTs>({ previa: null, erro: null, status: null, carregando: false, mapa: [] });
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoId, setContatoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");
  const salvandoAgora = useRef(false);
  const [acao, setAcao] = useState<AcaoSituacao | null>(null);

  const aberta = d.situacao === "enviada" || d.situacao === "em_negociacao";
  const escreve = !somenteLeitura;
  const teste = d.teste === true;
  const servicos = (d.conteudo?.servicos ?? []) as { nome?: string; descricao?: string | null; modo?: string; postos?: { escala?: string; escala_texto?: string | null; horas_mensais?: number; efetivos?: number }[] }[];
  const par = (rotulo: string, valor: React.ReactNode) => (
    <div><div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{rotulo}</div><div style={{ fontSize: 14, color: "#111827" }}>{valor || "—"}</div></div>
  );

  async function abrirEdicao() {
    setForm(camposTsDeProposta({ aos_cuidados: d.aos_cuidados, validade_dias: d.validade_dias, conteudo: d.conteudo }));
    setErroEdicao("");
    setEditando(true);
    if (d.empresa_visitada_id) {
      try {
        const r = await lerResposta<{ data: Contato[] }>(await fetch(`/api/comercial/propostas/empresas/${d.empresa_visitada_id}/contatos`));
        if (r.ok) setContatos(r.json.data ?? []);
        else setErroEdicao(r.json.error ?? "Não foi possível carregar os contatos da empresa. O A/C continua digitável.");
      } catch {
        setErroEdicao("Não foi possível carregar os contatos da empresa. O A/C continua digitável.");
      }
    }
  }

  const bloqueio = form ? bloqueioTs(form, previa, gestor) : null;

  async function salvar() {
    if (!form || salvandoAgora.current) return;
    if (bloqueio) { setErroEdicao(bloqueio); return; }
    salvandoAgora.current = true;
    setSalvando(true);
    setErroEdicao("");
    try {
      const r = await lerResposta<{ aviso?: string }>(await fetch(`/api/comercial/propostas/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updated_at: d.updated_at, aos_cuidados: form.aos_cuidados.trim() || null, validade_dias: validadeTsDoForm(form), conteudo: conteudoTsDoForm(form, { gestor }) }),
      }));
      if (!r.ok) {
        if (r.status === 409 && !/percentuais/i.test(r.json.error ?? "")) {
          setEditando(false);
          onAviso(`${r.json.error ?? "A proposta foi alterada."} A proposta foi recarregada; refaça a edição.`);
          await onRecarregar();
          return;
        }
        setErroEdicao(r.status === 403 ? (r.json.error ?? "Você não tem permissão para fazer esta alteração.") : (r.json.error ?? "Não foi possível salvar."));
        return;
      }
      setEditando(false);
      onAviso(d.situacao === "rascunho" ? null : `Revisão ${d.revisao_atual + 1} emitida.${r.json.aviso ? ` ${r.json.aviso}` : ""}`);
      await onRecarregar();
    } catch {
      setErroEdicao("Não foi possível salvar.");
    } finally {
      setSalvando(false);
      salvandoAgora.current = false;
    }
  }

  async function mudarSituacao(corpo: Record<string, unknown>): Promise<string | null> {
    try {
      const r = await lerResposta<{ aviso: string | null }>(await fetch(`/api/comercial/propostas/${d.id}/situacao`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      }));
      if (!r.ok) {
        if (r.status === 409 && !/percentuais/i.test(r.json.error ?? "")) await onRecarregar();
        return r.json.error ?? "Não foi possível alterar a situação.";
      }
      setAcao(null);
      onAviso(r.json.aviso ?? null);
      await onRecarregar();
      return null;
    } catch {
      return "Não foi possível alterar a situação.";
    }
  }

  const rotuloVigencia = planilha?.origem === "revisao" ? "Planilha desta revisão, com os percentuais em vigor desde" : "Cálculo de hoje, com os percentuais em vigor desde";
  const semPercentuais = !!planilha?.erro && /percentuais/i.test(planilha.erro);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}><Link href="/painel/comercial/propostas" style={{ fontSize: 13, color: "#6B7280" }}>← Propostas</Link></div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>{numeroComRevisao(d.numero, d.revisao_atual)}{teste && <span style={{ marginLeft: 10, verticalAlign: "middle" }}><SeloTeste /></span>}</h1>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <SituacaoBadge situacao={d.situacao} />
            <span style={{ fontSize: 13, color: "#6B7280" }}>{ROTULO_MODELO.TS}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {escreve && podeEditar && !editando && <button style={btnSecundario} onClick={abrirEdicao}>Editar</button>}
          {escreve && d.situacao === "rascunho" && (
            <button data-marcar-enviada style={{ ...btnPrimario, opacity: PDF_TS_DISPONIVEL ? 1 : 0.5, cursor: PDF_TS_DISPONIVEL ? "pointer" : "not-allowed" }} disabled={!PDF_TS_DISPONIVEL}
              title={PDF_TS_DISPONIVEL ? undefined : MSG_PDF_TS_INDISPONIVEL}>Marcar como enviada</button>
          )}
          {escreve && aberta && <button style={btnPrimario} onClick={() => setAcao("aceita")}>Aceita</button>}
          {escreve && aberta && <button style={btnPerigo} onClick={() => setAcao("recusada")}>Recusada</button>}
          {escreve && (d.situacao === "rascunho" || aberta) && <button style={btnPerigo} onClick={() => setAcao("cancelada")}>Cancelar</button>}
        </div>
      </div>
      {escreve && d.situacao === "rascunho" && !PDF_TS_DISPONIVEL && <div data-aviso-pdf style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>{MSG_PDF_TS_INDISPONIVEL}.</div>}

      {somenteLeitura && <Aviso tipo="info">Você está só acompanhando esta proposta (somente leitura).</Aviso>}
      {teste && <Aviso tipo="alerta">Proposta de TESTE: fora das listas dos vendedores e sem efeito no Funil.</Aviso>}
      {aviso && <Aviso tipo="alerta">{aviso}</Aviso>}

      {editando && form ? (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          {d.situacao !== "rascunho" && <Aviso tipo="alerta">Isto vai gerar a Rev. {d.revisao_atual + 1}. A revisão anterior continua guardada, a validade recomeça a contar de hoje e o cálculo usa os percentuais em vigor hoje.</Aviso>}
          <CamposPropostaTs valor={form} onChange={setForm} gestor={gestor} contatos={contatos} contatoId={contatoId} onContato={setContatoId} onPrevia={setPrevia} />
          {erroEdicao && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erroEdicao}</Aviso></div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button style={{ ...btnPrimario, opacity: salvando || bloqueio ? 0.6 : 1 }} disabled={salvando || !!bloqueio} onClick={salvar}>{salvando ? "Salvando…" : d.situacao === "rascunho" ? "Salvar" : `Salvar e gerar Rev. ${d.revisao_atual + 1}`}</button>
            <button style={btnSecundario} disabled={salvando} onClick={() => setEditando(false)}>Cancelar edição</button>
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {par("Cliente", d.cliente_nome)}
            {par("A/C", d.aos_cuidados)}
            {par("Vendedor", d.vendedor_nome)}
            {par("Valor estimado", d.valor_estimado != null ? fmtMoeda(d.valor_estimado) : planilha?.planilha ? `${fmtMoeda(planilha.planilha.total_mensal_centavos / 100)} (calculado hoje)` : null)}
            {par("Enviada em", d.enviada_em ? fmtDataHora(d.enviada_em) : null)}
            {par("Validade", d.validade_ate ? <ValidadeTexto validadeAte={d.validade_ate} situacao={d.situacao} hoje={hoje} /> : `${d.validade_dias} dias a partir do envio`)}
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Postos</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ textAlign: "left", color: "#6B7280" }}><th style={{ padding: "4px 8px" }}>Serviço</th><th style={{ padding: "4px 8px" }}>Escopo</th><th style={{ padding: "4px 8px" }}>Escala</th><th style={{ padding: "4px 8px" }}>Efetivos</th></tr></thead>
                <tbody>
                  {servicos.map((s, i) => (
                    <tr key={i} data-posto={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "4px 8px" }}>{s.nome}</td>
                      <td style={{ padding: "4px 8px" }}>{s.descricao || "—"}</td>
                      <td style={{ padding: "4px 8px" }}>{s.modo === "fechado" ? "Serviço fechado" : s.postos?.[0] ? `${s.postos[0].escala === "outra" ? s.postos[0].escala_texto : s.postos[0].escala} · ${s.postos[0].horas_mensais} h/mês` : "—"}</td>
                      <td style={{ padding: "4px 8px" }}>{s.modo === "fechado" ? "—" : s.postos?.reduce((t, p) => t + (p.efetivos ?? 0), 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Planilha de valores</div>
            {planilha?.erro && (
              <div data-erro-planilha>
                <Aviso tipo="alerta">{planilha.erro}</Aviso>
                {semPercentuais && gestor && <Link href="/painel/comercial/propostas?aba=percentuais-ts" data-configurar-percentuais style={{ color: "#B45309", fontWeight: 700, fontSize: 13 }}>Configurar percentuais</Link>}
              </div>
            )}
            {planilha?.planilha && <PlanilhaTsView planilha={planilha.planilha} gestor={gestor} rotuloVigencia={rotuloVigencia} />}
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Condições</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {par("Vencimento da fatura", `dia ${[...(d.conteudo?.condicoes?.vencimentos_dias ?? [15, 30])].sort((a, b) => a - b).join(" e dia ")}`)}
              {par("Antecedência", `${d.conteudo?.condicoes?.antecedencia_dias ?? 5} dias antes do pagamento`)}
              {par("Cargo na assinatura", d.conteudo?.cargo_supervisao || "Cargo do perfil do vendedor")}
            </div>
          </div>

          {(d.conteudo?.clausulas_adicionais?.length ?? 0) > 0 && (
            <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Cláusulas adicionais</div>
              {d.conteudo?.clausulas_adicionais?.map((c, i) => (
                <div key={i} style={{ fontSize: 14, color: "#111827", marginBottom: 6 }}><strong>{numeroClausulaAdicionalMot(i)}</strong> {c}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Revisões</h3>
          {d.revisoes.length === 0 ? <span style={{ color: "#6B7280", fontSize: 14 }}>Ainda não enviada.</span> : d.revisoes.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #F3F4F6", fontSize: 14 }}>
              <span><strong>Rev. {r.revisao}</strong>{r.revisao === d.revisao_atual ? " (atual)" : ""} · {fmtDataHora(r.created_at)}</span>
            </div>
          ))}
        </div>
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Histórico</h3>
          {d.historico.map((h) => (
            <div key={h.id} style={{ padding: "6px 0", borderTop: "1px solid #F3F4F6", fontSize: 14 }}>
              <div><strong>{ROTULO_HISTORICO(h)}</strong> <span style={{ color: "#6B7280", fontSize: 12 }}>· {fmtDataHora(h.created_at)} · {h.autor_nome ?? "automático"}</span></div>
              {h.observacao && <div style={{ color: "#4B5563", fontSize: 13 }}>{h.observacao}</div>}
            </div>
          ))}
        </div>
      </div>

      {acao && <ModalSituacaoProposta acao={acao} temFunil={temFunil && !teste} exigeMotivo={oportunidadeAbertaPropria} onClose={() => setAcao(null)} onConfirmar={(dados) => mudarSituacao({ para: acao, ...dados })} />}
    </div>
  );
}
