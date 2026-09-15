"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ModalContaReceberHortolandia from "./ModalContaReceberHortolandia";

export interface ContaReceberRow {
  id: string;
  clienteId: string;
  clienteNome: string;
  numeroNf: string | null;
  valor: number;
  dataVencimento: string;
  dataPagamento: string | null;
  dataEmissaoNf: string | null;
  status: "pendente" | "pago" | "cancelado";
  observacoes: string | null;
}

interface Props {
  rowsIniciais: ContaReceberRow[];
  anoInicial: number;
  mesInicial: number;
  impostoInicial: number | null;
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  pendente: { label: "Pendente", bg: "#FEF3C7", color: "#92400E" },
  pago: { label: "Pago", bg: "#DCFCE7", color: "#166534" },
  cancelado: { label: "Cancelado", bg: "#F3F4F6", color: "#6B7280" },
  atrasado: { label: "Atrasado", bg: "#FEE2E2", color: "#991B1B" },
};

function formatarMoeda(v: number | null): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  // Datas vêm como "YYYY-MM-DD" (coluna DATE do Postgres, sem hora) — monta o Date local
  // direto pelos componentes pra não sofrer o típico bug de virar um dia pra trás por
  // fuso quando parseado como UTC meia-noite.
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR");
}

function diasParaVencimento(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const vencimento = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((vencimento.getTime() - hoje.getTime()) / 86_400_000);
}

function statusEfetivo(row: ContaReceberRow): string {
  if (row.status === "pendente" && diasParaVencimento(row.dataVencimento) < 0) return "atrasado";
  return row.status;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type FiltroTab = "pendente" | "pago" | "cancelado" | "todas";

export default function FaturamentoHortolandiaPageClient({
  rowsIniciais,
  anoInicial,
  mesInicial,
  impostoInicial,
}: Props) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(rowsIniciais);
  const [tab, setTab] = useState<FiltroTab>("pendente");
  const [contaAberta, setContaAberta] = useState<ContaReceberRow | null | "novo">(null);

  // Deep-link ?abrir={id} do popup de vencidas (PopupContaReceberHortolandiaVencida) —
  // mesmo padrão de CobrancasRSPageClient. Roda só uma vez de propósito (rows não entra
  // nas deps): rows só muda localmente após uma ação no modal, e essa mudança não deve
  // reabrir o modal sozinha.
  useEffect(() => {
    const abrirId = searchParams.get("abrir");
    if (!abrirId) return;
    const row = rows.find((r) => r.id === abrirId);
    if (row) {
      setContaAberta(row);
      setTab("todas");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState(mesInicial);
  const [percentualImposto, setPercentualImposto] = useState<number | null>(impostoInicial);
  const [percentualInput, setPercentualInput] = useState(impostoInicial?.toString() ?? "");
  const [salvandoImposto, setSalvandoImposto] = useState(false);
  const [impostoSalvo, setImpostoSalvo] = useState(false);
  const [erroImposto, setErroImposto] = useState("");

  const rowsFiltradas = useMemo(() => {
    if (tab === "todas") return rows;
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);

  const totalFiltrado = rowsFiltradas.reduce((soma, r) => soma + r.valor, 0);

  // Total do mês selecionado — pelo vencimento, independente de status/aba, pra bater com o
  // que a planilha manual do Olver já mostrava (ele mesmo apura o líquido informando o
  // imposto do mês, igual já funciona em Faturamento R&S).
  const chaveMes = `${ano}-${pad2(mes)}`;
  const totalMes = useMemo(
    () => rows.filter((r) => r.dataVencimento.startsWith(chaveMes)).reduce((soma, r) => soma + r.valor, 0),
    [rows, chaveMes]
  );
  const liquidoMes = percentualImposto != null ? totalMes - (totalMes * percentualImposto) / 100 : null;

  async function handleMesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value; // "YYYY-MM"
    if (!valor) return;
    const [novoAnoStr, novoMesStr] = valor.split("-");
    const novoAno = Number(novoAnoStr);
    const novoMes = Number(novoMesStr);
    setAno(novoAno);
    setMes(novoMes);
    setErroImposto("");
    try {
      const res = await fetch(`/api/faturamento-hortolandia/imposto?ano=${novoAno}&mes=${novoMes}`);
      const json = await res.json();
      setPercentualImposto(json.data?.percentual ?? null);
      setPercentualInput(json.data?.percentual?.toString() ?? "");
    } catch {
      setErroImposto("Erro ao carregar imposto do mês.");
    }
  }

  async function handleSalvarImposto() {
    const percentual = Number(percentualInput.replace(",", "."));
    if (percentualInput.trim() === "" || isNaN(percentual) || percentual < 0 || percentual > 100) {
      setErroImposto("Informe um percentual válido entre 0 e 100.");
      return;
    }
    setSalvandoImposto(true);
    setErroImposto("");
    setImpostoSalvo(false);
    try {
      const res = await fetch("/api/faturamento-hortolandia/imposto", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes, percentual }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroImposto(json.error || "Erro ao salvar imposto.");
        return;
      }
      setPercentualImposto(json.data.percentual);
      setImpostoSalvo(true);
      setTimeout(() => setImpostoSalvo(false), 2500);
    } catch {
      setErroImposto("Erro de conexão. Tente novamente.");
    } finally {
      setSalvandoImposto(false);
    }
  }

  function handleSalva(row: ContaReceberRow) {
    setRows((prev) => {
      const existe = prev.some((r) => r.id === row.id);
      return existe ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev];
    });
    setContaAberta(null);
  }

  function handleExcluida(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setContaAberta(null);
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento Hortolândia</h1>
          <p className="text-sm text-gray-500 mt-1">Contas a receber — controle manual da unidade Hortolândia.</p>
        </div>
        <button onClick={() => setContaAberta("novo")} className="btn-primary">
          + Novo lançamento
        </button>
      </div>

      <div className="mb-5 flex justify-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mês</label>
          <input type="month" value={chaveMes} onChange={handleMesChange} className="input-field" />
        </div>
      </div>

      {erroImposto && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erroImposto}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div style={{ background: "#D1FAE5", border: "2px solid #166534", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#166534", margin: 0 }}>{formatarMoeda(totalMes)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "2px 0 0" }}>
            Valor total do mês (por vencimento)
          </p>
        </div>

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
      </div>

      {liquidoMes != null ? (
        <div
          className="mb-6"
          style={{ background: "#DBEAFE", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}
        >
          <p style={{ fontSize: 22, fontWeight: 800, color: "#1D4ED8", margin: 0 }}>{formatarMoeda(liquidoMes)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8", margin: "2px 0 0" }}>
            Valor líquido do mês ({percentualImposto}% de imposto)
          </p>
        </div>
      ) : (
        <div
          className="mb-6"
          style={{ background: "#FEF3C7", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>
            ⚠ Informe o imposto do mês para calcular o líquido.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {(["pendente", "pago", "cancelado", "todas"] as FiltroTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-[#FFB800] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "pendente" ? "Pendentes" : t === "pago" ? "Pagos" : t === "cancelado" ? "Cancelados" : "Todas"}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 px-3">Vencimento</th>
              <th className="py-2 px-3">Cliente</th>
              <th className="py-2 px-3">Nº NF</th>
              <th className="py-2 px-3 text-right">Valor R$</th>
              <th className="py-2 px-3 text-center">Dias p/ venc.</th>
              <th className="py-2 px-3">Pagamento</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Emissão NF/Acordo</th>
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((row) => {
              const status = statusEfetivo(row);
              const s = STATUS_LABEL[status];
              const dias = diasParaVencimento(row.dataVencimento);
              return (
                <tr
                  key={row.id}
                  onClick={() => setContaAberta(row)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="py-2 px-3">{formatarData(row.dataVencimento)}</td>
                  <td className="py-2 px-3 font-medium text-gray-900">{row.clienteNome}</td>
                  <td className="py-2 px-3 text-gray-500">{row.numeroNf ?? "—"}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatarMoeda(row.valor)}</td>
                  <td className="py-2 px-3 text-center text-gray-500">
                    {row.status === "pendente" ? dias : "—"}
                  </td>
                  <td className="py-2 px-3">{formatarData(row.dataPagamento)}</td>
                  <td className="py-2 px-3">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: s.bg, color: s.color }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="py-2 px-3">{formatarData(row.dataEmissaoNf)}</td>
                </tr>
              );
            })}
            {rowsFiltradas.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  Nenhum lançamento nessa visão.
                </td>
              </tr>
            )}
          </tbody>
          {rowsFiltradas.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold text-gray-900">
                <td className="py-2 px-3" colSpan={3}>
                  Total ({rowsFiltradas.length})
                </td>
                <td className="py-2 px-3 text-right">{formatarMoeda(totalFiltrado)}</td>
                <td className="py-2 px-3" colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {contaAberta && (
        <ModalContaReceberHortolandia
          conta={contaAberta === "novo" ? null : contaAberta}
          onClose={() => setContaAberta(null)}
          onSalva={handleSalva}
          onExcluida={handleExcluida}
        />
      )}
    </div>
  );
}
