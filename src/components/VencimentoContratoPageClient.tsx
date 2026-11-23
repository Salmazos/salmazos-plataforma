"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarDataSemFuso } from "@/lib/utils";
import { ehTerceirizacao, ordenarPorDiasTrabalhados, ordenarPorNomeContrato, rotuloModalidadeContrato, type ContratoMotFaixa, type OrdemDiasTrabalhados } from "@/lib/contratoMotStatus";
import type { SeloMot } from "@/lib/contratoMotEventos";
import { useScrollHorizontalSincronizado } from "@/hooks/useScrollHorizontalSincronizado";
import BarraScrollFlutuante from "./BarraScrollFlutuante";
import { fundoDeFormulario } from "@/lib/fundoDaJanela";

export interface VencimentoContratoRow {
  id: string;
  nomeCompleto: string;
  clienteId: string | null;
  empresa: string;
  dataAdmissao: string;
  // "mao_obra_temporaria" ou "terceirizacao".
  tipoServico: string;
  diasTrabalhados: number;
  vencimento90: string;
  vencimento180: string;
  vencimento270: string;
  faixa: ContratoMotFaixa;
  proximoVencimento: string;
  diasParaProximoVencimento: number;
  bg: string;
  text: string;
  label: string;
  // Só presente pra quem tem afastamento, prorrogação ou rescisão programada.
  selos?: SeloMot[];
  // Data da efetivação (YYYY-MM-DD); null = não efetivado. Efetivado: relógio de vencimento parado.
  efetivadoEm: string | null;
}

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  linhasIniciais: VencimentoContratoRow[];
  clientesFiltro: ClienteOption[];
}

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: 0.3,
  whiteSpace: "nowrap",
  borderBottom: "1px solid #E5E7EB",
};

const TD_STYLE: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#111827",
  whiteSpace: "nowrap",
};

// Cores do selo de modalidade: MOT = azul claro com borda; Terceirização = preto com letra dourada (cores da marca). Escolha feita para os dois
// serem inconfundíveis à primeira vista e para não repetir nenhuma cor de SITUAÇÃO desta tela (verde, âmbar, laranja, vermelho e o roxo de
// "data de admissão no futuro"). A lista de Funcionários tem a própria paleta (azul/roxo) e não muda.
const SELO_MODALIDADE = {
  MOT: { bg: "#DBEAFE", text: "#1D4ED8", borda: "#93C5FD" },
  "Terceirização": { bg: "#111827", text: "#FFD700", borda: "#111827" },
} as const;

// "Hoje" em Brasília (UTC-3, sem horário de verão): a data padrão/limite do modal não pode virar "amanhã" à noite no fuso do navegador.
function hojeLocalISO(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const SELO_EFETIVADO = { bg: "#DCFCE7", text: "#166534" } as const;

export default function VencimentoContratoPageClient({ linhasIniciais: linhasDoServidor, clientesFiltro }: Props) {
  const router = useRouter();
  // Cópia local: ao efetivar/desfazer a linha muda na hora (o servidor é a fonte da verdade e o refresh confirma).
  const [linhasIniciais, setLinhas] = useState(linhasDoServidor);
  useEffect(() => { setLinhas(linhasDoServidor); }, [linhasDoServidor]);
  // Padrão DESLIGADO (decisão do Olver): a linha continua visível com o selo verde "Efetivado em ...".
  const [ocultarEfetivados, setOcultarEfetivados] = useState(false);
  const [alvoEfetivar, setAlvoEfetivar] = useState<VencimentoContratoRow | null>(null);
  const [dataEfetivacao, setDataEfetivacao] = useState("");
  const [obsEfetivacao, setObsEfetivacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEfetivacao, setErroEfetivacao] = useState("");
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [filtroModalidade, setFiltroModalidade] = useState<"" | "mao_obra_temporaria" | "terceirizacao">("");
  const [busca, setBusca] = useState("");
  // Padrão: nome de A a Z. O título "Dias Trabalhados" (já clicável antes) passa a ordenar por dias e, nos cliques seguintes, inverte.
  const [ordemDias, setOrdemDias] = useState<OrdemDiasTrabalhados | "nome">("nome");

  const filtradas = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return (ordemDias === "nome" ? ordenarPorNomeContrato(linhasIniciais) : ordenarPorDiasTrabalhados(linhasIniciais, ordemDias)).filter((l) => {
      if (ocultarEfetivados && l.efetivadoEm) return false;
      if (filtroModalidade && l.tipoServico !== filtroModalidade) return false;
      if (filtroClienteId && l.clienteId !== filtroClienteId) return false;
      if (buscaLower && !l.nomeCompleto.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }, [linhasIniciais, ordemDias, filtroModalidade, filtroClienteId, busca, ocultarEfetivados]);

  // Contagens sobre a lista cheia (não sobre o resultado filtrado), como nos cards de Funcionários.
  // Efetivado sai do banner de "acima de 270 dias" (relógio parou); os totais por modalidade seguem contando a lista cheia.
  const totalMot = useMemo(() => linhasIniciais.filter((l) => !ehTerceirizacao(l.tipoServico)).length, [linhasIniciais]);
  const totalTerc = useMemo(() => linhasIniciais.filter((l) => ehTerceirizacao(l.tipoServico)).length, [linhasIniciais]);
  const totalEfetivados = useMemo(() => linhasIniciais.filter((l) => l.efetivadoEm).length, [linhasIniciais]);
  const excedidoMot = useMemo(() => linhasIniciais.filter((l) => !l.efetivadoEm && l.faixa === "limite_excedido" && !ehTerceirizacao(l.tipoServico)).length, [linhasIniciais]);
  const excedidoTerc = useMemo(() => linhasIniciais.filter((l) => !l.efetivadoEm && l.faixa === "limite_excedido" && ehTerceirizacao(l.tipoServico)).length, [linhasIniciais]);
  const totalExcedido = excedidoMot + excedidoTerc;

  // Barra de rolagem horizontal FLUTUANTE (fixa no rodapé da tela, visível já na primeira tela): mesma peça do Banco de Candidatos e do
  // Kanban. A tabela é larga (colunas de vencimento) e a barra nativa dela só aparece no fim da lista.
  const { scrollRef, floatScrollRef, floatBar, handleScroll, handleFloatScroll } = useScrollHorizontalSincronizado();
  // Filtrar/ordenar muda a largura/altura da tabela: remede a barra.
  useEffect(() => { handleScroll(); }, [handleScroll, filtradas]);

  function abrirEfetivar(l: VencimentoContratoRow) {
    setAlvoEfetivar(l);
    setDataEfetivacao(hojeLocalISO());
    setObsEfetivacao("");
    setErroEfetivacao("");
  }

  async function confirmarEfetivacao() {
    if (!alvoEfetivar || salvando) return;
    setSalvando(true);
    setErroEfetivacao("");
    try {
      const res = await fetch(`/api/funcionarios/${alvoEfetivar.id}/efetivacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_efetivacao: dataEfetivacao, observacao: obsEfetivacao.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroEfetivacao(json.error ?? "Não foi possível efetivar. Tente novamente.");
        return;
      }
      const id = alvoEfetivar.id;
      setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, efetivadoEm: json.data?.efetivado_em ?? dataEfetivacao } : l)));
      setAlvoEfetivar(null);
      router.refresh();
    } catch {
      setErroEfetivacao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function desfazerEfetivacao(l: VencimentoContratoRow) {
    if (!window.confirm(`Desfazer a efetivação de ${l.nomeCompleto}? Ele volta a aparecer nos alertas de vencimento.`)) return;
    try {
      const res = await fetch(`/api/funcionarios/${l.id}/efetivacao`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error ?? "Não foi possível desfazer a efetivação. Tente novamente.");
        return;
      }
      setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, efetivadoEm: null } : x)));
      router.refresh();
    } catch {
      window.alert("Falha de conexão. Tente novamente.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vencimento de Contrato</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            Funcionários MOT e de Terceirização (fase temporária) ativos — prazos de 90, 180 e 270 dias contados da data de admissão (Lei 6.019/74)
          </p>
        </div>
        {totalExcedido > 0 && (
          <div
            style={{
              background: "#FEE2E2",
              color: "#991B1B",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 8,
            }}
          >
            ⚠ {totalExcedido} contrato{totalExcedido > 1 ? "s" : ""} acima de 270 dias
            {excedidoTerc > 0 && excedidoMot > 0 && <span style={{ fontWeight: 600 }}> (MOT: {excedidoMot} · Terceirização: {excedidoTerc})</span>}
          </div>
        )}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="input-field"
          style={{ maxWidth: 240 }}
        />
        <select value={filtroModalidade} onChange={(e) => setFiltroModalidade(e.target.value as typeof filtroModalidade)} className="input-field" style={{ maxWidth: 240 }} aria-label="Modalidade">
          <option value="">Todas as modalidades ({linhasIniciais.length})</option>
          <option value="mao_obra_temporaria">MOT ({totalMot})</option>
          <option value="terceirizacao">Terceirização ({totalTerc})</option>
        </select>
        <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)} className="input-field" style={{ maxWidth: 260 }}>
          <option value="">Todas as empresas</option>
          {clientesFiltro.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600" style={{ whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={ocultarEfetivados} onChange={(e) => setOcultarEfetivados(e.target.checked)} />
          Ocultar efetivados ({totalEfetivados})
        </label>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="card" style={{ padding: 0, overflowX: "auto" }}>
        {filtradas.length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
            Nenhum funcionário MOT ou de Terceirização ativo encontrado.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Funcionário</th>
                <th style={TH_STYLE}>Modalidade</th>
                <th style={TH_STYLE}>Empresa</th>
                <th style={TH_STYLE}>Data de Admissão</th>
                <th style={{ ...TH_STYLE, padding: 0 }} aria-sort={ordemDias === "nome" ? "none" : ordemDias === "desc" ? "descending" : "ascending"}>
                  <button
                    type="button"
                    onClick={() => setOrdemDias((o) => (o === "desc" ? "asc" : "desc"))}
                    title={ordemDias === "nome" ? "Clique para ordenar do maior para o menor" : ordemDias === "desc" ? "Do maior para o menor (clique para inverter)" : "Do menor para o maior (clique para inverter)"}
                    style={{ all: "unset", cursor: "pointer", display: "block", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}
                  >
                    Dias Trabalhados{ordemDias === "nome" ? "" : ordemDias === "desc" ? " ▼" : " ▲"}
                  </button>
                </th>
                <th style={TH_STYLE}>Situação</th>
                <th style={TH_STYLE}>Vencimento 90 dias</th>
                <th style={TH_STYLE}>Vencimento 180 dias</th>
                <th style={TH_STYLE}>Vencimento 270 dias</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={TD_STYLE}>
                    <Link href={`/painel/funcionarios/${l.id}`} style={{ color: "#111827", fontWeight: 700, textDecoration: "underline", textDecorationThickness: 1 }}>
                      {l.nomeCompleto}
                    </Link>
                  </td>
                  <td style={TD_STYLE}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: SELO_MODALIDADE[rotuloModalidadeContrato(l.tipoServico)].bg, color: SELO_MODALIDADE[rotuloModalidadeContrato(l.tipoServico)].text, border: `1px solid ${SELO_MODALIDADE[rotuloModalidadeContrato(l.tipoServico)].borda}`, whiteSpace: "nowrap" }}>
                      {rotuloModalidadeContrato(l.tipoServico)}
                    </span>
                  </td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{l.empresa}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.dataAdmissao)}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{l.diasTrabalhados}</td>
                  <td style={TD_STYLE}>
                    {l.efetivadoEm ? (
                      <>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: SELO_EFETIVADO.bg, color: SELO_EFETIVADO.text, whiteSpace: "nowrap" }}>
                          Efetivado em {formatarDataSemFuso(l.efetivadoEm)}
                        </span>
                        <button type="button" onClick={() => desfazerEfetivacao(l)} style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>
                          Desfazer
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: l.bg,
                            color: l.text,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {l.label}
                        </span>
                        <button type="button" onClick={() => abrirEfetivar(l)} style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#166534", border: "1px solid #86EFAC", background: "#F0FDF4", borderRadius: 6, padding: "1px 8px", cursor: "pointer" }}>
                          Efetivar
                        </button>
                      </>
                    )}
                    {l.selos?.map((s) => (
                      <span
                        key={s.texto}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: s.bg,
                          color: s.text,
                          whiteSpace: "nowrap",
                          marginLeft: 6,
                        }}
                      >
                        {s.texto}
                      </span>
                    ))}
                  </td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.vencimento90)}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.vencimento180)}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.vencimento270)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {alvoEfetivar && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          {...fundoDeFormulario()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Efetivar funcionário">
            <h2 className="text-lg font-bold text-gray-900">Efetivar funcionário</h2>
            <p className="text-sm text-gray-500 mb-4">{alvoEfetivar.nomeCompleto} — {alvoEfetivar.empresa}</p>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="data-efetivacao">Data da efetivação</label>
            <input
              id="data-efetivacao"
              type="date"
              className="input-field mb-3"
              value={dataEfetivacao}
              min={alvoEfetivar.dataAdmissao}
              max={hojeLocalISO()}
              onChange={(e) => setDataEfetivacao(e.target.value)}
            />
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="obs-efetivacao">Observação (opcional)</label>
            <textarea id="obs-efetivacao" className="input-field mb-3" rows={3} maxLength={2000} value={obsEfetivacao} onChange={(e) => setObsEfetivacao(e.target.value)} />
            <p className="text-xs text-gray-500 mb-3">Isso remove o funcionário dos alertas de vencimento. Pode ser desfeito.</p>
            {erroEfetivacao && <p className="text-sm mb-3" style={{ color: "#B91C1C" }} role="alert">{erroEfetivacao}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={salvando} onClick={() => setAlvoEfetivar(null)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={salvando || !dataEfetivacao} onClick={confirmarEfetivacao}>
                {salvando ? "Efetivando..." : "Confirmar efetivação"}
              </button>
            </div>
          </div>
        </div>
      )}
      <BarraScrollFlutuante floatBar={floatBar} floatScrollRef={floatScrollRef} onScroll={handleFloatScroll} />
    </div>
  );
}
