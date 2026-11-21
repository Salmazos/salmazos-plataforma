"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ROTULO_MODELO, ROTULO_SITUACAO, numeroComRevisao, type SituacaoProposta } from "@/lib/propostas";
import type { ConteudoMot } from "@/lib/propostaMot";
import type { PlanilhaMotDetalhe } from "@/lib/propostaServico";
import { camposMotDeProposta, conteudoMotDoForm, validadeMotDoForm, type CamposMotForm } from "@/components/propostas/CamposPropostaMot";
import CamposPropostaMot from "@/components/propostas/CamposPropostaMot";
import { ResumoFuncoesMot } from "@/components/propostas/PlanilhaMotView";
import ModalMarcarEnviadaMot from "@/components/propostas/ModalMarcarEnviadaMot";
import ModalSituacaoProposta, { type AcaoSituacao } from "@/components/propostas/ModalSituacaoProposta";
import { Aviso, btnPerigo, btnPrimario, btnSecundario, cardStyle, fmtDataHora, fmtMoeda, lerResposta, SeloTeste, SituacaoBadge, ValidadeTexto } from "@/components/propostas/propostasUi";

// Detalhe da proposta de Mão de Obra Temporária (variante do detalhe do R&S: o R&S continua no PropostaDetalheClient, sem nenhuma mudança de caminho).
export const TEXTO_PDF_MOT_EM_BREVE = "PDF do MOT em breve";

interface Revisao { id: string; revisao: number; template_versao: number; vendedor_nome: string | null; created_at: string }
interface Historico { id: string; de: string | null; para: string; autor_nome: string | null; observacao: string | null; created_at: string }
export interface DetalheMot {
  id: string; numero: string; modelo: string; revisao_atual: number; situacao: SituacaoProposta; cliente_nome: string; aos_cuidados: string | null;
  empresa_visitada_id: string | null; conteudo: Partial<ConteudoMot> | null;
  validade_dias: number; validade_ate: string | null; valor_estimado: number | null; enviada_em: string | null; updated_at: string;
  vendedor_nome: string | null; vendedor_telefone: string | null; revisoes: Revisao[]; historico: Historico[]; teste?: boolean;
}
interface Contato { id: string; nome: string; cargo: string | null }

const ROTULO_HISTORICO = (h: Historico) =>
  h.de === null ? `Criada como ${ROTULO_SITUACAO[h.para as SituacaoProposta] ?? h.para}`
  : h.de === h.para ? "Revisão emitida"
  : `${ROTULO_SITUACAO[h.de as SituacaoProposta] ?? h.de} → ${ROTULO_SITUACAO[h.para as SituacaoProposta] ?? h.para}`;

interface Props {
  d: DetalheMot;
  hoje: string;
  podeEditar: boolean;
  somenteLeitura: boolean;
  temFunil: boolean;
  oportunidadeAbertaPropria: boolean;
  planilha: PlanilhaMotDetalhe | null;
  aviso: string | null;
  onAviso: (a: string | null) => void;
  onRecarregar: () => Promise<void>;
}

export default function PropostaDetalheMot({ d, hoje, podeEditar, somenteLeitura, temFunil, oportunidadeAbertaPropria, planilha, aviso, onAviso, onRecarregar }: Props) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<CamposMotForm | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoId, setContatoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");
  const salvandoAgora = useRef(false);
  const [modalEnviada, setModalEnviada] = useState(false);
  const [acao, setAcao] = useState<AcaoSituacao | null>(null);

  const aberta = d.situacao === "enviada" || d.situacao === "em_negociacao";
  const escreve = !somenteLeitura;
  const teste = d.teste === true;
  const funcoes = d.conteudo?.funcoes ?? [];
  const par = (rotulo: string, valor: React.ReactNode) => (
    <div><div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{rotulo}</div><div style={{ fontSize: 14, color: "#111827" }}>{valor || "—"}</div></div>
  );

  async function abrirEdicao() {
    setForm(camposMotDeProposta({ aos_cuidados: d.aos_cuidados, validade_dias: d.validade_dias, conteudo: d.conteudo }));
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

  async function salvar() {
    if (!form || salvandoAgora.current) return;
    salvandoAgora.current = true;
    setSalvando(true);
    setErroEdicao("");
    try {
      const r = await lerResposta(await fetch(`/api/comercial/propostas/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updated_at: d.updated_at, aos_cuidados: form.aos_cuidados.trim() || null, validade_dias: validadeMotDoForm(form), conteudo: conteudoMotDoForm(form) }),
      }));
      if (!r.ok) {
        if (r.status === 409 && !/percentuais/i.test(r.json.error ?? "")) {
          // Alguém mexeu na proposta (ou a situação mudou): descarta a edição e mostra o que está salvo agora.
          setEditando(false);
          onAviso(`${r.json.error ?? "A proposta foi alterada."} A proposta foi recarregada; refaça a edição.`);
          await onRecarregar();
          return;
        }
        setErroEdicao(r.json.error ?? "Não foi possível salvar.");
        return;
      }
      setEditando(false);
      onAviso(d.situacao === "rascunho" ? null : `Revisão ${d.revisao_atual + 1} emitida. O PDF do MOT ainda não está disponível.`);
      await onRecarregar();
    } catch {
      setErroEdicao("Não foi possível salvar.");
    } finally {
      setSalvando(false);
      salvandoAgora.current = false;
    }
  }

  // Devolve a mensagem de erro (o modal a mostra) ou null quando deu certo. No envio do MOT nenhum valor é mandado: o servidor calcula.
  async function mudarSituacao(corpo: Record<string, unknown>): Promise<string | null> {
    try {
      const r = await lerResposta<{ aviso: string | null }>(await fetch(`/api/comercial/propostas/${d.id}/situacao`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      }));
      if (!r.ok) {
        // 409 por mudança concorrente: recarrega. O 409 "sem percentuais" só mostra a mensagem.
        if (r.status === 409 && !/percentuais/i.test(r.json.error ?? "")) await onRecarregar();
        return r.json.error ?? "Não foi possível alterar a situação.";
      }
      setModalEnviada(false);
      setAcao(null);
      onAviso(r.json.aviso ?? null);
      await onRecarregar();
      return null;
    } catch {
      return "Não foi possível alterar a situação.";
    }
  }

  const botaoPdf = (rotulo: string) => (
    <button type="button" disabled title={TEXTO_PDF_MOT_EM_BREVE} data-pdf-mot style={{ ...btnSecundario, opacity: 0.55, cursor: "not-allowed" }}>{rotulo}</button>
  );
  const rotuloVigencia = planilha?.origem === "revisao" ? "Planilha desta revisão, com os percentuais em vigor desde" : "Cálculo de hoje, com os percentuais em vigor desde";

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}><Link href="/painel/comercial/propostas" style={{ fontSize: 13, color: "#6B7280" }}>← Propostas</Link></div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>{numeroComRevisao(d.numero, d.revisao_atual)}{teste && <span style={{ marginLeft: 10, verticalAlign: "middle" }}><SeloTeste /></span>}</h1>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <SituacaoBadge situacao={d.situacao} />
            <span style={{ fontSize: 13, color: "#6B7280" }}>{ROTULO_MODELO.MOT}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {botaoPdf(TEXTO_PDF_MOT_EM_BREVE)}
          {escreve && podeEditar && !editando && <button style={btnSecundario} onClick={abrirEdicao}>Editar</button>}
          {escreve && d.situacao === "rascunho" && <button style={btnPrimario} onClick={() => setModalEnviada(true)}>Marcar como enviada</button>}
          {escreve && aberta && <button style={btnPrimario} onClick={() => setAcao("aceita")}>Aceita</button>}
          {escreve && aberta && <button style={btnPerigo} onClick={() => setAcao("recusada")}>Recusada</button>}
          {escreve && (d.situacao === "rascunho" || aberta) && <button style={btnPerigo} onClick={() => setAcao("cancelada")}>Cancelar</button>}
        </div>
      </div>

      {somenteLeitura && <Aviso tipo="info">Você está só acompanhando esta proposta (somente leitura).</Aviso>}
      {teste && <Aviso tipo="alerta">Proposta de TESTE: fora das listas dos vendedores e sem efeito no Funil.</Aviso>}
      {aviso && <Aviso tipo="alerta">{aviso}</Aviso>}

      {editando && form ? (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          {d.situacao !== "rascunho" && <Aviso tipo="alerta">Isto vai gerar a Rev. {d.revisao_atual + 1}. A revisão anterior continua guardada, a validade recomeça a contar de hoje e o cálculo usa os percentuais em vigor hoje.</Aviso>}
          <CamposPropostaMot valor={form} onChange={setForm} contatos={contatos} contatoId={contatoId} onContato={setContatoId} />
          {erroEdicao && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erroEdicao}</Aviso></div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button style={{ ...btnPrimario, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : d.situacao === "rascunho" ? "Salvar" : `Salvar e gerar Rev. ${d.revisao_atual + 1}`}</button>
            <button style={btnSecundario} disabled={salvando} onClick={() => setEditando(false)}>Cancelar edição</button>
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {par("Cliente", d.cliente_nome)}
            {par("A/C", d.aos_cuidados)}
            {par("Vendedor", d.vendedor_nome)}
            {par("Valor estimado", d.valor_estimado != null ? fmtMoeda(d.valor_estimado) : planilha?.previa ? `${fmtMoeda(planilha.previa.total_mensal_centavos / 100)} (calculado hoje)` : null)}
            {par("Enviada em", d.enviada_em ? fmtDataHora(d.enviada_em) : null)}
            {par("Validade", d.validade_ate ? <ValidadeTexto validadeAte={d.validade_ate} situacao={d.situacao} hoje={hoje} /> : `${d.validade_dias} dias a partir do envio`)}
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Funções</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ textAlign: "left", color: "#6B7280" }}><th style={{ padding: "4px 8px" }}>Área</th><th style={{ padding: "4px 8px" }}>Descrição</th><th style={{ padding: "4px 8px" }}>Jornada</th><th style={{ padding: "4px 8px" }}>Horário</th></tr></thead>
                <tbody>
                  {funcoes.map((f, i) => (
                    <tr key={i} data-funcao={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "4px 8px" }}>{f.area}</td><td style={{ padding: "4px 8px" }}>{f.descricao || "—"}</td><td style={{ padding: "4px 8px" }}>{f.jornada}</td><td style={{ padding: "4px 8px" }}>{f.horario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Planilha de valores</div>
            {planilha?.erro && <Aviso tipo="alerta">{planilha.erro}</Aviso>}
            {planilha?.previa && <ResumoFuncoesMot previa={planilha.previa} funcoes={funcoes.map((f) => ({ area: f.area, descricao: f.descricao ?? null }))} rotuloVigencia={rotuloVigencia} />}
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
                <div key={i} style={{ fontSize: 14, color: "#111827", marginBottom: 6 }}><strong>{i + 1}.</strong> {c}</div>
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
              <span data-pdf-mot style={{ color: "#9CA3AF", fontSize: 13 }}>{TEXTO_PDF_MOT_EM_BREVE}</span>
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

      {modalEnviada && (
        <ModalMarcarEnviadaMot
          numero={d.numero} clienteNome={d.cliente_nome} validadeDias={d.validade_dias} hoje={hoje}
          previa={planilha?.origem === "hoje" ? planilha.previa : null}
          erroCalculo={planilha?.origem === "hoje" ? planilha.erro : "Não foi possível calcular o valor desta proposta. Recarregue a página."}
          funcoes={funcoes.map((f) => ({ area: f.area, descricao: f.descricao ?? null }))}
          vendedorTemTelefone={!!d.vendedor_telefone?.trim()} temFunil={temFunil && !teste} teste={teste}
          onClose={() => setModalEnviada(false)} onConfirmar={() => mudarSituacao({ para: "enviada" })}
        />
      )}
      {acao && <ModalSituacaoProposta acao={acao} temFunil={temFunil && !teste} exigeMotivo={oportunidadeAbertaPropria} onClose={() => setAcao(null)} onConfirmar={(dados) => mudarSituacao({ para: acao, ...dados })} />}
    </div>
  );
}
