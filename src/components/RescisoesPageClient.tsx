"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatarDataSemFuso } from "@/lib/utils";
import ModalEditarRescisao from "./ModalEditarRescisao";

export interface RescisaoRow {
  id: string;
  funcionario_id: string;
  empresa: string;
  data_desligamento: string;
  modalidade: string;
  entrevista_desligamento: boolean;
  funcionario_assinou: boolean;
  valor_rescisao: number;
  data_pagamento_rescisao: string;
  valor_guia: number | null;
  data_pagamento_guia: string | null;
  pensao: number | null;
  farmacia: number | null;
  faturado: boolean;
  aso_documento_path: string | null;
  criado_em: string;
  funcionarios: { nome_completo: string; cargo: string | null } | null;
}

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  rescisoesIniciais: RescisaoRow[];
  clientes: ClienteOption[];
  isFullAccess: boolean;
}

const MODALIDADE_LABEL: Record<string, string> = {
  pedido_demissao: "Pedido de demissão",
  desligamento_pela_empresa: "Desligamento pela empresa",
  efetivado: "Efetivado",
};

function moeda(v: number | null): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

export default function RescisoesPageClient({ rescisoesIniciais, clientes, isFullAccess }: Props) {
  const searchParams = useSearchParams();
  const rescisaoFocoId = searchParams.get("rescisao");
  const linhaRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const [rescisoes, setRescisoes] = useState(rescisoesIniciais);
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroFaturado, setFiltroFaturado] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [rescisaoEditando, setRescisaoEditando] = useState<RescisaoRow | null>(null);
  const [alterandoFaturadoId, setAlterandoFaturadoId] = useState<string | null>(null);

  // Deep-link do sino/popup/e-mail: limpa os filtros (que poderiam esconder a linha) e
  // rola até a rescisão referenciada assim que a lista estiver na tela.
  useEffect(() => {
    if (!rescisaoFocoId) return;
    setFiltroEmpresa("");
    setFiltroFaturado("todos");
    setDataInicio("");
    setDataFim("");
  }, [rescisaoFocoId]);

  useEffect(() => {
    if (!rescisaoFocoId) return;
    const el = linhaRefs.current[rescisaoFocoId];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [rescisaoFocoId, rescisoes]);

  const filtradas = useMemo(() => {
    return rescisoes.filter((r) => {
      if (filtroEmpresa && r.empresa !== filtroEmpresa) return false;
      if (filtroFaturado === "sim" && !r.faturado) return false;
      if (filtroFaturado === "nao" && r.faturado) return false;
      if (dataInicio && r.data_desligamento < dataInicio) return false;
      if (dataFim && r.data_desligamento > dataFim) return false;
      return true;
    });
  }, [rescisoes, filtroEmpresa, filtroFaturado, dataInicio, dataFim]);

  const handleVerAso = async (e: React.MouseEvent, rescisaoId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/rescisoes/${rescisaoId}/aso-url`);
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Erro ao abrir o ASO."); return; }
      window.open(json.signedUrl, "_blank");
    } catch {
      alert("Erro de conexão ao abrir o ASO.");
    }
  };

  const handleToggleFaturado = async (e: React.MouseEvent, r: RescisaoRow) => {
    e.stopPropagation();
    if (alterandoFaturadoId) return;
    setAlterandoFaturadoId(r.id);
    try {
      const res = await fetch(`/api/rescisoes/${r.id}/faturado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faturado: !r.faturado }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Erro ao atualizar faturamento."); return; }
      setRescisoes((prev) => prev.map((row) => (row.id === json.data.id ? json.data : row)));
    } catch {
      alert("Erro de conexão. Tente novamente.");
    } finally {
      setAlterandoFaturadoId(null);
    }
  };

  const handleAtualizada = (atualizada: RescisaoRow) => {
    setRescisoes((prev) => prev.map((r) => (r.id === atualizada.id ? atualizada : r)));
    setRescisaoEditando(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Rescisões</h1>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="input-field" style={{ maxWidth: 260 }}>
          <option value="">Todas as empresas</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.nome}>{c.nome}</option>
          ))}
        </select>
        <select value={filtroFaturado} onChange={(e) => setFiltroFaturado(e.target.value)} className="input-field" style={{ maxWidth: 180 }}>
          <option value="todos">Todos (faturado)</option>
          <option value="sim">Faturado</option>
          <option value="nao">Não faturado</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">De</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="input-field" style={{ maxWidth: 160 }} />
          <label className="text-xs text-gray-500">até</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="input-field" style={{ maxWidth: 160 }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
              {["Funcionário", "Empresa", "Data desligamento", "Modalidade", "Valor rescisão", "Data Pag. Rescisão", "Data Pag. Guia", "Faturado", "ASO"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhuma rescisão encontrada.
                </td>
              </tr>
            ) : (
              filtradas.map((r) => (
                <tr
                  key={r.id}
                  ref={(el) => { linhaRefs.current[r.id] = el; }}
                  onClick={() => setRescisaoEditando(r)}
                  style={{
                    borderBottom: "1px solid #F3F4F6",
                    background: r.id === rescisaoFocoId ? "#FFFBEB" : undefined,
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{r.funcionarios?.nome_completo ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#374151" }}>{r.empresa}</td>
                  <td style={{ padding: "10px 12px", color: "#6B7280" }}>{formatarDataSemFuso(r.data_desligamento)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8" }}>
                      {MODALIDADE_LABEL[r.modalidade] ?? r.modalidade}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#374151" }}>{moeda(r.valor_rescisao)}</td>
                  <td style={{ padding: "10px 12px", color: "#6B7280" }}>{r.data_pagamento_rescisao ? formatarDataSemFuso(r.data_pagamento_rescisao) : "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#6B7280" }}>{r.data_pagamento_guia ? formatarDataSemFuso(r.data_pagamento_guia) : "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      onClick={(e) => handleToggleFaturado(e, r)}
                      disabled={alterandoFaturadoId === r.id}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: r.faturado ? "#D1FAE5" : "#F3F4F6", color: r.faturado ? "#166534" : "#374151",
                        border: "none", cursor: "pointer", opacity: alterandoFaturadoId === r.id ? 0.5 : 1,
                      }}
                      title="Clique para alternar"
                    >
                      {r.faturado ? "Faturado" : "Pendente"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.aso_documento_path ? (
                      <button onClick={(e) => handleVerAso(e, r.id)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                        Ver ASO
                      </button>
                    ) : (
                      <span style={{ color: "#9CA3AF", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rescisaoEditando && (
        <ModalEditarRescisao
          rescisao={rescisaoEditando}
          onClose={() => setRescisaoEditando(null)}
          onAtualizada={handleAtualizada}
          isFullAccess={isFullAccess}
        />
      )}
    </div>
  );
}
