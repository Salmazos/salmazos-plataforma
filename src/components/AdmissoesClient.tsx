"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/utils";
import { ADMISSAO_STATUS_BADGE, MODALIDADE_LABEL } from "@/lib/admissaoStatus";
import { linkAdmissaoWhatsapp } from "@/lib/waLinks";
import ModalIniciarAdmissao from "./ModalIniciarAdmissao";

export interface AdmissaoRow {
  id: string;
  token: string;
  modalidade: string;
  status: string;
  criado_em: string;
  token_expira_em: string;
  candidatos: { id: string; nome_completo: string; cargo_pretendido: string; telefone: string | null } | null;
  vagas: { id: string; titulo: string } | null;
  docsEnviados: number;
  docsTotal: number;
}

interface Props {
  admissoesIniciais: AdmissaoRow[];
}

const CARDS_RESUMO: { status: string; label: string; bg: string; text: string }[] = [
  { status: "aguardando_candidato", label: "Aguardando candidato", bg: "#F3F4F6", text: "#374151" },
  { status: "aguardando_analise", label: "Aguardando análise", bg: "#FEF3C7", text: "#92400E" },
  { status: "em_analise", label: "Em análise", bg: "#FFEDD5", text: "#C2410C" },
  { status: "enviado_contabilidade", label: "Enviadas à contabilidade este mês", bg: "#D1FAE5", text: "#166534" },
];

export default function AdmissoesClient({ admissoesIniciais }: Props) {
  const router = useRouter();
  const [admissoes, setAdmissoes] = useState(admissoesIniciais);
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [toast, setToast] = useState("");
  const [gerandoFormularios, setGerandoFormularios] = useState(false);

  useEffect(() => setAdmissoes(admissoesIniciais), [admissoesIniciais]);

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const contagens = useMemo(() => {
    const c: Record<string, number> = {};
    for (const card of CARDS_RESUMO) {
      if (card.status === "enviado_contabilidade") {
        c[card.status] = admissoes.filter((a) => a.status === "enviado_contabilidade" && new Date(a.criado_em) >= inicioMes).length;
      } else {
        c[card.status] = admissoes.filter((a) => a.status === card.status).length;
      }
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissoes]);

  const filtradas = filtroStatus ? admissoes.filter((a) => a.status === filtroStatus) : admissoes;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleCopiarLink = (token: string) => {
    const url = `${window.location.origin}/admissao/${token}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link copiado!"));
  };

  const handleReenviarWhatsapp = (row: AdmissaoRow) => {
    if (!row.candidatos?.telefone) { showToast("Candidato sem telefone cadastrado."); return; }
    const url = `${window.location.origin}/admissao/${row.token}`;
    const wa = linkAdmissaoWhatsapp(row.candidatos.nome_completo, row.candidatos.telefone, row.candidatos.cargo_pretendido, url);
    window.open(wa, "_blank");
  };

  const handleImprimirFormularios = async () => {
    setGerandoFormularios(true);
    try {
      const res = await fetch("/api/admissoes/formularios-em-branco");
      if (!res.ok) { showToast("Erro ao gerar os formulários."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "formularios-admissao-em-branco.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast("Erro de conexão ao gerar os formulários.");
    } finally {
      setGerandoFormularios(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Admissões</h1>
        <div className="flex gap-2">
          <button onClick={handleImprimirFormularios} disabled={gerandoFormularios} className="btn-outline" style={{ opacity: gerandoFormularios ? 0.6 : 1 }}>
            {gerandoFormularios ? "Gerando..." : "🖨️ Imprimir formulário em branco"}
          </button>
          <button onClick={() => setModalAberto(true)} className="btn-primary">
            + Iniciar admissão
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {CARDS_RESUMO.map((card) => (
          <button
            key={card.status}
            onClick={() => setFiltroStatus(filtroStatus === card.status ? null : card.status)}
            style={{
              textAlign: "left",
              background: card.bg,
              border: filtroStatus === card.status ? `2px solid ${card.text}` : "2px solid transparent",
              borderRadius: 12,
              padding: "14px 16px",
              cursor: "pointer",
            }}
          >
            <p style={{ fontSize: 26, fontWeight: 800, color: card.text, margin: 0 }}>{contagens[card.status] ?? 0}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: card.text, margin: "2px 0 0" }}>{card.label}</p>
          </button>
        ))}
      </div>

      {filtroStatus && (
        <button onClick={() => setFiltroStatus(null)} className="text-xs text-gray-500 hover:text-black mb-3">
          ✕ Limpar filtro
        </button>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
              {["Candidato", "Vaga", "Modalidade", "Status", "Criado em", "Expira em", "Docs", "Ações"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhuma admissão encontrada.
                </td>
              </tr>
            ) : (
              filtradas.map((row) => {
                const badge = ADMISSAO_STATUS_BADGE[row.status] ?? { label: row.status, bg: "#F3F4F6", text: "#374151" };
                const expirado = row.status === "aguardando_candidato" && new Date(row.token_expira_em) < agora;
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{row.candidatos?.nome_completo ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{row.vagas?.titulo ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8" }}>
                        {MODALIDADE_LABEL[row.modalidade] ?? row.modalidade}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badge.bg, color: badge.text, whiteSpace: "nowrap" }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6B7280" }}>{formatarData(row.criado_em)}</td>
                    <td style={{ padding: "10px 12px", color: expirado ? "#DC2626" : "#6B7280", fontWeight: expirado ? 700 : 400 }}>
                      {expirado ? "Expirado" : formatarData(row.token_expira_em)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>
                      {row.docsEnviados}/{row.docsTotal} {row.docsEnviados >= row.docsTotal && "✅"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Link href={`/painel/admissoes/${row.id}`} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                          Ver detalhes
                        </Link>
                        <button onClick={() => handleCopiarLink(row.token)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                          Copiar link
                        </button>
                        <button onClick={() => handleReenviarWhatsapp(row)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                          WhatsApp
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 60 }}>
          {toast}
        </div>
      )}

      <ModalIniciarAdmissao
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        onCriado={() => { setModalAberto(false); router.refresh(); }}
      />
    </div>
  );
}
