"use client";

import { useEffect, useMemo, useState } from "react";
import {
  avisosCamposFaltando, formatarDataHoraBR, formatarMB, interpretarValorBR, listarCamposEditados, montarAssuntoDeCampos,
  montarLinhasDeCampos, nomeArquivoAnexo, numeroParaBR, validarCamposEmail,
  type CamposEmailContabilidade, type NomeCampoEmail,
} from "@/lib/emailPacoteContabilidade";

interface Preview {
  assunto: string;
  saudacao: string;
  para: string[];
  cc: string[];
  remetente: string;
  pdfExiste: boolean;
  nomeAnexo: string;
  tamanhoPdfBytes: number | null;
  limiteAnexoBytes: number;
  tempoContratoSugerido: string;
  tempoContratoPadrao: string;
  campos: CamposEmailContabilidade;
  empresa: string;
  cliente: string;
  avisoCc: string | null;
  ultimoEnvio: { em: string; por_nome: string | null; para: string | null } | null;
}

interface Props {
  admissaoId: string;
  onClose: () => void;
  onEnviado: (mensagem: string) => void;
}

// Estado do formulário: tudo texto, como digitado (salário em formato brasileiro, ex.: "1.800,00").
interface Form {
  nome: string;
  funcao: string;
  dataInicio: string;
  salarioTxt: string;
  salarioTipo: "hora" | "mensal";
  horario: string;
  telefone: string;
  tempoContrato: string;
}

function formDoCadastro(c: CamposEmailContabilidade): Form {
  return {
    nome: c.nome, funcao: c.funcao, dataInicio: c.dataInicio, salarioTxt: numeroParaBR(c.salarioValor),
    salarioTipo: c.salarioTipo ?? "mensal", horario: c.horario, telefone: c.telefone, tempoContrato: c.tempoContrato,
  };
}

function camposDoForm(f: Form) {
  return {
    nome: f.nome, funcao: f.funcao, dataInicio: f.dataInicio, horario: f.horario, telefone: f.telefone, tempoContrato: f.tempoContrato,
    salarioValor: interpretarValorBR(f.salarioTxt), // NaN = inválido (a validação acusa)
    salarioTipo: f.salarioTipo,
  };
}

// Modal "Enviar por e-mail" do pacote para a contabilidade. Os campos podem ser corrigidos aqui, mas as
// correções valem SÓ para este e-mail: o servidor não grava nada no cadastro e monta o corpo por conta própria.
export default function ModalEnviarPacoteEmail({ admissaoId, onClose, onEnviado }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmou, setConfirmou] = useState(false);
  const [reenviar, setReenviar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/admissoes/${admissaoId}/pacote/enviar-email`);
        const json = await res.json();
        if (cancelado) return;
        if (!res.ok) { setErro(json.error || "Não foi possível carregar a pré-visualização."); return; }
        setPreview(json);
        setForm(formDoCadastro(json.campos));
      } catch {
        if (!cancelado) setErro("Erro de conexão ao carregar a pré-visualização.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [admissaoId]);

  // Tudo abaixo sai das mesmas funções puras que o servidor usa (única fonte da verdade).
  const validacao = useMemo(() => (form ? validarCamposEmail(camposDoForm(form)) : null), [form]);
  const campos = validacao?.camposNormalizados ?? null;
  const editados = useMemo<Set<NomeCampoEmail>>(
    () => (preview && campos ? new Set(listarCamposEditados(preview.campos, campos)) : new Set()),
    [preview, campos]
  );
  const linhasPrevia = preview && campos ? montarLinhasDeCampos(campos, preview.empresa, preview.cliente, preview.tempoContratoPadrao) : [];
  const assunto = campos ? montarAssuntoDeCampos(campos) : "";
  const avisos = preview && campos ? avisosCamposFaltando(campos, preview.empresa, preview.cliente) : [];

  const jaEnviado = !!preview?.ultimoEnvio;
  const passaDoLimite = !!preview && preview.tamanhoPdfBytes !== null && preview.tamanhoPdfBytes > preview.limiteAnexoBytes;
  const semDestinatario = !!preview && preview.para.length === 0;
  const formValido = !!validacao?.ok;
  const podeEnviar = !!preview && preview.pdfExiste && !semDestinatario && !passaDoLimite && formValido && confirmou && (!jaEnviado || reenviar) && !enviando;

  const set = (k: keyof Form, v: string) => setForm((p) => (p ? { ...p, [k]: v } : p));
  const estilo = (nome: NomeCampoEmail): React.CSSProperties | undefined =>
    editados.has(nome) ? { borderColor: "#F59E0B", background: "#FFFBEB" } : undefined;
  const selo = (nome: NomeCampoEmail) =>
    editados.has(nome) ? <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 normal-case">editado</span> : null;

  async function enviar() {
    if (!podeEnviar || !campos) return;
    setEnviando(true); setErro("");
    try {
      const res = await fetch(`/api/admissoes/${admissaoId}/pacote/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O servidor valida, normaliza e monta o corpo de novo: aqui só vão os campos, nunca HTML.
        body: JSON.stringify({ campos, reenviar: jaEnviado ? reenviar : false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 400 (sem pacote/destinatário/campos inválidos), 409 (envio recente), 413 (anexo grande) e demais vêm com mensagem pronta.
        setErro(json.error || "Não foi possível enviar o e-mail.");
        return;
      }
      onEnviado(json.aviso ? `⚠️ ${json.aviso}` : "✅ Pacote enviado por e-mail para a contabilidade.");
    } catch {
      setErro("Erro de conexão ao enviar. Verifique antes de tentar de novo — o e-mail pode ter saído.");
    } finally {
      setEnviando(false);
    }
  }

  const rotulo = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Enviar pacote por e-mail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        {carregando ? (
          <p className="text-sm text-gray-500">Carregando pré-visualização...</p>
        ) : !preview || !form || !validacao ? (
          <p className="text-sm text-red-600">{erro}</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              🔒 O pacote contém documentos pessoais do candidato (LGPD). Confirme os destinatários antes de enviar.
            </div>

            <div>
              <p><b>Para:</b> {preview.para.length > 0 ? preview.para.join(", ") : <span className="text-red-600">nenhum destinatário ativo (configure em Configurações &gt; Avisos &gt; E-mail da contabilidade)</span>}</p>
              <p><b>Cc:</b> {preview.cc.join(", ")}</p>
              <p><b>De:</b> {preview.remetente}</p>
              <p><b>Assunto:</b> {assunto}</p>
              <p>
                <b>Anexo:</b> {campos ? nomeArquivoAnexo(campos.nome) : preview.nomeAnexo}
                {preview.tamanhoPdfBytes !== null ? ` (${formatarMB(preview.tamanhoPdfBytes)} MB)` : " (tamanho não identificado)"}
              </p>
            </div>

            {passaDoLimite && preview.tamanhoPdfBytes !== null && (
              <p className="text-red-600 text-xs font-semibold">
                O pacote tem {formatarMB(preview.tamanhoPdfBytes)} MB e passa do limite de 15 MB para e-mail. Baixe o PDF e envie manualmente.
              </p>
            )}
            {!preview.pdfExiste && <p className="text-red-600 text-xs font-semibold">O pacote ainda não foi gerado.</p>}

            {preview.avisoCc && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-900 font-semibold">⚠️ {preview.avisoCc}</div>
            )}

            {/* Dados do e-mail: editáveis; Empresa e Cliente são fixos (vêm do cadastro). */}
            <div className="rounded-lg border border-gray-200 px-3 py-3 space-y-3">
              <p className="text-xs text-gray-500"><b>Empresa:</b> {preview.empresa || "—"} &nbsp;·&nbsp; <b>Cliente:</b> {preview.cliente || "—"} <span className="text-gray-400">(não editáveis)</span></p>

              <div>
                <label className={rotulo}>Nome{selo("nome")}</label>
                <input className="input-field" style={estilo("nome")} value={form.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={rotulo}>Função{selo("funcao")}</label>
                  <input className="input-field" style={estilo("funcao")} value={form.funcao} onChange={(e) => set("funcao", e.target.value)} maxLength={120} />
                </div>
                <div>
                  <label className={rotulo}>Data de início{selo("dataInicio")}</label>
                  <input type="date" className="input-field" style={estilo("dataInicio")} value={form.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} />
                </div>
                <div>
                  <label className={rotulo}>Salário (R$){selo("salario")}</label>
                  <div className="flex gap-2">
                    <input className="input-field" style={estilo("salario")} inputMode="decimal" placeholder="Ex.: 1.800,00" value={form.salarioTxt} onChange={(e) => set("salarioTxt", e.target.value)} />
                    <select className="input-field" style={{ ...estilo("salario"), maxWidth: 110 }} value={form.salarioTipo} onChange={(e) => set("salarioTipo", e.target.value)}>
                      <option value="mensal">mensal</option>
                      <option value="hora">por hora</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={rotulo}>Horário{selo("horario")}</label>
                  <input className="input-field" style={estilo("horario")} value={form.horario} onChange={(e) => set("horario", e.target.value)} maxLength={200} />
                </div>
                <div>
                  <label className={rotulo}>Telefone{selo("telefone")}</label>
                  <input className="input-field" style={estilo("telefone")} inputMode="tel" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} maxLength={40} />
                </div>
                <div>
                  <label className={rotulo}>Tempo de contrato{selo("tempoContrato")}</label>
                  <input className="input-field" style={estilo("tempoContrato")} value={form.tempoContrato} onChange={(e) => set("tempoContrato", e.target.value)} maxLength={200} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-gray-400">As correções valem só para este e-mail e não alteram o cadastro.</p>
                <button type="button" className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setForm(formDoCadastro(preview.campos))} disabled={editados.size === 0}>
                  Restaurar dados do cadastro
                </button>
              </div>

              {!validacao.ok && (
                <ul className="list-disc ml-4 text-xs text-red-600 font-semibold">{validacao.erros.map((e) => <li key={e}>{e}</li>)}</ul>
              )}
            </div>

            {avisos.length > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-900">
                <p className="font-semibold mb-1">⚠️ Campos faltando (as linhas correspondentes não vão no e-mail):</p>
                <ul className="list-disc ml-4">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3" style={{ fontSize: 13, color: "#111827" }}>
              <p className="mb-2">{preview.saudacao},</p>
              <p className="mb-2">Segue abaixo novas informações para admissão:</p>
              {linhasPrevia.map((l) => (
                <p key={l.rotulo} className="mb-1" style={l.negrito ? { fontWeight: 700 } : undefined}>{l.rotulo}: {l.valor}</p>
              ))}
              <p className="mt-3">Salmazos RH</p>
            </div>

            {jaEnviado && preview.ultimoEnvio && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
                <p>
                  Enviado em {formatarDataHoraBR(preview.ultimoEnvio.em)}
                  {preview.ultimoEnvio.por_nome ? ` por ${preview.ultimoEnvio.por_nome}` : ""}
                  {preview.ultimoEnvio.para ? ` para ${preview.ultimoEnvio.para}` : ""}.
                </p>
                <label className="flex items-center gap-2 mt-2 font-semibold">
                  <input type="checkbox" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} />
                  Reenviar mesmo assim
                </label>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm font-semibold text-gray-800">
              <input type="checkbox" className="mt-1" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} />
              Confirmo que os destinatários estão corretos e quero enviar este pacote por e-mail.
            </label>

            {erro && <p className="text-red-600 text-sm">{erro}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="btn-outline">Cancelar</button>
              <button onClick={enviar} disabled={!podeEnviar} className="btn-primary disabled:opacity-50">
                {enviando ? "Enviando..." : "Enviar e-mail"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
