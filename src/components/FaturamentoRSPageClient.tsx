"use client";

import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import ModalRevisaoCobrancaRS from "./ModalRevisaoCobrancaRS";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export interface CobrancaFaturamentoRow {
  id: string;
  cliente_nome_snapshot: string;
  candidato_nome_snapshot: string | null;
  tipo: "contratacao" | "cancelamento";
  fee_valor: number | null;
  pago_em: string;
}

export interface AjusteFaturamentoRow {
  id: string;
  valor: number;
  descricao: string;
  criado_por: string | null;
  criado_em: string;
  criadoPorNome: string | null;
}

export interface ImpostoMensal {
  ano: number;
  mes: number;
  percentual: number;
  atualizado_em: string;
}

export interface DadosMesFaturamento {
  cobrancas: CobrancaFaturamentoRow[];
  ajustes: AjusteFaturamentoRow[];
  receitaBrutaCobrancas: number;
  receitaBrutaAjustes: number;
  receitaBrutaTotal: number;
  imposto: ImpostoMensal | null;
}

interface HistoricoItem {
  ano: number;
  mes: number;
  receitaBrutaTotal: number;
  percentualImposto: number | null;
  receitaLiquida: number | null;
}

interface Props {
  anoInicial: number;
  mesInicial: number;
  dadosIniciais: DadosMesFaturamento;
}

const TIPO_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  contratacao: { label: "Contratação", bg: "#EDE9FE", color: "#5B21B6" },
  cancelamento: { label: "Cancelamento", bg: "#FEE2E2", color: "#991B1B" },
};

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarMoedaComSinal(valor: number): string {
  const formatado = formatarMoeda(Math.abs(valor));
  return valor < 0 ? `-${formatado}` : `+${formatado}`;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function FaturamentoRSPageClient({ anoInicial, mesInicial, dadosIniciais }: Props) {
  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState(mesInicial);
  const [dados, setDados] = useState(dadosIniciais);
  const [percentualInput, setPercentualInput] = useState(dadosIniciais.imposto?.percentual?.toString() ?? "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvandoImposto, setSalvandoImposto] = useState(false);
  const [impostoSalvo, setImpostoSalvo] = useState(false);
  const [cobrancaAbertaId, setCobrancaAbertaId] = useState<string | null>(null);

  const [novoValor, setNovoValor] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);
  const [erroAjuste, setErroAjuste] = useState("");

  const [aba, setAba] = useState<"mes" | "historico">("mes");
  const [historico, setHistorico] = useState<HistoricoItem[] | null>(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState("");

  const carregarMes = async (novoAno: number, novoMes: number) => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/faturamento-rs?ano=${novoAno}&mes=${novoMes}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao carregar faturamento do mês."); return; }
      setDados(json);
      setPercentualInput(json.imposto?.percentual?.toString() ?? "");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  const handleMesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value; // "YYYY-MM"
    if (!valor) return;
    const [novoAnoStr, novoMesStr] = valor.split("-");
    const novoAno = Number(novoAnoStr);
    const novoMes = Number(novoMesStr);
    setAno(novoAno);
    setMes(novoMes);
    carregarMes(novoAno, novoMes);
  };

  const handleSalvarImposto = async () => {
    const percentual = Number(percentualInput.replace(",", "."));
    if (percentualInput.trim() === "" || isNaN(percentual) || percentual < 0 || percentual > 100) {
      setErro("Informe um percentual válido entre 0 e 100.");
      return;
    }
    setSalvandoImposto(true);
    setErro("");
    setImpostoSalvo(false);
    try {
      const res = await fetch("/api/faturamento-rs/imposto", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes, percentual }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar imposto."); return; }
      setDados((prev) => ({ ...prev, imposto: json.data }));
      setImpostoSalvo(true);
      setTimeout(() => setImpostoSalvo(false), 2500);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvandoImposto(false);
    }
  };

  const handleAdicionarAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Number(novoValor.replace(",", "."));
    if (novoValor.trim() === "" || isNaN(valor) || valor === 0) {
      setErroAjuste("Informe um valor diferente de zero (positivo ou negativo).");
      return;
    }
    if (!novaDescricao.trim()) {
      setErroAjuste("Descrição é obrigatória.");
      return;
    }
    setSalvandoAjuste(true);
    setErroAjuste("");
    try {
      const res = await fetch("/api/faturamento-rs/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes, valor, descricao: novaDescricao.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setErroAjuste(json.error || "Erro ao salvar ajuste."); return; }
      setNovoValor("");
      setNovaDescricao("");
      await carregarMes(ano, mes);
    } catch {
      setErroAjuste("Erro de conexão. Tente novamente.");
    } finally {
      setSalvandoAjuste(false);
    }
  };

  const carregarHistorico = async () => {
    if (historico !== null) return;
    setCarregandoHistorico(true);
    setErroHistorico("");
    try {
      const res = await fetch("/api/faturamento-rs/historico?meses=12");
      const json = await res.json();
      if (!res.ok) { setErroHistorico(json.error || "Erro ao carregar histórico."); return; }
      setHistorico(json.data ?? []);
    } catch {
      setErroHistorico("Erro de conexão. Tente novamente.");
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const handleAbaHistorico = () => {
    setAba("historico");
    carregarHistorico();
  };

  const receitaLiquida =
    dados.imposto != null ? dados.receitaBrutaTotal - (dados.receitaBrutaTotal * dados.imposto.percentual) / 100 : null;

  const chartData = historico
    ? {
        labels: historico.map((h) => `${MESES_ABREV[h.mes - 1]}/${String(h.ano).slice(2)}`),
        datasets: [
          {
            label: "Bruto Total",
            data: historico.map((h) => h.receitaBrutaTotal),
            backgroundColor: "#22c55e",
            borderRadius: 4,
          },
          {
            label: "Líquido",
            data: historico.map((h) => h.receitaLiquida),
            backgroundColor: "#3b82f6",
            borderRadius: 4,
          },
        ],
      }
    : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "top" as const },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.y != null ? formatarMoeda(ctx.parsed.y) : "sem imposto informado"}`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true },
    },
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento R&S</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Receita real (cobranças já pagas + ajustes manuais) por mês, com imposto informado manualmente.
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b-2 border-gray-100 mb-5">
        {(
          [
            { id: "mes" as const, label: "Mês" },
            { id: "historico" as const, label: "Histórico (12 meses)" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => (t.id === "historico" ? handleAbaHistorico() : setAba("mes"))}
            style={{
              padding: "10px 18px", fontWeight: aba === t.id ? 700 : 500, fontSize: 14,
              color: aba === t.id ? "#111827" : "#6B7280", background: "none", border: "none",
              borderBottom: aba === t.id ? "2px solid #FFB800" : "2px solid transparent", marginBottom: -2, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === "mes" ? (
        <>
          <div className="mb-5 flex justify-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mês</label>
              <input type="month" value={`${ano}-${pad2(mes)}`} onChange={handleMesChange} className="input-field" />
            </div>
          </div>

          {erro && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div style={{ background: "#D1FAE5", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#166534", margin: 0 }}>{formatarMoeda(dados.receitaBrutaCobrancas)}</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "2px 0 0" }}>Receita bruta (cobranças)</p>
            </div>

            <div style={{ background: dados.receitaBrutaAjustes >= 0 ? "#ECFDF5" : "#FEF2F2", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: dados.receitaBrutaAjustes >= 0 ? "#047857" : "#B91C1C", margin: 0 }}>
                {formatarMoedaComSinal(dados.receitaBrutaAjustes)}
              </p>
              <p style={{ fontSize: 12, fontWeight: 600, color: dados.receitaBrutaAjustes >= 0 ? "#047857" : "#B91C1C", margin: "2px 0 0" }}>
                Ajustes do mês ({dados.ajustes.length})
              </p>
            </div>

            <div style={{ background: "#D1FAE5", border: "2px solid #166534", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#166534", margin: 0 }}>{formatarMoeda(dados.receitaBrutaTotal)}</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "2px 0 0" }}>Receita bruta total</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div style={{ background: "#F3F4F6", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>Imposto do mês (%)</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={percentualInput}
                  onChange={(e) => setPercentualInput(e.target.value)}
                  placeholder="Ex: 6,5"
                  className="input-field"
                  style={{ maxWidth: 100 }}
                />
                <button
                  onClick={handleSalvarImposto}
                  disabled={salvandoImposto}
                  className="btn-outline disabled:opacity-50"
                  style={{ whiteSpace: "nowrap", padding: "6px 12px", fontSize: 12 }}
                >
                  {salvandoImposto ? "Salvando..." : "Salvar"}
                </button>
              </div>
              {impostoSalvo && <p className="text-green-700 text-xs mt-1">Imposto salvo!</p>}
            </div>

            {receitaLiquida != null ? (
              <div style={{ background: "#DBEAFE", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#1D4ED8", margin: 0 }}>{formatarMoeda(receitaLiquida)}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8", margin: "2px 0 0" }}>Receita líquida do mês ({dados.imposto!.percentual}% de imposto)</p>
              </div>
            ) : (
              <div style={{ background: "#FEF3C7", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>
                  ⚠ Informe o imposto do mês para calcular o líquido.
                </p>
              </div>
            )}
          </div>

          <div className="card mb-6">
            <p className="section-title mb-3">Ajustes manuais do mês</p>

            {dados.ajustes.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">Nenhum ajuste lançado nesse mês.</p>
            ) : (
              <div style={{ overflowX: "auto" }} className="mb-4">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                      {["Valor", "Descrição", "Lançado por", "Quando"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.ajustes.map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: a.valor >= 0 ? "#166534" : "#991B1B" }}>
                          {formatarMoedaComSinal(a.valor)}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#374151" }}>{a.descricao}</td>
                        <td style={{ padding: "8px 12px", color: "#374151" }}>{a.criadoPorNome ?? "—"}</td>
                        <td style={{ padding: "8px 12px", color: "#6B7280" }}>{formatarDataHora(a.criado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form onSubmit={handleAdicionarAjuste} className="flex gap-2 items-end flex-wrap">
              <div style={{ flex: "1 1 140px" }}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor (com sinal)</label>
                <input type="text" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="Ex: -250,00" className="input-field" required />
              </div>
              <div style={{ flex: "2 1 260px" }}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição / motivo</label>
                <input type="text" value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="Ex: Correção de fee lançado a menor em X" className="input-field" required />
              </div>
              <button type="submit" disabled={salvandoAjuste} className="btn-primary disabled:opacity-50">
                {salvandoAjuste ? "Salvando..." : "Adicionar ajuste"}
              </button>
            </form>
            {erroAjuste && <p className="text-red-600 text-sm mt-2">{erroAjuste}</p>}
            <p className="text-xs text-gray-400 mt-2">Ajustes são permanentes — pra corrigir um lançamento errado, adicione um novo ajuste de sinal oposto.</p>
          </div>

          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  {["Cliente", "Candidato", "Tipo", "Valor", "Pago em"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "24px 12px", textAlign: "center", color: "#9CA3AF" }}>
                      Carregando...
                    </td>
                  </tr>
                ) : dados.cobrancas.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "24px 12px", textAlign: "center", color: "#9CA3AF" }}>
                      Nenhuma cobrança paga nesse mês.
                    </td>
                  </tr>
                ) : (
                  dados.cobrancas.map((c) => {
                    const tipoInfo = TIPO_LABEL[c.tipo] ?? TIPO_LABEL.contratacao;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setCobrancaAbertaId(c.id)}
                        style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
                      >
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{c.cliente_nome_snapshot}</td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{c.candidato_nome_snapshot ?? "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: tipoInfo.bg, color: tipoInfo.color }}>
                            {tipoInfo.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{formatarMoeda(c.fee_valor ?? 0)}</td>
                        <td style={{ padding: "10px 12px", color: "#6B7280" }}>{formatarData(c.pago_em)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card">
          <p className="section-title mb-4">Bruto Total x Líquido — últimos 12 meses</p>
          {erroHistorico && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erroHistorico}</p>}
          {carregandoHistorico || !chartData ? (
            <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
          ) : (
            <div style={{ height: 360 }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          )}
        </div>
      )}

      {cobrancaAbertaId && (
        <ModalRevisaoCobrancaRS
          cobrancaId={cobrancaAbertaId}
          onClose={() => setCobrancaAbertaId(null)}
          onAtualizada={() => setCobrancaAbertaId(null)}
        />
      )}
    </div>
  );
}
