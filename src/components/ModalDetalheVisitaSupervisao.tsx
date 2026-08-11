"use client";

import LinkFotoSupervisao from "@/components/LinkFotoSupervisao";
import {
  rotuloEquipeCompleta, rotuloEpi, rotuloUniforme, rotuloPontualidade, rotuloAmbiente, rotuloFeedbackCliente,
} from "@/lib/supervisaoChecklist";
import type { VisitaHistoricoItem } from "@/app/api/supervisao/historico/route";

interface Props {
  visita: VisitaHistoricoItem;
  clienteNome: string;
  onClose: () => void;
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 };
const valueStyle: React.CSSProperties = { fontSize: 14, color: "#111827" };

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <div style={valueStyle}>{children}</div>
    </div>
  );
}

function formatDate(d: string): string {
  return d ? d.split("-").reverse().join("/") : "—";
}

// Visualização somente-leitura de uma visita de supervisão — usado a partir do Nível 3 do
// drill-down de histórico (SupervisaoHistoricoClient.tsx). Sem nenhuma ação de edição/salvar.
export default function ModalDetalheVisitaSupervisao({ visita, clienteNome, onClose }: Props) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 560, maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Visita de Supervisão</h2>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>{clienteNome} · {formatDate(visita.data)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 0 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <Campo label="Visitado por">{visita.analista_nome ?? "—"}</Campo>
          <Campo label="Contato">{visita.contato ?? "—"}</Campo>
          <Campo label="Telefone">{visita.contato_telefone ?? "—"}</Campo>
          <Campo label="E-mail">{visita.contato_email ?? "—"}</Campo>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
          Checklist de supervisão
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          <Campo label="Equipe completa">{rotuloEquipeCompleta(visita.checklist_equipe_completa)}</Campo>
          <Campo label="Uso de EPI">{rotuloEpi(visita.checklist_epi)}</Campo>
          <Campo label="Uniforme">{rotuloUniforme(visita.checklist_uniforme)}</Campo>
          <Campo label="Pontualidade">{rotuloPontualidade(visita.checklist_pontualidade)}</Campo>
          <Campo label="Ambiente">{rotuloAmbiente(visita.checklist_ambiente)}</Campo>
          <Campo label="Feedback do cliente">{rotuloFeedbackCliente(visita.checklist_feedback_cliente)}</Campo>
        </div>

        {visita.problema_identificado && (
          <div style={{ marginBottom: 20, padding: "12px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
              ⚠ Problemas reportados
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Campo label="Qual o problema?">{visita.problema_descricao ?? "—"}</Campo>
              <Campo label="Plano de ação">{visita.plano_acao ?? "—"}</Campo>
            </div>
          </div>
        )}

        <div style={{ marginBottom: visita.evidencias_fotos.length > 0 ? 20 : 0 }}>
          <Campo label="Resumo da visita">{visita.resultado ?? "—"}</Campo>
        </div>

        {visita.evidencias_fotos.length > 0 && (
          <div>
            <span style={labelStyle}>Fotos</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {visita.evidencias_fotos.map((path, fi) => (
                <LinkFotoSupervisao key={fi} path={path} label={`Foto ${fi + 1}`} />
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
