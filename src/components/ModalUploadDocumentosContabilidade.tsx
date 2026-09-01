"use client";

import { useEffect, useState } from "react";
import {
  DOCUMENTOS_CONTABILIDADE,
  documentosObrigatorios,
  inferirTipoDocumentoContabilidade,
  type TipoDocumentoContabilidade,
  type DocumentoObrigatoriedade,
} from "@/lib/contabilidadeDocumentosMatch";
import type { AdmissaoDocumentoContabilidade } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  admissaoId: string;
  // Cliente da vaga desta admissão — filtra os documentos condicionais por cliente (ex:
  // os 2 termos exclusivos da Novacki), sem afetar os 7 padrão. Ver documentosParaCliente.
  clienteId: string | null;
  documentosIniciais: AdmissaoDocumentoContabilidade[];
  nomeInicial: string;
  emailInicial: string;
  // Se já existe envelope de assinatura do pacote da contabilidade pra esta admissão —
  // enquanto existir, documentos já enviados não podem mais ser substituídos (o PDF final
  // já foi montado a partir do que estava lá). Vem de admissao_envelopes_assinatura via
  // AdmissaoDetalheClient, sem precisar de fetch extra aqui.
  envelopeExiste: boolean;
  onEnviado: () => void;
}

// Linha de confirmação exibida quando o keyword-matching (contabilidadeDocumentosMatch.ts)
// diverge do tipo esperado pela linha em que o arquivo foi solto, ou não reconhece o
// arquivo — nunca decide "no escuro", sempre pede confirmação explícita antes de subir.
interface ConfirmacaoPendente {
  tipoLinha: TipoDocumentoContabilidade;
  tipoDetectado: TipoDocumentoContabilidade | null;
  file: File;
}

type StatusLinha = "locked" | "pending" | "uploading" | "done" | "pulado";

const TAMANHO_MAX = 15 * 1024 * 1024; // 15MB

function labelDoTipo(tipo: TipoDocumentoContabilidade): string {
  return DOCUMENTOS_CONTABILIDADE.find((d) => d.tipo_documento === tipo)?.label ?? tipo;
}

async function enviarArquivoContabilidade(
  admissaoId: string,
  tipo: TipoDocumentoContabilidade,
  file: File
): Promise<{ ok: true; documento: AdmissaoDocumentoContabilidade } | { ok: false; erro: string }> {
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

    return { ok: true, documento: confirmJson.data as AdmissaoDocumentoContabilidade };
  } catch {
    return { ok: false, erro: "Erro de conexão. Tente novamente." };
  }
}

async function visualizarArquivoContabilidade(
  admissaoId: string,
  tipo: TipoDocumentoContabilidade
): Promise<{ ok: true; signedUrl: string } | { ok: false; erro: string }> {
  try {
    const res = await fetch(`/api/admissoes/${admissaoId}/documentos-contabilidade/${tipo}`);
    const json = await res.json();
    if (!res.ok) return { ok: false, erro: json.error || "Erro ao gerar visualização." };
    return { ok: true, signedUrl: json.signedUrl };
  } catch {
    return { ok: false, erro: "Erro de conexão. Tente novamente." };
  }
}

// Upload SEQUENCIAL, uma linha por vez, dos 7 documentos que a contabilidade prepara
// (Ficha de Registro, Modelo Contrato, Acordo de HS/Decl VT, Termo LGPD, Ficha de IR,
// Salário Família, Termo de Responsabilidade) — substituiu o antigo botão único de
// seleção múltipla (risco de upload errado/fora de ordem com lotes grandes). Os 4
// primeiros destravam um de cada vez, na ordem fixa da lista.
// Os 3 últimos NÃO são "opcionais soltos" — regra real do negócio: o pacote da
// contabilidade sempre tem 4 documentos OU 7, nunca uma quantidade intermediária (ex:
// não existe pacote só com o 5º, ou só com 5º+6º sem o 7º). Por isso só o 5º (Ficha de
// IR) tem escolha real de "enviar ou pular" — é o único ponto de decisão, e essa decisão
// vale pro grupo inteiro: pular o 5º pula os outros 2 juntos (pacote de 4); enviar o 5º
// destrava o 6º e o 7º como obrigatórios sequenciais, padronizados igual aos 4
// primeiros (sem botão de pular individual neles).
// O keyword-matching (contabilidadeDocumentosMatch.ts) deixou de ser detecção em lote e
// virou CONFIRMAÇÃO por linha: ao soltar um arquivo numa linha específica, comparamos o
// tipo detectado pelo nome com o tipo esperado da linha — só pedimos confirmação extra
// quando diverge ou não reconhece; nunca decide "no escuro".
// Etapa 1 = upload/conferência; etapa 2 = validação de completude dos 4 fixos + confirmação
// de nome/e-mail antes de montar o PDF final e enviar pra assinatura eletrônica — mesmo
// padrão de revisão-antes-de-disparar-algo-irreversível do ModalAssinaturaEletronica.
export default function ModalUploadDocumentosContabilidade({
  isOpen,
  onClose,
  admissaoId,
  clienteId,
  documentosIniciais,
  nomeInicial,
  emailInicial,
  envelopeExiste,
  onEnviado,
}: Props) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [documentos, setDocumentos] = useState<AdmissaoDocumentoContabilidade[]>(documentosIniciais);
  // Decisão única, no 5º documento (Ficha de IR): pula o grupo inteiro dos 3 opcionais
  // (pacote fica só com os 4 obrigatórios) — ver comentário acima do componente.
  const [pulouOpcionais, setPulouOpcionais] = useState(false);
  const [enviandoTipo, setEnviandoTipo] = useState<TipoDocumentoContabilidade | null>(null);
  const [erroPorTipo, setErroPorTipo] = useState<Partial<Record<TipoDocumentoContabilidade, string>>>({});
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<ConfirmacaoPendente | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviandoFinal, setEnviandoFinal] = useState(false);
  const [erroFinal, setErroFinal] = useState("");
  const [substituindoTipo, setSubstituindoTipo] = useState<TipoDocumentoContabilidade | null>(null);
  const [visualizandoTipo, setVisualizandoTipo] = useState<TipoDocumentoContabilidade | null>(null);

  // Ver bloqueio de segurança em montar-enviar/route.ts: só quem tem cargo de diretoria
  // pode assinar pela empresa via ZapSign — quem não é diretor precisa escolher um
  // diretor ativo aqui antes de conseguir enviar.
  const [carregandoAssinantes, setCarregandoAssinantes] = useState(false);
  const [souDiretor, setSouDiretor] = useState<boolean | null>(null);
  const [diretores, setDiretores] = useState<{ id: string; nome_completo: string; cargo: string }[]>([]);
  const [diretorSelecionadoId, setDiretorSelecionadoId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setEtapa(1);
    setDocumentos(documentosIniciais);
    setPulouOpcionais(false);
    setEnviandoTipo(null);
    setErroPorTipo({});
    setConfirmacaoPendente(null);
    setNome(nomeInicial);
    setEmail(emailInicial);
    setErroFinal("");
    setSubstituindoTipo(null);
    setVisualizandoTipo(null);
    setSouDiretor(null);
    setDiretores([]);
    setDiretorSelecionadoId("");
  }, [isOpen, documentosIniciais, nomeInicial, emailInicial]);

  useEffect(() => {
    if (!isOpen) return;
    setCarregandoAssinantes(true);
    fetch("/api/admissoes/documentos-contabilidade/diretores-disponiveis")
      .then((res) => res.json())
      .then((json) => {
        setSouDiretor(!!json.souDiretor);
        setDiretores(Array.isArray(json.diretores) ? json.diretores : []);
      })
      .catch(() => setSouDiretor(false))
      .finally(() => setCarregandoAssinantes(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const listaCompleta = documentosObrigatorios(clienteId);
  const faltando = listaCompleta.filter((d) => d.obrigatorio && !documentos.some((doc) => doc.tipo_documento === d.tipo_documento));
  const labelsFaltando = faltando.map((d) => d.label);
  const podeEnviarFinal = faltando.length === 0 && nome.trim().length > 0 && email.trim().length > 0;

  const estaConfirmado = (tipo: TipoDocumentoContabilidade) => documentos.some((doc) => doc.tipo_documento === tipo);
  // Só os 4 documentos base destravam os opcionais (Ficha de IR/Salário Família/Termo de
  // Responsabilidade) — documentos condicionais de cliente (ex: os 2 da Novacki) não têm
  // relação com esse grupo e não podem bloqueá-lo (bug real, corrigido a partir do caso
  // da admissão 0721b031-9ed5-4a70-9d93-0b79aa6268e2).
  const obrigatoriosBaseOk = listaCompleta
    .filter((d) => d.obrigatorio && !d.cliente_id)
    .every((d) => estaConfirmado(d.tipo_documento));
  // Todos os obrigatórios (base + condicionais de cliente) — continua exigido pra avançar
  // pra etapa 2 e pro envio final.
  const todosObrigatoriosOk = listaCompleta.filter((d) => d.obrigatorio).every((d) => estaConfirmado(d.tipo_documento));
  const opcionais = listaCompleta.filter((d) => !d.obrigatorio); // [Ficha de IR, Salário Família, Termo de Responsabilidade]
  const primeiroOpcional = opcionais[0];
  // O grupo "iniciou" assim que o 5º (Ficha de IR) é confirmado — a partir daí os outros
  // 2 são obrigatórios, não têm mais opção de pular individualmente.
  const grupoOpcionalIniciado = primeiroOpcional ? estaConfirmado(primeiroOpcional.tipo_documento) : false;
  const opcionaisResolvidos = pulouOpcionais || opcionais.every((d) => estaConfirmado(d.tipo_documento));
  const podeAvancarEtapa1 = todosObrigatoriosOk && opcionaisResolvidos;

  // Trava sequencial: obrigatório só destrava depois do obrigatório anterior confirmado.
  // Nos opcionais, só o 1º (Ficha de IR) tem decisão real de enviar/pular; se ele foi
  // enviado, o 2º e o 3º viram obrigatórios sequenciais (mesma trava dos 4 primeiros); se
  // ele foi pulado, os outros 2 ficam resolvidos junto (pacote de 4 documentos).
  function statusLinha(def: DocumentoObrigatoriedade, index: number): StatusLinha {
    if (estaConfirmado(def.tipo_documento)) return "done";
    if (enviandoTipo === def.tipo_documento) return "uploading";
    if (def.obrigatorio) {
      const anteriores = listaCompleta.slice(0, index).filter((d) => d.obrigatorio);
      const anterioresOk = anteriores.every((d) => estaConfirmado(d.tipo_documento));
      return anterioresOk ? "pending" : "locked";
    }
    if (!obrigatoriosBaseOk) return "locked";
    const indexOpcional = opcionais.findIndex((o) => o.tipo_documento === def.tipo_documento);
    if (indexOpcional === 0) return pulouOpcionais ? "pulado" : "pending";
    if (pulouOpcionais) return "pulado";
    if (!grupoOpcionalIniciado) return "locked";
    const anterioresOpcionais = opcionais.slice(0, indexOpcional);
    const anterioresOk = anterioresOpcionais.every((o) => estaConfirmado(o.tipo_documento));
    return anterioresOk ? "pending" : "locked";
  }

  // Os 7 tipos já têm posição calibrada na tabela fixa (ver lib/zapsignPosicoes.ts) — só
  // informativo agora, não bloqueia mais nada.
  const opcionaisPresentes = listaCompleta.filter(
    (d) => !d.obrigatorio && documentos.some((doc) => doc.tipo_documento === d.tipo_documento)
  );
  const labelsOpcionaisPresentes = opcionaisPresentes.map((d) => d.label);

  // Seletor de "quem assina pela empresa" só aparece quando o operador não é diretor.
  const precisaSelecionarContratante = souDiretor === false;
  const semDiretorDisponivel = precisaSelecionarContratante && diretores.length === 0;
  const podeEnviarFinalComContratante =
    podeEnviarFinal &&
    souDiretor !== null &&
    (!precisaSelecionarContratante || (!semDiretorDisponivel && diretorSelecionadoId !== ""));

  const processarUploadLinha = async (tipo: TipoDocumentoContabilidade, file: File) => {
    setErroPorTipo((prev) => {
      const next = { ...prev };
      delete next[tipo];
      return next;
    });
    setEnviandoTipo(tipo);
    const resultado = await enviarArquivoContabilidade(admissaoId, tipo, file);
    if (!resultado.ok) {
      setErroPorTipo((prev) => ({ ...prev, [tipo]: resultado.erro }));
    } else {
      setDocumentos((prev) => {
        const semEsseTipo = prev.filter((d) => d.tipo_documento !== tipo);
        return [...semEsseTipo, resultado.documento];
      });
      // Se o 5º tinha sido pulado e o usuário mudou de ideia e enviou um arquivo pra ele,
      // isso reabre o grupo inteiro (6º e 7º voltam a ser obrigatórios).
      setPulouOpcionais((prev) => (prev ? false : prev));
    }
    setEnviandoTipo(null);
    setSubstituindoTipo(null);
  };

  const handleVisualizarLinha = async (tipo: TipoDocumentoContabilidade) => {
    setErroPorTipo((prev) => {
      const next = { ...prev };
      delete next[tipo];
      return next;
    });
    setVisualizandoTipo(tipo);
    const resultado = await visualizarArquivoContabilidade(admissaoId, tipo);
    if (!resultado.ok) {
      setErroPorTipo((prev) => ({ ...prev, [tipo]: resultado.erro }));
    } else {
      window.open(resultado.signedUrl, "_blank");
    }
    setVisualizandoTipo(null);
  };

  // Keyword-matching agora só CONFIRMA — roda contra o único arquivo desta linha e compara
  // com o tipo esperado dela. Bateu = segue direto; não bateu ou não reconheceu = pede
  // confirmação explícita antes de subir (ver modal de confirmação no JSX).
  const handleSelecionarParaLinha = (def: DocumentoObrigatoriedade, files: FileList) => {
    const file = files[0];
    if (!file) return;
    if (file.size > TAMANHO_MAX) {
      setErroPorTipo((prev) => ({ ...prev, [def.tipo_documento]: `"${file.name}" é maior que 15MB.` }));
      return;
    }
    const detectado = inferirTipoDocumentoContabilidade(file.name, clienteId);
    if (detectado === def.tipo_documento) {
      processarUploadLinha(def.tipo_documento, file);
    } else {
      setConfirmacaoPendente({ tipoLinha: def.tipo_documento, tipoDetectado: detectado, file });
    }
  };

  const handlePularOpcionais = () => setPulouOpcionais(true);

  const handleMontarEnviar = async () => {
    if (!podeEnviarFinalComContratante) return;
    setEnviandoFinal(true);
    setErroFinal("");
    try {
      const res = await fetch(`/api/admissoes/${admissaoId}/documentos-contabilidade/montar-enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCandidato: nome.trim(),
          emailCandidato: email.trim(),
          ...(precisaSelecionarContratante ? { contratanteSelecionadoId: diretorSelecionadoId } : {}),
        }),
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
              Envie um PDF por vez, na ordem das linhas abaixo. O pacote da contabilidade sempre vem com 4 documentos
              ou com 7 — nunca uma quantidade intermediária. Por isso só a Ficha de IR tem escolha de enviar ou pular;
              se ela vier, a Ficha de Salário Família e o Termo de Responsabilidade passam a ser obrigatórios também.
            </div>

            <div className="space-y-2">
              {listaCompleta.map((d, index) => {
                const status = statusLinha(d, index);
                const ehPrimeiroOpcional = !d.obrigatorio && primeiroOpcional?.tipo_documento === d.tipo_documento;
                const info: { texto: string; cor: string } = (() => {
                  switch (status) {
                    case "locked":
                      if (d.obrigatorio) return { texto: "⏳ Aguardando documento anterior", cor: "#9CA3AF" };
                      if (!obrigatoriosBaseOk) return { texto: "⏳ Aguardando obrigatórios", cor: "#9CA3AF" };
                      return { texto: "⏳ Aguardando decisão da Ficha de IR", cor: "#9CA3AF" };
                    case "pending":
                      if (ehPrimeiroOpcional) return { texto: "— Envie ou pule (define os 2 últimos)", cor: "#B45309" };
                      return { texto: "⚠️ Pendente", cor: "#DC2626" };
                    case "uploading":
                      return { texto: "Enviando...", cor: "#2563EB" };
                    case "done":
                      return { texto: "✅ Enviado", cor: "#16A34A" };
                    case "pulado":
                      return { texto: "— Não enviado", cor: "#9CA3AF" };
                  }
                })();
                return (
                  <div
                    key={d.tipo_documento}
                    className="border border-gray-200 rounded-lg p-3"
                    style={status === "locked" ? { opacity: 0.6 } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">
                        <span className="text-gray-400">{index + 1}.</span> {d.label}
                      </span>
                      <span style={{ color: info.cor, fontWeight: 600, whiteSpace: "nowrap" }}>{info.texto}</span>
                    </div>

                    {(status === "pending" || (status === "pulado" && ehPrimeiroOpcional)) && (
                      <div className="flex items-center gap-3 mt-2">
                        <label className="btn-outline text-xs cursor-pointer inline-block px-3 py-1.5">
                          {status === "pulado" ? "Enviar arquivo" : "Selecionar arquivo PDF"}
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) handleSelecionarParaLinha(d, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {ehPrimeiroOpcional && status === "pending" && (
                          <button onClick={handlePularOpcionais} className="text-xs" style={{ color: "#9CA3AF" }}>
                            Pular
                          </button>
                        )}
                      </div>
                    )}

                    {status === "done" && (
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => handleVisualizarLinha(d.tipo_documento)}
                          disabled={visualizandoTipo === d.tipo_documento}
                          className="btn-outline text-xs px-3 py-1.5"
                          style={{ opacity: visualizandoTipo === d.tipo_documento ? 0.5 : 1 }}
                        >
                          {visualizandoTipo === d.tipo_documento ? "Abrindo..." : "Visualizar"}
                        </button>
                        {envelopeExiste ? (
                          <span className="text-xs" style={{ color: "#9CA3AF" }}>
                            Pacote já enviado para assinatura — não é mais possível substituir
                          </span>
                        ) : substituindoTipo === d.tipo_documento ? (
                          <label className="btn-outline text-xs cursor-pointer inline-block px-3 py-1.5">
                            Selecionar novo PDF
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) handleSelecionarParaLinha(d, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        ) : (
                          <button
                            onClick={() => setSubstituindoTipo(d.tipo_documento)}
                            className="text-xs"
                            style={{ color: "#B45309" }}
                          >
                            Substituir
                          </button>
                        )}
                      </div>
                    )}

                    {erroPorTipo[d.tipo_documento] && (
                      <p className="text-xs mt-2" style={{ color: "#DC2626" }}>{erroPorTipo[d.tipo_documento]}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={onClose} className="btn-outline">Cancelar</button>
              <button
                onClick={() => setEtapa(2)}
                disabled={!podeAvancarEtapa1}
                className="btn-primary"
                style={{ opacity: !podeAvancarEtapa1 ? 0.5 : 1 }}
              >
                Avançar
              </button>
            </div>
          </div>
        )}

        {confirmacaoPendente && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setConfirmacaoPendente(null)}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-gray-800 mb-2">
                {confirmacaoPendente.tipoDetectado ? (
                  <>
                    Este arquivo parece ser <strong>&quot;{labelDoTipo(confirmacaoPendente.tipoDetectado)}&quot;</strong>, mas
                    você está enviando como <strong>&quot;{labelDoTipo(confirmacaoPendente.tipoLinha)}&quot;</strong>. Confirma
                    mesmo assim?
                  </>
                ) : (
                  <>
                    Não conseguimos identificar que tipo de documento é este arquivo. Confirma que é o{" "}
                    <strong>&quot;{labelDoTipo(confirmacaoPendente.tipoLinha)}&quot;</strong>?
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 mb-4 truncate" title={confirmacaoPendente.file.name}>
                Arquivo: {confirmacaoPendente.file.name}
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmacaoPendente(null)} className="btn-outline">Cancelar</button>
                <button
                  onClick={() => {
                    processarUploadLinha(confirmacaoPendente.tipoLinha, confirmacaoPendente.file);
                    setConfirmacaoPendente(null);
                  }}
                  className="btn-primary"
                >
                  Confirmar mesmo assim
                </button>
              </div>
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

            {opcionaisPresentes.length > 0 && (
              <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#EFF6FF", color: "#1E40AF" }}>
                ℹ️ Este pacote inclui {labelsOpcionaisPresentes.join(", ")} — posição já calibrada, será assinado
                normalmente junto com o resto.
              </div>
            )}

            <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
              ⚠️ O candidato receberá um e-mail da ZapSign com o link para assinar o pacote da contabilidade.
              Confirme os dados antes de continuar.
            </div>

            {carregandoAssinantes && (
              <div className="rounded-lg p-3 text-xs" style={{ background: "#F3F4F6", color: "#374151" }}>
                Verificando quem pode assinar pela empresa...
              </div>
            )}

            {!carregandoAssinantes && semDiretorDisponivel && (
              <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: "#FEF2F2", color: "#991B1B" }}>
                ⚠️ Nenhum diretor disponível para assinatura — contate o administrador.
              </div>
            )}

            {!carregandoAssinantes && precisaSelecionarContratante && !semDiretorDisponivel && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Quem vai assinar pela empresa?
                </label>
                <select
                  value={diretorSelecionadoId}
                  onChange={(e) => setDiretorSelecionadoId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Selecione um diretor...</option>
                  {diretores.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome_completo} — {d.cargo}</option>
                  ))}
                </select>
              </div>
            )}

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
                disabled={!podeEnviarFinalComContratante || enviandoFinal}
                className="btn-primary"
                style={{ opacity: !podeEnviarFinalComContratante || enviandoFinal ? 0.5 : 1 }}
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
