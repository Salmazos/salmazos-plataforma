"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarDataSemFuso } from "@/lib/utils";

interface ClienteOption {
  id: string;
  nome: string;
}

interface FechamentoRow {
  id: string;
  cliente_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  status: string;
  criado_em: string;
  clientes: { nome: string } | null;
  pendencias: { vinculosPendentes: number; diasSemJustificativa: number };
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  rascunho: { label: "Rascunho", bg: "#FEF3C7", text: "#92400E" },
  aguardando_aprovacao_cliente: { label: "Aguardando cliente", bg: "#DBEAFE", text: "#1D4ED8" },
  aprovado_cliente: { label: "Aprovado pelo cliente", bg: "#D1FAE5", text: "#166534" },
  enviado_contabilidade: { label: "Enviado à contabilidade", bg: "#E5E7EB", text: "#374151" },
};

interface Props {
  clientes: ClienteOption[];
}

export default function PontoPageClient({ clientes }: Props) {
  const router = useRouter();
  const [fechamentos, setFechamentos] = useState<FechamentoRow[] | null>(null);
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  const [clienteUpload, setClienteUpload] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{
    funcionariosImportados: number;
    vinculadosAutomaticamente: number;
    pendentesVinculo: number;
    fechamentoId: string;
  } | null>(null);

  const carregar = async () => {
    const params = new URLSearchParams();
    if (filtroClienteId) params.set("cliente_id", filtroClienteId);
    const res = await fetch(`/api/ponto/fechamentos?${params.toString()}`);
    const json = await res.json();
    setFechamentos(json.data ?? []);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroClienteId]);

  const handleUpload = async () => {
    if (!clienteUpload || !arquivo) {
      setErro("Selecione o cliente e o arquivo.");
      return;
    }
    setEnviando(true);
    setErro("");
    setResultado(null);
    try {
      const formData = new FormData();
      formData.append("cliente_id", clienteUpload);
      formData.append("file", arquivo);
      const res = await fetch("/api/ponto/fechamentos", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao importar arquivo.");
      setResultado(json);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const fecharModal = () => {
    setModalAberto(false);
    setClienteUpload("");
    setArquivo(null);
    setErro("");
    setResultado(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Espelho de Ponto</h1>
          <p className="text-sm text-gray-500 mt-1">
            Importe o export do EzePoint por cliente, revise e justifique os apontamentos fora do padrão.
          </p>
        </div>
        <button onClick={() => setModalAberto(true)} className="btn-primary">
          + Importar espelho de ponto
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)} className="input-field" style={{ maxWidth: 280 }}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {fechamentos === null ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>Carregando...</p>
        ) : fechamentos.length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>Nenhum fechamento importado ainda.</p>
        ) : (
          fechamentos.map((f, i) => {
            const badge = STATUS_BADGE[f.status] ?? { label: f.status, bg: "#F3F4F6", text: "#374151" };
            const temPendencia = f.pendencias.vinculosPendentes > 0 || f.pendencias.diasSemJustificativa > 0;
            return (
              <Link
                key={f.id}
                href={`/painel/ponto/${f.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom: i < fechamentos.length - 1 ? "1px solid #F3F4F6" : "none",
                  textDecoration: "none",
                }}
              >
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{f.clientes?.nome ?? "—"}</p>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>
                    {formatarDataSemFuso(f.periodo_inicio)} a {formatarDataSemFuso(f.periodo_fim)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {temPendencia && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B" }}>
                      {f.pendencias.vinculosPendentes > 0 && `${f.pendencias.vinculosPendentes} sem vínculo`}
                      {f.pendencias.vinculosPendentes > 0 && f.pendencias.diasSemJustificativa > 0 && " · "}
                      {f.pendencias.diasSemJustificativa > 0 && `${f.pendencias.diasSemJustificativa} sem justificativa`}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: badge.bg, color: badge.text }}>
                    {badge.label}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="card" style={{ width: 460, maxWidth: "90vw" }}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Importar espelho de ponto</h2>

            {resultado ? (
              <div>
                <p style={{ fontSize: 14, color: "#111827", marginBottom: 8 }}>
                  Importado: {resultado.funcionariosImportados} funcionário(s).
                </p>
                <p style={{ fontSize: 13, color: "#166534", marginBottom: 4 }}>
                  {resultado.vinculadosAutomaticamente} vinculado(s) automaticamente por nome.
                </p>
                {resultado.pendentesVinculo > 0 && (
                  <p style={{ fontSize: 13, color: "#92400E", marginBottom: 12 }}>
                    {resultado.pendentesVinculo} sem vínculo automático — resolva na tela do fechamento.
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      const id = resultado.fechamentoId;
                      fecharModal();
                      router.push(`/painel/ponto/${id}`);
                    }}
                    className="btn-primary"
                  >
                    Abrir fechamento
                  </button>
                  <button onClick={fecharModal} className="btn-outline">Fechar</button>
                </div>
              </div>
            ) : (
              <>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Cliente</label>
                <select value={clienteUpload} onChange={(e) => setClienteUpload(e.target.value)} className="input-field mb-3" style={{ width: "100%" }}>
                  <option value="">Selecione...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>

                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>
                  Arquivo (.xlsx exportado do EzePoint, já filtrado por este cliente)
                </label>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                  className="mb-3"
                />

                {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

                <div className="flex gap-2 mt-4">
                  <button onClick={handleUpload} disabled={enviando} className="btn-primary">
                    {enviando ? "Importando..." : "Importar"}
                  </button>
                  <button onClick={fecharModal} disabled={enviando} className="btn-outline">Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
