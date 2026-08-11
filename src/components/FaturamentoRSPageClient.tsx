"use client";

import { useState } from "react";
import ModalRevisaoCobrancaRS from "./ModalRevisaoCobrancaRS";

export interface CobrancaFaturamentoRow {
  id: string;
  cliente_nome_snapshot: string;
  candidato_nome_snapshot: string | null;
  tipo: "contratacao" | "cancelamento";
  fee_valor: number | null;
  pago_em: string;
}

export interface ImpostoMensal {
  ano: number;
  mes: number;
  percentual: number;
  atualizado_em: string;
}

interface Props {
  anoInicial: number;
  mesInicial: number;
  cobrancasIniciais: CobrancaFaturamentoRow[];
  receitaBrutaInicial: number;
  impostoInicial: ImpostoMensal | null;
}

const TIPO_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  contratacao: { label: "Contratação", bg: "#EDE9FE", color: "#5B21B6" },
  cancelamento: { label: "Cancelamento", bg: "#FEE2E2", color: "#991B1B" },
};

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function FaturamentoRSPageClient({
  anoInicial,
  mesInicial,
  cobrancasIniciais,
  receitaBrutaInicial,
  impostoInicial,
}: Props) {
  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState(mesInicial);
  const [cobrancas, setCobrancas] = useState(cobrancasIniciais);
  const [receitaBruta, setReceitaBruta] = useState(receitaBrutaInicial);
  const [imposto, setImposto] = useState(impostoInicial);
  const [percentualInput, setPercentualInput] = useState(impostoInicial?.percentual?.toString() ?? "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvandoImposto, setSalvandoImposto] = useState(false);
  const [impostoSalvo, setImpostoSalvo] = useState(false);
  const [cobrancaAbertaId, setCobrancaAbertaId] = useState<string | null>(null);

  const carregarMes = async (novoAno: number, novoMes: number) => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/faturamento-rs?ano=${novoAno}&mes=${novoMes}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao carregar faturamento do mês."); return; }
      setCobrancas(json.cobrancas ?? []);
      setReceitaBruta(json.receitaBruta ?? 0);
      setImposto(json.imposto ?? null);
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
      setImposto(json.data);
      setImpostoSalvo(true);
      setTimeout(() => setImpostoSalvo(false), 2500);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvandoImposto(false);
    }
  };

  const receitaLiquida =
    imposto != null ? receitaBruta - (receitaBruta * imposto.percentual) / 100 : null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento R&S</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Receita real (cobranças já pagas) por mês, com imposto informado manualmente.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mês</label>
          <input
            type="month"
            value={`${ano}-${pad2(mes)}`}
            onChange={handleMesChange}
            className="input-field"
          />
        </div>
      </div>

      {erro && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div style={{ background: "#D1FAE5", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#166534", margin: 0 }}>{formatarMoeda(receitaBruta)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "2px 0 0" }}>Receita bruta do mês</p>
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

        {receitaLiquida != null ? (
          <div style={{ background: "#DBEAFE", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#1D4ED8", margin: 0 }}>{formatarMoeda(receitaLiquida)}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8", margin: "2px 0 0" }}>Receita líquida do mês ({imposto!.percentual}% de imposto)</p>
          </div>
        ) : (
          <div style={{ background: "#FEF3C7", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>
              ⚠ Informe o imposto do mês para calcular o líquido.
            </p>
          </div>
        )}
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
            ) : cobrancas.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhuma cobrança paga nesse mês.
                </td>
              </tr>
            ) : (
              cobrancas.map((c) => {
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
