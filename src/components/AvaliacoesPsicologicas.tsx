"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface DadosQuantitativos {
  acertos: number | null;
  erros: number | null;
  omissoes: number | null;
  pontos: number | null;
  percentil: number | null;
}

interface Avaliacao {
  id: string;
  tipo_teste: "palografico" | "ac" | "disc";
  status: "pendente" | "aplicado" | "laudo_emitido";
  data_aplicacao: string;
  psicologo_responsavel: string | null;
  parecer_ia: string | null;
  comentarios_psicologo: string | null;
  pdf_url: string | null;
  dados_quantitativos: DadosQuantitativos | null;
  created_at: string;
}

const TIPO_CONFIG = {
  palografico: { label: "Palográfico", bg: "#ede9fe", text: "#5b21b6" },
  ac: { label: "AC", bg: "#fef3c7", text: "#92400e" },
  disc: { label: "DISC", bg: "#dbeafe", text: "#1d4ed8" },
} as const;

const STATUS_CONFIG = {
  pendente: { label: "Pendente", bg: "#f3f4f6", text: "#6b7280" },
  aplicado: { label: "Aplicado", bg: "#dbeafe", text: "#1d4ed8" },
  laudo_emitido: { label: "Laudo Emitido", bg: "#d1fae5", text: "#065f46" },
} as const;

const hoje = () => new Date().toISOString().split("T")[0];

interface CardProps {
  av: Avaliacao;
  onDelete: (id: string) => void;
  onUpdate: (updated: Avaliacao) => void;
}

function AvaliacaoCard({ av, onDelete, onUpdate }: CardProps) {
  const [comentarios, setComentarios] = useState(
    av.comentarios_psicologo ?? ""
  );
  const [salvando, setSalvando] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [abaAcAberta, setAbaAcAberta] = useState(false);
  const [dadosAc, setDadosAc] = useState({
    acertos: av.dados_quantitativos?.acertos?.toString() ?? "",
    erros: av.dados_quantitativos?.erros?.toString() ?? "",
    omissoes: av.dados_quantitativos?.omissoes?.toString() ?? "",
    pontos: av.dados_quantitativos?.pontos?.toString() ?? "",
    percentil: av.dados_quantitativos?.percentil?.toString() ?? "",
  });
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [dadosSalvos, setDadosSalvos] = useState(false);

  async function salvarDadosAc() {
    setSalvandoDados(true);
    const payload: DadosQuantitativos = {
      acertos: dadosAc.acertos !== "" ? Number(dadosAc.acertos) : null,
      erros: dadosAc.erros !== "" ? Number(dadosAc.erros) : null,
      omissoes: dadosAc.omissoes !== "" ? Number(dadosAc.omissoes) : null,
      pontos: dadosAc.pontos !== "" ? Number(dadosAc.pontos) : null,
      percentil: dadosAc.percentil !== "" ? Number(dadosAc.percentil) : null,
    };
    await fetch(`/api/avaliacoes/${av.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dados_quantitativos: payload }),
    });
    setSalvandoDados(false);
    setDadosSalvos(true);
    onUpdate({ ...av, dados_quantitativos: payload });
    setTimeout(() => setDadosSalvos(false), 3000);
  }

  const tipoConf = TIPO_CONFIG[av.tipo_teste];
  const statusConf = STATUS_CONFIG[av.status];

  async function salvarComentarios() {
    if (comentarios === (av.comentarios_psicologo ?? "")) return;
    setSalvando(true);
    await fetch(`/api/avaliacoes/${av.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios_psicologo: comentarios }),
    });
    setSalvando(false);
    onUpdate({ ...av, comentarios_psicologo: comentarios });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg("Analisando com IA...");
    const fd = new FormData();
    fd.append("arquivo", file);
    const res = await fetch(`/api/avaliacoes/${av.id}/upload-pdf`, {
      method: "POST",
      body: fd,
    });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) {
      setUploadMsg(json.error ?? "Erro ao enviar PDF.");
    } else {
      setUploadMsg("Laudo gerado com sucesso!");
      onUpdate({
        ...av,
        pdf_url: av.pdf_url ?? "uploaded",
        status: "laudo_emitido",
        parecer_ia: json.parecer_ia ?? null,
      });
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir esta avaliação? Esta ação não pode ser desfeita."))
      return;
    await fetch(`/api/avaliacoes/${av.id}`, { method: "DELETE" });
    onDelete(av.id);
  }

  const podeUpload = av.status === "pendente" || av.status === "aplicado";
  const dataFormatada = av.data_aplicacao
    ? new Date(av.data_aplicacao + "T12:00:00").toLocaleDateString("pt-BR")
    : "—";

  return (
    <div
      className="card"
      style={{ marginBottom: "16px", borderLeft: `4px solid ${tipoConf.text}` }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              background: tipoConf.bg,
              color: tipoConf.text,
              fontWeight: 700,
              fontSize: "12px",
              padding: "3px 10px",
              borderRadius: "9999px",
            }}
          >
            {tipoConf.label}
          </span>
          <span
            style={{
              background: statusConf.bg,
              color: statusConf.text,
              fontWeight: 600,
              fontSize: "12px",
              padding: "3px 10px",
              borderRadius: "9999px",
            }}
          >
            {statusConf.label}
          </span>
          <span className="text-sm text-gray-500">{dataFormatada}</span>
          {av.psicologo_responsavel && (
            <span className="text-sm text-gray-500">
              · {av.psicologo_responsavel}
            </span>
          )}
        </div>
        <button
          onClick={handleDelete}
          title="Excluir avaliação"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#ef4444",
            fontSize: "13px",
            padding: "2px 6px",
            borderRadius: "4px",
            flexShrink: 0,
          }}
        >
          Excluir
        </button>
      </div>

      {/* Upload PDF */}
      {podeUpload && !uploading && (
        <div style={{ marginBottom: "12px" }}>
          <input
            type="file"
            accept=".pdf,application/pdf"
            ref={fileRef}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            className="btn-outline"
            style={{ fontSize: "13px" }}
            onClick={() => fileRef.current?.click()}
          >
            Enviar PDF do teste
          </button>
          {uploadMsg && (
            <span
              style={{
                marginLeft: "10px",
                fontSize: "13px",
                color: uploadMsg.startsWith("Laudo") ? "#065f46" : "#dc2626",
              }}
            >
              {uploadMsg}
            </span>
          )}
        </div>
      )}

      {/* Loading IA */}
      {uploading && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            background: "#f0fdf4",
            borderRadius: "8px",
            color: "#065f46",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "14px",
              height: "14px",
              border: "2px solid #065f46",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          Analisando com IA... isso pode levar alguns segundos.
        </div>
      )}

      {/* PDF já enviado mas sem parecer */}
      {!podeUpload && av.status === "aplicado" && !av.parecer_ia && (
        <p className="text-sm text-gray-500" style={{ marginBottom: "8px" }}>
          PDF enviado. Aguardando análise IA.
        </p>
      )}

      {/* Parecer IA */}
      {av.parecer_ia && (
        <div
          style={{
            marginBottom: "14px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "12px 14px",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#6b7280",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Parecer IA
          </p>
          <ReactMarkdown
            components={{
              h1: ({children}) => <h1 style={{fontSize:"18px",fontWeight:700,marginBottom:"8px",marginTop:"12px",color:"#111827"}}>{children}</h1>,
              h2: ({children}) => <h2 style={{fontSize:"16px",fontWeight:700,marginBottom:"6px",marginTop:"12px",color:"#111827"}}>{children}</h2>,
              h3: ({children}) => <h3 style={{fontSize:"14px",fontWeight:700,marginBottom:"4px",marginTop:"8px",color:"#374151"}}>{children}</h3>,
              strong: ({children}) => <strong style={{fontWeight:700,color:"#111827"}}>{children}</strong>,
              p: ({children}) => <p style={{marginBottom:"8px",lineHeight:"1.6",color:"#374151"}}>{children}</p>,
              li: ({children}) => <li style={{marginBottom:"4px",lineHeight:"1.6",color:"#374151"}}>{children}</li>,
              ul: ({children}) => <ul style={{paddingLeft:"20px",marginBottom:"8px"}}>{children}</ul>,
              hr: () => <hr style={{border:"none",borderTop:"1px solid #e5e7eb",margin:"12px 0"}} />,
            }}
          >
            {av.parecer_ia}
          </ReactMarkdown>
        </div>
      )}

      {/* Dados do Teste AC */}
      {av.tipo_teste === "ac" && (
        <div style={{ marginBottom: "12px" }}>
          <button
            onClick={() => setAbaAcAberta((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              color: "#92400e",
              padding: "4px 0",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.15s",
                transform: abaAcAberta ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▶
            </span>
            Dados do Teste AC
          </button>

          {abaAcAberta && (
            <div
              style={{
                marginTop: "10px",
                padding: "14px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: "10px",
                  marginBottom: "12px",
                }}
              >
                {(
                  [
                    ["acertos", "Acertos"],
                    ["erros", "Erros"],
                    ["omissoes", "Omissões"],
                    ["pontos", "Pontos"],
                    ["percentil", "Percentil"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#6b7280",
                        display: "block",
                        marginBottom: "3px",
                      }}
                    >
                      {label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      style={{ fontSize: "13px" }}
                      value={dadosAc[field]}
                      onChange={(e) =>
                        setDadosAc((d) => ({ ...d, [field]: e.target.value }))
                      }
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  className="btn-outline"
                  style={{ fontSize: "13px" }}
                  onClick={salvarDadosAc}
                  disabled={salvandoDados}
                >
                  {salvandoDados ? "Salvando..." : "Salvar dados"}
                </button>
                {dadosSalvos && (
                  <span style={{ fontSize: "13px", color: "#065f46" }}>
                    Dados salvos!
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comentários psicólogo */}
      <div>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#374151",
            display: "block",
            marginBottom: "4px",
          }}
        >
          Comentários do psicólogo
        </label>
        <textarea
          className="input-field"
          rows={3}
          style={{ fontSize: "13px", resize: "vertical" }}
          value={comentarios}
          onChange={(e) => setComentarios(e.target.value)}
          onBlur={salvarComentarios}
          placeholder="Adicione observações..."
        />
        {salvando && (
          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "3px" }}>
            Salvando...
          </p>
        )}
      </div>
    </div>
  );
}

interface Props {
  candidatoId: string;
}

export default function AvaliacoesPsicologicas({ candidatoId }: Props) {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erroModal, setErroModal] = useState("");
  const [laudoConsolidado, setLaudoConsolidado] = useState<string | null>(null);
  const [gerandoLaudo, setGerandoLaudo] = useState(false);
  const [form, setForm] = useState({
    tipo_teste: "palografico" as Avaliacao["tipo_teste"],
    data_aplicacao: hoje(),
    psicologo_responsavel: "",
  });

  useEffect(() => {
    fetch(`/api/avaliacoes?candidato_id=${candidatoId}`)
      .then((r) => r.json())
      .then((j) => {
        setAvaliacoes(j.data ?? []);
        setCarregando(false);
      })
      .catch(() => setCarregando(false));
  }, [candidatoId]);

  async function criarAvaliacao() {
    if (!form.data_aplicacao) {
      setErroModal("Data de aplicação é obrigatória.");
      return;
    }
    setCriando(true);
    setErroModal("");
    const res = await fetch("/api/avaliacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidato_id: candidatoId,
        tipo_teste: form.tipo_teste,
        data_aplicacao: form.data_aplicacao,
        psicologo_responsavel: form.psicologo_responsavel || null,
      }),
    });
    const json = await res.json();
    setCriando(false);
    if (!res.ok) {
      setErroModal(json.error ?? "Erro ao criar avaliação.");
    } else {
      setAvaliacoes((prev) => [json.data as Avaliacao, ...prev]);
      setModalAberto(false);
      setForm({ tipo_teste: "palografico", data_aplicacao: hoje(), psicologo_responsavel: "" });
    }
  }

  function handleDelete(id: string) {
    setAvaliacoes((prev) => prev.filter((a) => a.id !== id));
  }

  function handleUpdate(updated: Avaliacao) {
    setAvaliacoes((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function gerarLaudoConsolidado() {
    setGerandoLaudo(true);
    setLaudoConsolidado(null);
    const res = await fetch("/api/avaliacoes/laudo-consolidado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidato_id: candidatoId }),
    });
    const json = await res.json();
    setGerandoLaudo(false);
    if (res.ok) setLaudoConsolidado(json.laudo ?? null);
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ animation: "fadeIn 0.2s ease" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            Avaliações Psicológicas
          </h2>
          <button
            className="btn-primary"
            onClick={() => {
              setModalAberto(true);
              setErroModal("");
            }}
          >
            + Nova Avaliação
          </button>
        </div>

        {/* Lista */}
        {carregando ? (
          <p className="text-sm text-gray-500">Carregando avaliações...</p>
        ) : avaliacoes.length === 0 ? (
          <div
            className="card"
            style={{ textAlign: "center", padding: "32px", color: "#9ca3af" }}
          >
            <p style={{ fontSize: "14px" }}>
              Nenhuma avaliação psicológica registrada.
            </p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>
              Clique em &quot;+ Nova Avaliação&quot; para começar.
            </p>
          </div>
        ) : (
          avaliacoes.map((av) => (
            <AvaliacaoCard
              key={av.id}
              av={av}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))
        )}

        {/* Laudo Consolidado */}
        {avaliacoes.filter((a) => a.parecer_ia).length >= 1 && (
          <div style={{ marginTop: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <h3
                style={{ fontWeight: 700, fontSize: "15px", color: "#374151" }}
              >
                Laudo Consolidado
              </h3>
              <button
                className="btn-outline"
                onClick={gerarLaudoConsolidado}
                disabled={gerandoLaudo}
              >
                {gerandoLaudo ? "Gerando..." : "📋 Gerar Laudo Consolidado"}
              </button>
            </div>

            {gerandoLaudo && (
              <div
                style={{
                  padding: "14px 16px",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "8px",
                  color: "#92400e",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    border: "2px solid #92400e",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                Gerando laudo consolidado...
              </div>
            )}

            {laudoConsolidado && !gerandoLaudo && (
              <div
                style={{
                  background: "#fffbeb",
                  borderLeft: "4px solid #FFB800",
                  borderRadius: "8px",
                  padding: "16px 18px",
                  border: "1px solid #fde68a",
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Laudo Psicológico Consolidado
                </p>
                <ReactMarkdown
                  components={{
                    h1: ({children}) => <h1 style={{fontSize:"18px",fontWeight:700,marginBottom:"8px",marginTop:"12px",color:"#111827"}}>{children}</h1>,
                    h2: ({children}) => <h2 style={{fontSize:"16px",fontWeight:700,marginBottom:"6px",marginTop:"12px",color:"#111827"}}>{children}</h2>,
                    h3: ({children}) => <h3 style={{fontSize:"14px",fontWeight:700,marginBottom:"4px",marginTop:"8px",color:"#374151"}}>{children}</h3>,
                    strong: ({children}) => <strong style={{fontWeight:700,color:"#111827"}}>{children}</strong>,
                    p: ({children}) => <p style={{marginBottom:"8px",lineHeight:"1.6",color:"#374151"}}>{children}</p>,
                    li: ({children}) => <li style={{marginBottom:"4px",lineHeight:"1.6",color:"#374151"}}>{children}</li>,
                    ul: ({children}) => <ul style={{paddingLeft:"20px",marginBottom:"8px"}}>{children}</ul>,
                    hr: () => <hr style={{border:"none",borderTop:"1px solid #e5e7eb",margin:"12px 0"}} />,
                  }}
                >
                  {laudoConsolidado}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Nova Avaliação */}
      {modalAberto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalAberto(false);
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "460px",
              animation: "fadeIn 0.15s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{ fontWeight: 700, fontSize: "16px", color: "#111827" }}
              >
                Nova Avaliação Psicológica
              </h3>
              <button
                onClick={() => setModalAberto(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "18px",
                  color: "#6b7280",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Tipo de teste *
                </label>
                <select
                  className="input-field"
                  value={form.tipo_teste}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tipo_teste: e.target.value as Avaliacao["tipo_teste"],
                    }))
                  }
                >
                  <option value="palografico">Palográfico</option>
                  <option value="ac">AC (Atenção Concentrada)</option>
                  <option value="disc">DISC</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Data de aplicação *
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={form.data_aplicacao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, data_aplicacao: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Psicólogo responsável
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Nome do psicólogo"
                  value={form.psicologo_responsavel}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      psicologo_responsavel: e.target.value,
                    }))
                  }
                />
              </div>

              {erroModal && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#dc2626",
                    background: "#fef2f2",
                    padding: "8px 12px",
                    borderRadius: "6px",
                  }}
                >
                  {erroModal}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                  marginTop: "4px",
                }}
              >
                <button
                  className="btn-outline"
                  onClick={() => setModalAberto(false)}
                  disabled={criando}
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={criarAvaliacao}
                  disabled={criando}
                >
                  {criando ? "Criando..." : "Criar Avaliação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
