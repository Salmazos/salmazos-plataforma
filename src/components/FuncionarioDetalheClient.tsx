"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarDataSemFuso } from "@/lib/utils";
import { calcularStatusAso, ASO_STATUS_INFO } from "@/lib/asoStatus";
import { TIPOS_SERVICO } from "@/lib/constants";
import ModalRegistrarAso from "./ModalRegistrarAso";
import ModalRegistrarContrato from "./ModalRegistrarContrato";

export interface FuncionarioDetalhe {
  id: string;
  admissao_id: string | null;
  cliente_id: string | null;
  nome_completo: string;
  cargo: string | null;
  empresa: string | null;
  data_admissao: string | null;
  tipo_servico: string | null;
  status: string;
  criado_em: string;
  clientes: { nome: string } | null;
}

export interface AsoRow {
  id: string;
  data_exame: string;
  arquivo_path: string | null;
  criado_em: string;
  criado_por_nome: string | null;
}

export interface ContratoRow {
  id: string;
  arquivo_path: string;
  nome_arquivo_original: string | null;
  observacoes: string | null;
  criado_em: string;
  criado_por_nome: string | null;
}

interface Props {
  funcionario: FuncionarioDetalhe;
  asosIniciais: AsoRow[];
  contratosIniciais: ContratoRow[];
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ativo: { label: "Ativo", bg: "#D1FAE5", text: "#166534" },
  desligado: { label: "Desligado", bg: "#FEE2E2", text: "#991B1B" },
};

export default function FuncionarioDetalheClient({ funcionario, asosIniciais, contratosIniciais }: Props) {
  const router = useRouter();
  const [asos, setAsos] = useState(asosIniciais);
  const [modalAberto, setModalAberto] = useState(false);
  const [carregandoArquivoId, setCarregandoArquivoId] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState("");

  const [contratos, setContratos] = useState(contratosIniciais);
  const [modalContratoAberto, setModalContratoAberto] = useState(false);
  const [carregandoContratoId, setCarregandoContratoId] = useState<string | null>(null);
  const [erroArquivoContrato, setErroArquivoContrato] = useState("");

  const statusFuncionario = STATUS_BADGE[funcionario.status] ?? { label: funcionario.status, bg: "#F3F4F6", text: "#374151" };
  const tipoServicoLabel = TIPOS_SERVICO.find((t) => t.id === funcionario.tipo_servico)?.label ?? "—";
  const empresaNome = funcionario.clientes?.nome ?? funcionario.empresa ?? "—";

  const statusAso = useMemo(() => calcularStatusAso(asos[0]?.data_exame ?? null), [asos]);
  const badgeAso = ASO_STATUS_INFO[statusAso];

  const handleVerArquivo = async (asoId: string) => {
    setCarregandoArquivoId(asoId);
    setErroArquivo("");
    try {
      const res = await fetch(`/api/funcionarios/asos/${asoId}/arquivo-url`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao abrir arquivo.");
      window.open(json.signedUrl, "_blank");
    } catch (err) {
      setErroArquivo(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setCarregandoArquivoId(null);
    }
  };

  const contratoAtual = contratos[0] ?? null;
  const contratosAnteriores = contratos.slice(1);

  const handleVerArquivoContrato = async (contratoId: string) => {
    setCarregandoContratoId(contratoId);
    setErroArquivoContrato("");
    try {
      const res = await fetch(`/api/funcionarios/contratos/${contratoId}/arquivo-url`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao abrir arquivo.");
      window.open(json.signedUrl, "_blank");
    } catch (err) {
      setErroArquivoContrato(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setCarregandoContratoId(null);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <Link href="/painel/funcionarios" className="text-sm text-gray-500 hover:text-gray-700">
          ← Voltar para Funcionários
        </Link>
      </div>

      <div className="card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{funcionario.nome_completo}</h1>
            <p className="text-sm text-gray-500 mt-1">{empresaNome}</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: statusFuncionario.bg, color: statusFuncionario.text }}>
            {statusFuncionario.label}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ fontSize: 13 }}>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Cargo</p>
            <p className="text-gray-900">{funcionario.cargo ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Data de admissão</p>
            <p className="text-gray-900">{funcionario.data_admissao ? formatarDataSemFuso(funcionario.data_admissao) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tipo de serviço</p>
            <p className="text-gray-900">{tipoServicoLabel}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Origem</p>
            <p className="text-gray-900">{funcionario.admissao_id ? "Admissão digital" : "Cadastro manual"}</p>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-1">
          <p className="section-title mb-0">ASO Periódico</p>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: badgeAso.bg, color: badgeAso.text }}>
            {badgeAso.label}
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-4">Exame médico admissional/periódico — renovação a cada 12 meses.</p>

        <button onClick={() => setModalAberto(true)} className="btn-primary mb-4" style={{ fontSize: 13 }}>
          + Registrar novo exame
        </button>

        {erroArquivo && <p className="text-red-600 text-sm mb-3">{erroArquivo}</p>}

        {asos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum exame registrado ainda.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  {["Data do exame", "Registrado por", "Registrado em", "Arquivo"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {asos.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827" }}>{formatarDataSemFuso(a.data_exame)}</td>
                    <td style={{ padding: "8px 12px", color: "#374151" }}>{a.criado_por_nome ?? "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#6B7280" }}>{new Date(a.criado_em).toLocaleDateString("pt-BR")}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {a.arquivo_path ? (
                        <button
                          onClick={() => handleVerArquivo(a.id)}
                          disabled={carregandoArquivoId === a.id}
                          className="btn-outline"
                          style={{ padding: "3px 10px", fontSize: 12 }}
                        >
                          {carregandoArquivoId === a.id ? "Abrindo..." : "Ver arquivo"}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <p className="section-title mb-1">Contrato</p>
        <p className="text-xs text-gray-400 mb-4">Histórico de versões — sem vencimento.</p>

        <button onClick={() => setModalContratoAberto(true)} className="btn-primary mb-4" style={{ fontSize: 13 }}>
          + Registrar novo contrato
        </button>

        {erroArquivoContrato && <p className="text-red-600 text-sm mb-3">{erroArquivoContrato}</p>}

        {!contratoAtual ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum contrato registrado ainda.</p>
        ) : (
          <>
            <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", margin: 0 }}>Contrato atual</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "2px 0 0" }}>
                    {contratoAtual.nome_arquivo_original ?? "Arquivo sem nome"}
                  </p>
                  {contratoAtual.observacoes && (
                    <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>{contratoAtual.observacoes}</p>
                  )}
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
                    Registrado por {contratoAtual.criado_por_nome ?? "—"} em {new Date(contratoAtual.criado_em).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <button
                  onClick={() => handleVerArquivoContrato(contratoAtual.id)}
                  disabled={carregandoContratoId === contratoAtual.id}
                  className="btn-outline"
                  style={{ padding: "4px 12px", fontSize: 12, flexShrink: 0 }}
                >
                  {carregandoContratoId === contratoAtual.id ? "Abrindo..." : "Ver arquivo"}
                </button>
              </div>
            </div>

            {contratosAnteriores.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Versões anteriores</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                        {["Arquivo", "Observações", "Registrado por", "Registrado em", "Ações"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contratosAnteriores.map((c) => (
                        <tr key={c.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827" }}>{c.nome_arquivo_original ?? "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#374151" }}>{c.observacoes ?? "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#374151" }}>{c.criado_por_nome ?? "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#6B7280" }}>{new Date(c.criado_em).toLocaleDateString("pt-BR")}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <button
                              onClick={() => handleVerArquivoContrato(c.id)}
                              disabled={carregandoContratoId === c.id}
                              className="btn-outline"
                              style={{ padding: "3px 10px", fontSize: 12 }}
                            >
                              {carregandoContratoId === c.id ? "Abrindo..." : "Ver arquivo"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <ModalRegistrarAso
        isOpen={modalAberto}
        funcionarioId={funcionario.id}
        onClose={() => setModalAberto(false)}
        onRegistrado={(novoAso) => {
          setAsos((prev) => [novoAso, ...prev].sort((a, b) => (a.data_exame < b.data_exame ? 1 : -1)));
          setModalAberto(false);
          router.refresh();
        }}
      />

      <ModalRegistrarContrato
        isOpen={modalContratoAberto}
        funcionarioId={funcionario.id}
        onClose={() => setModalContratoAberto(false)}
        onRegistrado={(novoContrato) => {
          setContratos((prev) => [novoContrato, ...prev]);
          setModalContratoAberto(false);
          router.refresh();
        }}
      />
    </div>
  );
}
