"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ROTULO_MODELO, ROTULO_SITUACAO, numeroComRevisao, type SituacaoProposta } from "@/lib/propostas";
import { formatarPct, PADROES_RS, type CondicoesRs } from "@/lib/propostaModelos";
import CamposProposta, { camposDeProposta, conteudoDoForm, validadeDoForm, type CamposForm } from "@/components/propostas/CamposProposta";
import ModalMarcarEnviada from "@/components/propostas/ModalMarcarEnviada";
import ModalSituacaoProposta, { type AcaoSituacao } from "@/components/propostas/ModalSituacaoProposta";
import { Aviso, btnPerigo, btnPrimario, btnSecundario, cardStyle, fmtData, fmtDataHora, fmtMoeda, lerResposta, SituacaoBadge, ValidadeTexto } from "@/components/propostas/propostasUi";

interface Revisao { id: string; revisao: number; template_versao: number; vendedor_nome: string | null; created_at: string }
interface Historico { id: string; de: string | null; para: string; autor_nome: string | null; observacao: string | null; created_at: string }
interface Detalhe {
  id: string; numero: string; modelo: string; revisao_atual: number; situacao: SituacaoProposta; cliente_nome: string; aos_cuidados: string | null;
  empresa_visitada_id: string | null; conteudo: { cliente_cnpj?: string | null; cliente_endereco?: string | null; condicoes?: CondicoesRs } | null;
  validade_dias: number; validade_ate: string | null; valor_estimado: number | null; enviada_em: string | null; updated_at: string;
  vendedor_nome: string | null; vendedor_telefone: string | null; revisoes: Revisao[]; historico: Historico[];
}
interface Contato { id: string; nome: string; cargo: string | null }

const ROTULO_HISTORICO = (h: Historico) =>
  h.de === null ? `Criada como ${ROTULO_SITUACAO[h.para as SituacaoProposta] ?? h.para}`
  : h.de === h.para ? "Revisão emitida"
  : `${ROTULO_SITUACAO[h.de as SituacaoProposta] ?? h.de} → ${ROTULO_SITUACAO[h.para as SituacaoProposta] ?? h.para}`;

export default function PropostaDetalheClient({ id, avisoInicial }: { id: string; avisoInicial: string | null }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [hoje, setHoje] = useState("");
  const [podeEditar, setPodeEditar] = useState(false);
  const [somenteLeitura, setSomenteLeitura] = useState(true);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(avisoInicial);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<CamposForm | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoId, setContatoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");
  const [modalEnviada, setModalEnviada] = useState(false);
  const [acao, setAcao] = useState<AcaoSituacao | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await lerResposta<{ data: Detalhe; hoje: string; podeEditar: boolean; somenteLeitura: boolean }>(await fetch(`/api/comercial/propostas/${id}`));
      if (!r.ok) { setErro(r.status === 404 ? "Proposta não encontrada." : r.json.error ?? "Não foi possível carregar a proposta."); return; }
      setD(r.json.data);
      setHoje(r.json.hoje);
      setPodeEditar(r.json.podeEditar);
      setSomenteLeitura(r.json.somenteLeitura);
      setErro("");
    } catch {
      setErro("Não foi possível carregar a proposta.");
    } finally {
      setCarregando(false);
    }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function abrirEdicao() {
    if (!d) return;
    setForm(camposDeProposta({ aos_cuidados: d.aos_cuidados, validade_dias: d.validade_dias, conteudo: d.conteudo }));
    setErroEdicao("");
    setEditando(true);
    if (d.empresa_visitada_id) {
      try {
        const r = await lerResposta<{ data: Contato[] }>(await fetch(`/api/comercial/empresas/${d.empresa_visitada_id}/contatos`));
        if (r.ok) setContatos(r.json.data ?? []);
      } catch { /* sem a lista, o A/C continua digitável */ }
    }
  }

  async function salvar() {
    if (!d || !form) return;
    setSalvando(true);
    setErroEdicao("");
    try {
      const r = await lerResposta(await fetch(`/api/comercial/propostas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updated_at: d.updated_at,
          aos_cuidados: form.aos_cuidados.trim() || null,
          validade_dias: validadeDoForm(form),
          conteudo: conteudoDoForm(form),
        }),
      }));
      if (!r.ok) { setErroEdicao(r.json.error ?? "Não foi possível salvar."); return; }
      setEditando(false);
      setAviso(d.situacao === "rascunho" ? null : `Revisão ${d.revisao_atual + 1} emitida. Gere o PDF desta revisão para enviar ao cliente.`);
      await carregar();
    } catch {
      setErroEdicao("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // Devolve a mensagem de erro (o modal a mostra) ou null quando deu certo.
  async function mudarSituacao(corpo: Record<string, unknown>): Promise<string | null> {
    try {
      const r = await lerResposta<{ aviso: string | null }>(await fetch(`/api/comercial/propostas/${id}/situacao`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      }));
      if (!r.ok) {
        // 409 = alguém mexeu na proposta: recarrega para mostrar o estado atual.
        if (r.status === 409) await carregar();
        return r.json.error ?? "Não foi possível alterar a situação.";
      }
      setModalEnviada(false);
      setAcao(null);
      setAviso(r.json.aviso ?? null);
      await carregar();
      return null;
    } catch {
      return "Não foi possível alterar a situação.";
    }
  }

  if (carregando) return <div style={{ padding: 24, color: "#6B7280" }}>Carregando…</div>;
  if (erro || !d) return <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}><Aviso tipo="erro">{erro || "Proposta não encontrada."}</Aviso><Link href="/painel/comercial/propostas">← Propostas</Link></div>;

  const condicoes: CondicoesRs = { ...PADROES_RS, ...(d.conteudo?.condicoes ?? {}) };
  const aberta = d.situacao === "enviada" || d.situacao === "em_negociacao";
  const escreve = !somenteLeitura;
  const urlPdf = `/api/comercial/propostas/${d.id}/pdf`;
  const par = (rotulo: string, valor: React.ReactNode) => (
    <div><div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{rotulo}</div><div style={{ fontSize: 14, color: "#111827" }}>{valor || "—"}</div></div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}><Link href="/painel/comercial/propostas" style={{ fontSize: 13, color: "#6B7280" }}>← Propostas</Link></div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>{numeroComRevisao(d.numero, d.revisao_atual)}</h1>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <SituacaoBadge situacao={d.situacao} />
            <span style={{ fontSize: 13, color: "#6B7280" }}>{ROTULO_MODELO[d.modelo as keyof typeof ROTULO_MODELO] ?? d.modelo}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={urlPdf} target="_blank" rel="noopener noreferrer" style={{ ...btnSecundario, textDecoration: "none", display: "inline-block" }}>{d.situacao === "rascunho" ? "Gerar PDF do rascunho" : `Gerar PDF (Rev. ${d.revisao_atual})`}</a>
          {escreve && podeEditar && !editando && <button style={btnSecundario} onClick={abrirEdicao}>Editar</button>}
          {escreve && d.situacao === "rascunho" && <button style={btnPrimario} onClick={() => setModalEnviada(true)}>Marcei como enviada</button>}
          {escreve && d.situacao === "enviada" && <button style={btnSecundario} onClick={() => setAcao("em_negociacao")}>Em negociação</button>}
          {escreve && aberta && <button style={btnPrimario} onClick={() => setAcao("aceita")}>Aceita</button>}
          {escreve && aberta && <button style={btnPerigo} onClick={() => setAcao("recusada")}>Recusada</button>}
          {escreve && (d.situacao === "rascunho" || aberta) && <button style={btnPerigo} onClick={() => setAcao("cancelada")}>Cancelar</button>}
        </div>
      </div>

      {somenteLeitura && <Aviso tipo="info">Você está só acompanhando esta proposta (somente leitura).</Aviso>}
      {aviso && <Aviso tipo="alerta">{aviso}</Aviso>}

      {editando && form ? (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          {d.situacao !== "rascunho" && <Aviso tipo="alerta">Isto vai gerar a Rev. {d.revisao_atual + 1}. A revisão anterior continua guardada e a validade recomeça a contar de hoje.</Aviso>}
          <CamposProposta valor={form} onChange={setForm} contatos={contatos} contatoId={contatoId} onContato={setContatoId} />
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
            {par("CNPJ", d.conteudo?.cliente_cnpj)}
            {par("Endereço", d.conteudo?.cliente_endereco)}
            {par("Vendedor", d.vendedor_nome)}
            {par("Valor estimado", fmtMoeda(d.valor_estimado))}
            {par("Enviada em", d.enviada_em ? fmtDataHora(d.enviada_em) : null)}
            {par("Validade", d.validade_ate ? <ValidadeTexto validadeAte={d.validade_ate} situacao={d.situacao} hoje={hoje} /> : `${d.validade_dias} dias a partir do envio`)}
          </div>
          <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 14, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Condições</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {par("Taxa sem reposição", formatarPct(condicoes.taxa_sem_reposicao_pct))}
              {par("Taxa com 01 reposição", formatarPct(condicoes.taxa_com_reposicao_pct))}
              {par("Taxa de cancelamento", formatarPct(condicoes.taxa_cancelamento_pct))}
              {par("Currículos em até", `${condicoes.prazo_envio_curriculos_dias_uteis} dias úteis`)}
              {par("Faturamento", `até ${condicoes.prazo_faturamento_dias} dias`)}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Revisões</h3>
          {d.revisoes.length === 0 ? <span style={{ color: "#6B7280", fontSize: 14 }}>Ainda não enviada: o PDF do rascunho usa o conteúdo atual.</span> : d.revisoes.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #F3F4F6", fontSize: 14 }}>
              <span><strong>Rev. {r.revisao}</strong>{r.revisao === d.revisao_atual ? " (atual)" : ""} · {fmtDataHora(r.created_at)}</span>
              <a href={`${urlPdf}?rev=${r.revisao}`} target="_blank" rel="noopener noreferrer" style={{ color: "#B45309", fontWeight: 700 }}>Ver PDF</a>
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
        <ModalMarcarEnviada
          numero={d.numero} clienteNome={d.cliente_nome} condicoes={condicoes} validadeDias={d.validade_dias} hoje={hoje}
          valorInicial={d.valor_estimado} vendedorTemTelefone={!!d.vendedor_telefone?.trim()}
          onClose={() => setModalEnviada(false)} onConfirmar={(valor) => mudarSituacao({ para: "enviada", valor_estimado: valor })}
        />
      )}
      {acao && <ModalSituacaoProposta acao={acao} onClose={() => setAcao(null)} onConfirmar={(dados) => mudarSituacao({ para: acao, ...dados })} />}
    </div>
  );
}
