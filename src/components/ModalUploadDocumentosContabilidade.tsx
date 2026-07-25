"use client";

import { useEffect, useState } from "react";
import {
  DOCUMENTOS_CONTABILIDADE,
  documentosObrigatorios,
  inferirTipoDocumentoContabilidade,
  detectarConflitosDeTipo,
  type TipoDocumentoContabilidade,
} from "@/lib/contabilidadeDocumentosMatch";
import type { AdmissaoDocumentoContabilidade } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  admissaoId: string;
  documentosIniciais: AdmissaoDocumentoContabilidade[];
  nomeInicial: string;
  emailInicial: string;
  onEnviado: () => void;
}

interface StagedItem {
  id: string;
  file: File;
  tipo: TipoDocumentoContabilidade | "";
  erro?: string;
}

const TAMANHO_MAX = 15 * 1024 * 1024; // 15MB

async function enviarArquivoContabilidade(
  admissaoId: string,
  tipo: TipoDocumentoContabilidade,
  file: File
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const urlRes = await fetch(`/api/admissoes/${admissaoId}/documentos-contabilidade/${tipo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    const urlJson = await urlRes.json();
    if (!urlRes.ok) return { ok: false, erro: urlJson.error || "Erro ao preparar envio." };

    const putRes = await fetch(urlJson.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/pdf" },
      body: file,
    });
    if (!putRes.ok) return { ok: false, erro: "Erro ao enviar o arquivo." };

    const confirmRes = await fetch(`/api/admissoes/${admissaoId}/documentos-contabilidade/${tipo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_path: urlJson.path }),
    });
    const confirmJson = await confirmRes.json();
    if (!confirmRes.ok) return { ok: false, erro: confirmJson.error || "Erro ao confirmar envio." };

    return { ok: true };
  } catch {
    return { ok: false, erro: "Erro de conexão. Tente novamente." };
  }
}

// Upload em lote + conferência dos 7 documentos que a contabilidade prepara (Ficha de
// Registro, Modelo Contrato, Acordo de HS/Decl VT, Termo LGPD, Ficha de IR, Salário
// Família, Termo de Responsabilidade) — identificação automática por nome do arquivo,
// sempre editável antes de enviar (nunca decide "no escuro": arquivo não identificado ou
// duplicado força escolha manual). A lista SEMPRE mostra os 7 tipos; só os 4 primeiros
// (Ficha de Registro, Modelo Contrato, Acordo de HS/Decl VT, Termo LGPD) são obrigatórios
// — os outros 3 são opcionais em qualquer cenário, dependem só do que a contabilidade
// efetivamente mandar (não há gate por dependente_ir/dependente_salario_familia aqui).
// Etapa 1 = upload/conferência; etapa 2 = validação de completude dos 4 fixos + confirmação
// de nome/e-mail antes de montar o PDF final e enviar pra assinatura eletrônica — mesmo
// padrão de revisão-antes-de-disparar-algo-irreversível do ModalAssinaturaEletronica.
export default function ModalUploadDocumentosContabilidade({
  isOpen,
  onClose,
  admissaoId,
  documentosIniciais,
  nomeInicial,
  emailInicial,
  onEnviado,
}: Props) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [documentos, setDocumentos] = useState<AdmissaoDocumentoContabilidade[]>(documentosIniciais);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [enviandoStaged, setEnviandoStaged] = useState(false);
  const [erroStaged, setErroStaged] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviandoFinal, setEnviandoFinal] = useState(false);
  const [erroFinal, setErroFinal] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setEtapa(1);
    setDocumentos(documentosIniciais);
    setStaged([]);
    setErroStaged("");
    setNome(nomeInicial);
    setEmail(emailInicial);
    setErroFinal("");
  }, [isOpen, documentosIniciais, nomeInicial, emailInicial]);

  if (!isOpen) return null;

  const conflitosStaged = detectarConflitosDeTipo(staged.map((s) => ({ id: s.id, tipo: s.tipo || null })));
  const podeEnviarStaged = staged.length > 0 && staged.every((s) => s.tipo !== "" && !conflitosStaged.has(s.id));

  const listaCompleta = documentosObrigatorios();
  const faltando = listaCompleta.filter((d) => d.obrigatorio && !documentos.some((doc) => doc.tipo_documento === d.tipo_documento));
  const labelsFaltando = faltando.map((d) => d.label);
  const podeEnviarFinal = faltando.length === 0 && nome.trim().length > 0 && email.trim().length > 0;

  const handleSelecionar = (files: FileList) => {
    setErroStaged("");
    const novos: StagedItem[] = [];
    for (const file of Array.from(files)) {
      if (file.size > TAMANHO_MAX) {
        setErroStaged(`"${file.name}" é maior que 15MB.`);
        continue;
      }
      novos.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        tipo: inferirTipoDocumentoContabilidade(file.name) ?? "",
      });
    }
    setStaged((prev) => [...prev, ...novos]);
  };

  const handleRemoverStaged = (id: string) => setStaged((prev) => prev.filter((s) => s.id !== id));

  const handleTipoChange = (id: string, novoTipo: TipoDocumentoContabilidade | "") =>
    setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, tipo: novoTipo } : s)));

  const handleEnviarStaged = async () => {
    setErroStaged("");
    setEnviandoStaged(true);
    const restantes: StagedItem[] = [];
    for (const item of staged) {
      if (!item.tipo) { restantes.push(item); continue; }
      const resultado = await enviarArquivoContabilidade(admissaoId, item.tipo, item.file);
      if (!resultado.ok) {
        restantes.push({ ...item, erro: resultado.erro });
        continue;
      }
      const tipoEnviado = item.tipo;
      setDocumentos((prev) => {
        const semEsseTipo = prev.filter((d) => d.tipo_documento !== tipoEnviado);
        return [
          ...semEsseTipo,
          { id: `local-${tipoEnviado}`, admissao_id: admissaoId, tipo_documento: tipoEnviado, storage_path: "", criado_em: new Date().toISOString() },
        ];
      });
    }
    setStaged(restantes);
    setEnviandoStaged(false);
    if (restantes.some((r) => r.erro)) setErroStaged("Alguns arquivos não puderam ser enviados — veja o erro em cada linha.");
  };

  const handleMontarEnviar = async () => {
    if (!podeEnviarFinal) return;
    setEnviandoFinal(true);
    setErroFinal("");
    try {
      const res = await fetch(`/api/admissoes/${admissaoId}/documentos-contabilidade/montar-enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomeCandidato: nome.trim(), emailCandidato: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroFinal(json.error || "Erro ao montar e enviar o pacote da contabilidade.");
        return;
      }
      onEnviado();
      onClose();
    } catch {
      setErroFinal("Erro de conexão ao montar e enviar o pacote.");
    } finally {
      setEnviandoFinal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <span>📑</span> Documentos da Contabilidade
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        {etapa === 1 && (
          <div className="p-6 space-y-4">
            <div className="rounded-lg p-3 text-xs" style={{ background: "#F3F4F6", color: "#374151" }}>
              Envie aqui os PDFs individuais que a contabilidade preparou (Ficha de Registro, Modelo Contrato, etc). O
              tipo de cada arquivo é sugerido automaticamente pelo nome — confira e corrija antes de enviar.
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Os 7 documentos possíveis</p>
              <div className="space-y-1">
                {listaCompleta.map((d, index) => {
                  const confirmado = documentos.some((doc) => doc.tipo_documento === d.tipo_documento);
                  const status = confirmado
                    ? { texto: "✅ Enviado", cor: "#16A34A" }
                    : d.obrigatorio
                    ? { texto: "⚠️ Pendente", cor: "#DC2626" }
                    : { texto: "— Opcional (não enviado)", cor: "#9CA3AF" };
                  return (
                    <div key={d.tipo_documento} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-gray-50">
                      <span className="text-gray-700">
                        <span className="text-gray-400">{index + 1}.</span> {d.label}
                        {!d.obrigatorio && <span className="text-gray-400"> (opcional)</span>}
                      </span>
                      <span style={{ color: status.cor, fontWeight: 600, whiteSpace: "nowrap" }}>{status.texto}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="btn-outline inline-block cursor-pointer text-center w-full">
                + Selecionar arquivos PDF
                <input
                  type="file" accept="application/pdf" multiple className="hidden"
                  onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleSelecionar(e.target.files); e.target.value = ""; }}
                />
              </label>
            </div>

            {staged.length > 0 && (
              <div className="space-y-2">
                {staged.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-3" style={conflitosStaged.has(item.id) ? { borderColor: "#FCA5A5", background: "#FEF2F2" } : undefined}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs text-gray-600 truncate flex-1" title={item.file.name}>{item.file.name}</span>
                      <button onClick={() => handleRemoverStaged(item.id)} className="text-xs" style={{ color: "#DC2626" }}>Remover</button>
                    </div>
                    <select
                      value={item.tipo}
                      onChange={(e) => handleTipoChange(item.id, e.target.value as TipoDocumentoContabilidade | "")}
                      className="input-field text-sm"
                    >
                      <option value="">Selecione o tipo do documento...</option>
                      {DOCUMENTOS_CONTABILIDADE.map((def) => (
                        <option key={def.tipo_documento} value={def.tipo_documento}>{def.label}</option>
                      ))}
                    </select>
                    {conflitosStaged.has(item.id) && (
                      <p className="text-xs mt-1" style={{ color: "#DC2626" }}>
                        ⚠️ Mais de um arquivo deste lote está marcado com o mesmo tipo — corrija antes de enviar.
                      </p>
                    )}
                    {!item.tipo && !conflitosStaged.has(item.id) && (
                      <p className="text-xs mt-1" style={{ color: "#B45309" }}>
                        Não foi possível identificar o tipo pelo nome do arquivo — selecione manualmente.
                      </p>
                    )}
                    {item.erro && <p className="text-xs mt-1" style={{ color: "#DC2626" }}>{item.erro}</p>}
                  </div>
                ))}
                <button
                  onClick={handleEnviarStaged}
                  disabled={!podeEnviarStaged || enviandoStaged}
                  className="btn-primary w-full"
                  style={{ opacity: !podeEnviarStaged || enviandoStaged ? 0.5 : 1 }}
                >
                  {enviandoStaged ? "Enviando..." : `Enviar ${staged.length} arquivo${staged.length > 1 ? "s" : ""}`}
                </button>
              </div>
            )}

            {erroStaged && <p className="text-xs" style={{ color: "#DC2626" }}>{erroStaged}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={onClose} className="btn-outline">Cancelar</button>
              <button onClick={() => setEtapa(2)} className="btn-primary">Avançar</button>
            </div>
          </div>
        )}

        {etapa === 2 && (
          <div className="p-6 space-y-4">
            {faltando.length > 0 ? (
              <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEF2F2", color: "#991B1B" }}>
                ⚠️ Faltam documentos obrigatórios: {labelsFaltando.join(", ")}. Volte e envie-os antes de continuar.
              </div>
            ) : (
              <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#F0FDF4", color: "#166534" }}>
                ✅ Todos os documentos obrigatórios foram confirmados.
              </div>
            )}

            <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
              ⚠️ O candidato receberá um e-mail da Clicksign com o link para assinar o pacote da contabilidade.
              Confirme os dados antes de continuar.
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome do candidato</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail do candidato</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input-field" />
            </div>

            {erroFinal && <p className="text-xs" style={{ color: "#DC2626" }}>{erroFinal}</p>}

            <div className="flex justify-between gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setEtapa(1)} className="btn-outline">Voltar</button>
              <button
                onClick={handleMontarEnviar}
                disabled={!podeEnviarFinal || enviandoFinal}
                className="btn-primary"
                style={{ opacity: !podeEnviarFinal || enviandoFinal ? 0.5 : 1 }}
              >
                {enviandoFinal ? "Montando e enviando..." : "Montar e enviar para assinatura"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
