"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/utils";
import { ADMISSAO_STATUS_BADGE, ADMISSAO_STATUS_OPTIONS, MODALIDADE_LABEL } from "@/lib/admissaoStatus";
import { MOTIVOS_REJEICAO_DOCUMENTO } from "@/lib/admissaoConstants";
import { OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { ESTADO_CIVIL_OPTIONS, GRAU_INSTRUCAO_OPTIONS, OPCAO_VALE_TRANSPORTE_LABEL } from "@/lib/admissaoConstants";
import type { AdmissaoDadosPessoais, AdmissaoDependente, AdmissaoDocumento } from "@/types";

type Tab = "dados" | "documentos" | "notas";

interface AdmissaoVtLinha {
  id: string;
  onibus_viacao: string | null;
  percurso: string | null;
  valor_unitario: number | null;
  valor_total_diario: number | null;
  ordem: number;
}

interface AdmissaoValeTransporte {
  opcao: string | null;
  dias_semana: string | null;
  bairro_cidade_trabalho: string | null;
  admissao_vt_linhas: AdmissaoVtLinha[];
}

interface AdmissaoAutorizacaoSindical {
  nome_sindicato: string | null;
  autoriza_assistencial_confederativa: boolean | null;
  autoriza_sindical: boolean | null;
}

interface AdmissaoFull {
  id: string;
  modalidade: string;
  status: string;
  token: string;
  token_expira_em: string;
  criado_em: string;
  funcao: string | null;
  salario: number | null;
  horario_trabalho: string | null;
  data_admissao: string | null;
  observacoes_internas: string | null;
  pdf_pacote_path: string | null;
  pdf_pacote_gerado_em: string | null;
  pdf_pacote_gerado_por: string | null;
  lgpd_aceite_em: string | null;
  lgpd_aceite_ip: string | null;
  candidatos: { id: string; nome_completo: string; cargo_pretendido: string; telefone: string | null; email: string | null } | null;
  vagas: { id: string; titulo: string } | null;
}

interface AuditLogEntry {
  id: string;
  created_at: string;
  usuario_nome: string | null;
  acao: string;
  detalhes: Record<string, unknown> | null;
}

interface Props {
  admissao: AdmissaoFull;
  dadosPessoais: AdmissaoDadosPessoais | null;
  dependentes: AdmissaoDependente[];
  documentos: AdmissaoDocumento[];
  auditLogs: AuditLogEntry[];
  valeTransporte: AdmissaoValeTransporte | null;
  autorizacaoSindical: AdmissaoAutorizacaoSindical | null;
}

const ACAO_LABEL: Record<string, string> = {
  admissao_criada: "Admissão criada",
  admissao_atualizada: "Admissão atualizada",
  admissao_pacote_gerado: "Pacote para contabilidade gerado",
};

function Linha({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card mb-4">
      <p className="section-title">{titulo}</p>
      {children}
    </div>
  );
}

export default function AdmissaoDetalheClient({ admissao, dadosPessoais, dependentes, documentos: documentosIniciais, auditLogs, valeTransporte, autorizacaoSindical }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dados");
  const [status, setStatus] = useState(admissao.status);
  const [documentos, setDocumentos] = useState(documentosIniciais);
  const [observacoes, setObservacoes] = useState(admissao.observacoes_internas ?? "");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [dataExameAdmissional, setDataExameAdmissional] = useState(dadosPessoais?.data_exame_admissional ?? "");
  const [salvandoExame, setSalvandoExame] = useState(false);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [rejeitandoId, setRejeitandoId] = useState<string | null>(null);
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [processandoDocId, setProcessandoDocId] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [abrindoPacote, setAbrindoPacote] = useState(false);
  const [toast, setToast] = useState("");
  const [erroPacote, setErroPacote] = useState("");

  const dp = dadosPessoais;
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const handleStatusChange = async (novoStatus: string) => {
    setSalvandoStatus(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (res.ok) { setStatus(novoStatus); router.refresh(); }
    } finally {
      setSalvandoStatus(false);
    }
  };

  const handleSalvarObservacoes = async () => {
    setSalvandoObs(true);
    try {
      await fetch(`/api/admissoes/${admissao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacoes_internas: observacoes }),
      });
    } finally {
      setSalvandoObs(false);
    }
  };

  const handleSalvarExameAdmissional = async () => {
    setSalvandoExame(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/dados-pessoais`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_exame_admissional: dataExameAdmissional || null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        showToast(json.error || "Erro ao salvar a data do exame admissional.");
      }
    } catch {
      showToast("Erro de conexão ao salvar a data do exame admissional.");
    } finally {
      setSalvandoExame(false);
    }
  };

  const handleVisualizar = async (doc: AdmissaoDocumento) => {
    const res = await fetch(`/api/admissoes/${admissao.id}/documentos/${doc.id}`);
    const json = await res.json();
    if (res.ok && json.signedUrl) window.open(json.signedUrl, "_blank");
    else showToast(json.error || "Erro ao gerar visualização.");
  };

  const handleAprovar = async (doc: AdmissaoDocumento) => {
    setProcessandoDocId(doc.id);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "aprovado" }),
      });
      const json = await res.json();
      if (res.ok) setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? json.data : d)));
    } finally {
      setProcessandoDocId(null);
    }
  };

  const isOutroMotivo = motivoSelecionado === OUTRO_MOTIVO_REPROVACAO;
  const motivoValido = isOutroMotivo ? motivoOutro.trim().length > 0 : motivoSelecionado.trim().length > 0;

  const handleConfirmarRejeicao = async (doc: AdmissaoDocumento) => {
    if (!motivoValido) return;
    const motivoFinal = isOutroMotivo ? motivoOutro.trim() : motivoSelecionado;
    setProcessandoDocId(doc.id);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejeitado", motivo_rejeicao: motivoFinal }),
      });
      const json = await res.json();
      if (res.ok) {
        setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? json.data : d)));
        setRejeitandoId(null);
        setMotivoSelecionado("");
        setMotivoOutro("");
        if (json.whatsappUrl) {
          showToast("Documento rejeitado. Clique para notificar o candidato.");
          window.open(json.whatsappUrl, "_blank");
        }
      }
    } finally {
      setProcessandoDocId(null);
    }
  };

  const handleGerarPdf = async () => {
    setGerandoPdf(true);
    setErroPacote("");
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/gerar-pdf`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "Erro ao gerar o PDF.";
        setErroPacote(msg);
        showToast(msg);
        setTab("documentos");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admissao-${(admissao.candidatos?.nome_completo ?? "candidato").toLowerCase().replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("enviado_contabilidade");
      showToast("⚠️ Este PDF contém dados pessoais sensíveis. Envie com segurança e não compartilhe por canais não seguros.");
      router.refresh();
    } catch {
      const msg = "Erro de conexão ao gerar o PDF.";
      setErroPacote(msg);
      showToast(msg);
    } finally {
      setGerandoPdf(false);
    }
  };

  const handleVerPacote = async () => {
    setAbrindoPacote(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/pacote`);
      const json = await res.json();
      if (res.ok && json.signedUrl) window.open(json.signedUrl, "_blank");
      else showToast(json.error || "Erro ao abrir o pacote.");
    } finally {
      setAbrindoPacote(false);
    }
  };

  // A liberação do botão depende EXCLUSIVAMENTE dos documentos obrigatórios aprovados
  // em admissao_documentos — o campo admissoes.status (editável manualmente pela equipe)
  // nunca deve entrar nessa conta, para não abrir um atalho de aprovação sem revisão.
  const docsObrigatoriosPendentes = documentos.filter((d) => d.obrigatorio && d.status !== "aprovado");
  const nomesDocsPendentes = docsObrigatoriosPendentes.map(
    (d) => DOCUMENTOS_ADMISSAO.find((def) => def.tipo_documento === d.tipo_documento)?.label ?? d.tipo_documento
  );
  const podeGerarPdf = docsObrigatoriosPendentes.length === 0;
  const tituloBotaoPdf = nomesDocsPendentes.length > 0 ? `Faltam aprovar: ${nomesDocsPendentes.join(", ")}` : undefined;
  const docsAprovados = documentos.filter((d) => d.status === "aprovado").length;
  const badge = ADMISSAO_STATUS_BADGE[status] ?? { label: status, bg: "#F3F4F6", text: "#374151" };
  const logGeracaoPacote = auditLogs.find((l) => l.acao === "admissao_pacote_gerado");

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{admissao.candidatos?.nome_completo ?? "Admissão"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {admissao.vagas?.titulo ?? "—"} · {MODALIDADE_LABEL[admissao.modalidade] ?? admissao.modalidade}
          </p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: badge.bg, color: badge.text }}>
          {badge.label}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-gray-100 mb-5">
        {[{ id: "dados" as Tab, label: "Dados do Candidato" }, { id: "documentos" as Tab, label: "Documentos" }, { id: "notas" as Tab, label: "Anotações Internas" }].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontWeight: tab === t.id ? 700 : 500, fontSize: 14,
              color: tab === t.id ? "#111827" : "#6B7280", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid #FFB800" : "2px solid transparent", marginBottom: -2, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dados" && (
        <>
          <div
            className="rounded-lg p-3 mb-4 text-sm"
            style={
              admissao.lgpd_aceite_em
                ? { background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" }
                : { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }
            }
          >
            {admissao.lgpd_aceite_em ? (
              <>
                ✅ Consentimento LGPD aceito em: {new Date(admissao.lgpd_aceite_em).toLocaleString("pt-BR")}
                {admissao.lgpd_aceite_ip ? ` · IP: ${admissao.lgpd_aceite_ip}` : ""}
              </>
            ) : (
              "⚠️ Consentimento LGPD ainda não registrado — candidato não concluiu o envio final."
            )}
          </div>

          <Secao titulo="Dados da Admissão">
            <Linha label="Função" value={admissao.funcao} />
            <Linha label="Salário" value={admissao.salario != null ? admissao.salario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null} />
            <Linha label="Horário de trabalho" value={admissao.horario_trabalho} />
            <Linha label="Data de admissão" value={admissao.data_admissao} />
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50 text-sm">
              <span className="text-gray-500">Data do exame admissional</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dataExameAdmissional ?? ""}
                  onChange={(e) => setDataExameAdmissional(e.target.value)}
                  onBlur={handleSalvarExameAdmissional}
                  className="input-field !w-auto !py-1 !text-sm"
                />
                {salvandoExame && <span className="text-xs text-gray-400">Salvando...</span>}
              </div>
            </div>
          </Secao>

          <Secao titulo="Dados Pessoais">
            <Linha label="Nome completo" value={dp?.nome_completo} />
            <Linha label="Data de nascimento" value={dp?.data_nascimento} />
            <Linha label="Sexo" value={dp?.sexo === "M" ? "Masculino" : dp?.sexo === "F" ? "Feminino" : ""} />
            <Linha label="Estado civil" value={ESTADO_CIVIL_OPTIONS.find((o) => o.value === dp?.estado_civil)?.label} />
            <Linha label="Nacionalidade" value={dp?.nacionalidade} />
            <Linha label="Naturalidade" value={dp?.naturalidade} />
            <Linha label="CPF" value={dp?.cpf} />
            <Linha label="RG" value={[dp?.rg_numero, dp?.rg_orgao_emissor, dp?.rg_uf].filter(Boolean).join(" / ")} />
            <Linha label="Nome da mãe" value={dp?.nome_mae} />
            <Linha label="Nome do pai" value={dp?.nome_pai} />
            <Linha label="Grau de instrução" value={GRAU_INSTRUCAO_OPTIONS.find((o) => o.value === dp?.grau_instrucao)?.label} />
          </Secao>

          <Secao titulo="Documentos Profissionais">
            <Linha label="PIS/PASEP" value={dp?.pis_pasep} />
            <Linha label="Carteira de Trabalho" value={[dp?.carteira_trabalho_numero, dp?.carteira_trabalho_serie, dp?.carteira_trabalho_uf].filter(Boolean).join(" / ")} />
            <Linha label="Título de eleitor" value={[dp?.titulo_eleitor, dp?.zona_eleitoral, dp?.secao_eleitoral].filter(Boolean).join(" / ")} />
            <Linha label="Reservista" value={dp?.reservista} />
            <Linha label="CNH" value={dp?.cnh_numero ? `${dp.cnh_numero} — Cat. ${dp.cnh_categoria ?? "—"} — Val. ${dp.cnh_validade ?? "—"}` : ""} />
          </Secao>

          <Secao titulo="Endereço e Contato">
            <Linha label="Endereço" value={[dp?.endereco_logradouro, dp?.endereco_numero, dp?.endereco_complemento].filter(Boolean).join(", ")} />
            <Linha label="Bairro / Cidade / UF" value={[dp?.endereco_bairro, dp?.endereco_cidade, dp?.endereco_uf].filter(Boolean).join(" / ")} />
            <Linha label="CEP" value={dp?.endereco_cep} />
            <Linha label="Telefone" value={dp?.telefone} />
            <Linha label="E-mail" value={dp?.email} />
          </Secao>

          <Secao titulo="Dados Bancários">
            <Linha label="Banco" value={dp?.banco} />
            <Linha label="Agência" value={dp?.agencia} />
            <Linha label="Conta" value={dp?.conta} />
            <Linha label="Tipo de conta" value={dp?.tipo_conta === "corrente" ? "Conta Corrente" : dp?.tipo_conta === "poupanca" ? "Conta Poupança" : ""} />
          </Secao>

          {dependentes.length > 0 && (
            <Secao titulo="Dependentes">
              {dependentes.map((d) => (
                <div key={d.id} className="py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-semibold text-gray-900">{d.nome} <span className="text-gray-400 font-normal">({d.parentesco})</span></p>
                  <p className="text-xs text-gray-500">Nascimento: {d.data_nascimento || "—"} {d.cpf ? `· CPF: ${d.cpf}` : ""}</p>
                  {d.nome_mae && <p className="text-xs text-gray-500">Mãe: {d.nome_mae}</p>}
                </div>
              ))}
            </Secao>
          )}

          {/* Candidato ainda não chegou nesse passo do formulário (ou admissão criada
              antes da Fase C) — sem registro nenhum, não faz sentido mostrar a seção. */}
          {valeTransporte && (
            <Secao titulo="Vale Transporte">
              <Linha label="Opção" value={valeTransporte.opcao ? OPCAO_VALE_TRANSPORTE_LABEL[valeTransporte.opcao] ?? valeTransporte.opcao : null} />
              <Linha label="Dias na semana" value={valeTransporte.dias_semana} />
              <Linha label="Local de trabalho" value={valeTransporte.bairro_cidade_trabalho} />
              {valeTransporte.opcao === "vale_transporte" && valeTransporte.admissao_vt_linhas.length > 0 && (
                <div className="mt-2">
                  {valeTransporte.admissao_vt_linhas.map((l) => (
                    <div key={l.id} className="py-2 border-b border-gray-50 last:border-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {[l.onibus_viacao, l.percurso].filter(Boolean).join(" — ") || "—"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Unitário: {l.valor_unitario != null ? l.valor_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                        {" · "}
                        Total diário: {l.valor_total_diario != null ? l.valor_total_diario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Secao>
          )}

          {autorizacaoSindical && (
            <Secao titulo="Autorização Sindical">
              <Linha label="Sindicato" value={autorizacaoSindical.nome_sindicato} />
              <Linha
                label="Desconto assistencial/confederativa"
                value={autorizacaoSindical.autoriza_assistencial_confederativa === true ? "Autorizado" : autorizacaoSindical.autoriza_assistencial_confederativa === false ? "Não autorizado" : null}
              />
              <Linha
                label="Desconto sindical"
                value={autorizacaoSindical.autoriza_sindical === true ? "Autorizado" : autorizacaoSindical.autoriza_sindical === false ? "Não autorizado" : null}
              />
            </Secao>
          )}
        </>
      )}

      {tab === "documentos" && (
        <div>
          {erroPacote && (
            <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
              ⚠️ {erroPacote}
            </div>
          )}
          <p className="text-sm font-semibold text-gray-700 mb-4">{docsAprovados} de {documentos.length} documentos aprovados</p>
          {documentos.map((doc) => {
            const def = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento);
            const statusBadge: Record<string, { label: string; bg: string; text: string }> = {
              pendente: { label: "Pendente", bg: "#F3F4F6", text: "#6B7280" },
              enviado: { label: "Enviado", bg: "#DBEAFE", text: "#1D4ED8" },
              aprovado: { label: "Aprovado ✅", bg: "#DCFCE7", text: "#15803D" },
              rejeitado: { label: "Rejeitado ❌", bg: "#FEE2E2", text: "#991B1B" },
            };
            const sb = statusBadge[doc.status] ?? statusBadge.pendente;
            const processando = processandoDocId === doc.id;

            return (
              <div key={doc.id} className="card mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-gray-900">{def?.label ?? doc.tipo_documento}</p>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: sb.bg, color: sb.text }}>
                    {sb.label}
                  </span>
                </div>
                {doc.motivo_rejeicao && <p className="text-xs text-red-600 mb-2">Motivo: {doc.motivo_rejeicao}</p>}

                <div className="flex gap-2 flex-wrap mt-2">
                  {doc.storage_path && (
                    <button onClick={() => handleVisualizar(doc)} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>
                      Visualizar
                    </button>
                  )}
                  {doc.status === "enviado" && (
                    <>
                      <button
                        onClick={() => handleAprovar(doc)} disabled={processando}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "1px solid #16A34A", background: "#F0FDF4", color: "#15803D", cursor: "pointer" }}
                      >
                        ✅ Aprovar
                      </button>
                      <button
                        onClick={() => { setRejeitandoId(rejeitandoId === doc.id ? null : doc.id); setMotivoSelecionado(""); setMotivoOutro(""); }}
                        disabled={processando}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "1px solid #DC2626", background: "#FEF2F2", color: "#991B1B", cursor: "pointer" }}
                      >
                        ❌ Rejeitar
                      </button>
                    </>
                  )}
                </div>

                {rejeitandoId === doc.id && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motivo da rejeição *</label>
                    <select value={motivoSelecionado} onChange={(e) => setMotivoSelecionado(e.target.value)} className="input-field mb-2">
                      <option value="" disabled>Selecione o motivo...</option>
                      {MOTIVOS_REJEICAO_DOCUMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {isOutroMotivo && (
                      <textarea
                        value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)}
                        placeholder="Descreva o motivo..." rows={2}
                        className="input-field resize-none mb-2"
                      />
                    )}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setRejeitandoId(null)} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>Cancelar</button>
                      <button
                        onClick={() => handleConfirmarRejeicao(doc)}
                        disabled={!motivoValido || processando}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", opacity: !motivoValido || processando ? 0.6 : 1 }}
                      >
                        {processando ? "Salvando..." : "Confirmar rejeição"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "notas" && (
        <div>
          <div className="card mb-4">
            <p className="section-title">Anotações Internas</p>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              onBlur={handleSalvarObservacoes}
              rows={5}
              placeholder="Observações da equipe sobre esta admissão..."
              className="input-field resize-none"
            />
            {salvandoObs && <p className="text-xs text-gray-400 mt-1">Salvando...</p>}
          </div>

          <div className="card">
            <p className="section-title">Histórico</p>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum registro ainda.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="font-semibold text-gray-800">{ACAO_LABEL[log.acao] ?? log.acao}</span>
                  <span className="text-gray-400"> — {log.usuario_nome ?? "Sistema"} — {formatarData(log.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="card mt-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={salvandoStatus}
            className="input-field"
          >
            {ADMISSAO_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <button
            onClick={handleGerarPdf}
            disabled={!podeGerarPdf || gerandoPdf}
            title={tituloBotaoPdf}
            className="btn-primary"
            style={{ opacity: !podeGerarPdf || gerandoPdf ? 0.5 : 1 }}
          >
            {gerandoPdf ? "Gerando PDF..." : "Gerar pacote para contabilidade"}
          </button>
          {nomesDocsPendentes.length > 0 && (
            <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6, maxWidth: 320, textAlign: "right" }}>
              ⚠️ Aprove antes: {nomesDocsPendentes.join(", ")}
            </p>
          )}
        </div>
      </div>

      {admissao.pdf_pacote_path && (
        <div className="card mt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pacote para contabilidade</p>
          <p className="text-sm text-gray-600 mb-2">
            Gerado em {admissao.pdf_pacote_gerado_em ? formatarData(admissao.pdf_pacote_gerado_em) : "—"}
            {logGeracaoPacote?.usuario_nome ? ` por ${logGeracaoPacote.usuario_nome}` : ""}
          </p>
          <button onClick={handleVerPacote} disabled={abrindoPacote} className="btn-outline">
            {abrindoPacote ? "Abrindo..." : "Ver pacote gerado"}
          </button>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", maxWidth: 420, textAlign: "center", background: "#111827", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 60 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
