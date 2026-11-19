"use client";

import { useEffect, useState } from "react";
import { fundoDeFormulario } from "@/lib/fundoDaJanela";
import { DESTINOS_REATIVACAO, getEtapaLabel, type DestinoReativacao } from "@/lib/etapasCandidatura";

export interface ResultadoReativacao {
  etapa_anterior: string;
  data: { id: string; etapa: DestinoReativacao };
  avisos?: { outros_processos?: { vaga_titulo: string; etapa: string; responsavel: string | null }[] };
}

interface Props {
  candidatoId: string;
  candidatoNome: string;
  cvId: string;
  // Rótulo da etapa em que a candidata está hoje na vaga (Não tem Interesse / Não Compareceu), como a API devolveu.
  etapaLabel: string;
  // Data (AAAA-MM-DD) da entrevista Salmazos já registrada no vínculo, se houver: ao escolher Entrevista Salmazos a tela avisa que ela fica velha.
  dataEntrevistaSalmazos?: string | null;
  onClose: () => void;
  onReativado: (r: ResultadoReativacao) => void;
}

interface ProcessoAtivo { vaga_titulo: string; responsavel: string | null; etapa: string }

// "Esta candidata está como X nesta vaga. Reativar?": move o MESMO vínculo (sem duplicar) para Triagem ou Entrevista Salmazos. Ir ao cliente não é
// opção aqui: passa pelo "Encaminhar ao cliente" já existente, depois de reativar.
// "2026-11-10" → "10/11"; qualquer coisa fora do formato não gera aviso.
export function diaMesDaData(data: string | null | undefined): string | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(data ?? "");
  return m ? `${m[3]}/${m[2]}` : null;
}

export default function ModalReativarCandidatura({ candidatoId, candidatoNome, cvId, etapaLabel, dataEntrevistaSalmazos, onClose, onReativado }: Props) {
  const [destino, setDestino] = useState<DestinoReativacao>("triagem");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [outrosProcessos, setOutrosProcessos] = useState<ProcessoAtivo[]>([]);

  // Aviso (não bloqueia) de outro processo ativo da candidata em outra vaga: mesma fonte do alerta do Banco de Candidatos.
  useEffect(() => {
    let cancelado = false;
    fetch(`/api/candidatos/${candidatoId}/processos-ativos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelado && json?.ativo && Array.isArray(json.processos)) setOutrosProcessos(json.processos as ProcessoAtivo[]); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [candidatoId]);

  async function reativar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/candidatos-vagas/${cvId}/reativar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(typeof json.error === "string" ? json.error : "Não foi possível reativar a candidata.");
        return;
      }
      onReativado(json as ResultadoReativacao);
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reativar candidata"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
      {...fundoDeFormulario()}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 480, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Reativar candidata</h2>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 14px" }}>{candidatoNome}</p>

        <p style={{ fontSize: 14, color: "#111827", margin: "0 0 14px", fontWeight: 600 }}>
          Esta candidata está como {etapaLabel} nesta vaga. Reativar?
        </p>

        <div role="radiogroup" aria-label="Destino" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {DESTINOS_REATIVACAO.map((d) => (
            <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", cursor: salvando ? "not-allowed" : "pointer" }}>
              <input type="radio" name="destino-reativacao" value={d} checked={destino === d} disabled={salvando} onChange={() => setDestino(d)} />
              {getEtapaLabel(d)}{d === "triagem" ? " (padrão)" : ""}
            </label>
          ))}
        </div>

        {destino === "entrevista_salmazos" && diaMesDaData(dataEntrevistaSalmazos) && (
          <div role="alert" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400E", marginBottom: 14 }}>
            Há uma entrevista Salmazos registrada em {diaMesDaData(dataEntrevistaSalmazos)}. Atualize a data depois da reativação.
          </div>
        )}

        <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 14px" }}>
          Para enviar ao cliente, reative e depois use Encaminhar ao cliente.
        </p>

        {outrosProcessos.length > 0 && (
          <div role="alert" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400E", marginBottom: 14 }}>
            Atenção: esta candidata também está em processo ativo em outra vaga:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {outrosProcessos.map((p, i) => (
                <li key={i}>{p.vaga_titulo} — {getEtapaLabel(p.etapa)}{p.responsavel ? ` (${p.responsavel})` : ""}</li>
              ))}
            </ul>
          </div>
        )}

        {erro && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", margin: "0 0 12px" }}>{erro}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: salvando ? "not-allowed" : "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={reativar}
            disabled={salvando}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#FFD700", fontSize: 13, fontWeight: 700, cursor: salvando ? "not-allowed" : "pointer", opacity: salvando ? 0.6 : 1 }}
          >
            {salvando ? "Reativando..." : "Reativar"}
          </button>
        </div>
      </div>
    </div>
  );
}
