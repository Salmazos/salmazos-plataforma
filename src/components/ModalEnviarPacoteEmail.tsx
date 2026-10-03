"use client";

import { useEffect, useState } from "react";
import { montarLinhasDados, formatarDataHoraBR, formatarMB, type DadosEmailPacote, type LinhaDado } from "@/lib/emailPacoteContabilidade";

interface Preview {
  assunto: string;
  saudacao: string;
  linhas: LinhaDado[];
  para: string[];
  cc: string[];
  remetente: string;
  pdfExiste: boolean;
  nomeAnexo: string;
  tamanhoPdfBytes: number | null;
  limiteAnexoBytes: number;
  tempoContratoSugerido: string;
  avisos: string[];
  avisoCc: string | null;
  ultimoEnvio: { em: string; por_nome: string | null; para: string | null } | null;
}

interface Props {
  admissaoId: string;
  onClose: () => void;
  onEnviado: (mensagem: string) => void;
}

// Modal "Enviar por e-mail" do pacote para a contabilidade. Mostra tudo que será enviado e exige
// confirmação explícita. O tempo de contrato editado aqui vale só para este e-mail.
export default function ModalEnviarPacoteEmail({ admissaoId, onClose, onEnviado }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [tempoContrato, setTempoContrato] = useState("");
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
        setTempoContrato(json.tempoContratoSugerido ?? "");
      } catch {
        if (!cancelado) setErro("Erro de conexão ao carregar a pré-visualização.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [admissaoId]);

  // A prévia do corpo reflete o tempo de contrato digitado (mesmos helpers puros do servidor).
  const linhasPrevia: LinhaDado[] = preview
    ? montarLinhasDados(linhasParaDados(preview.linhas, tempoContrato || preview.tempoContratoSugerido))
    : [];

  const jaEnviado = !!preview?.ultimoEnvio;
  const passaDoLimite = !!preview && preview.tamanhoPdfBytes !== null && preview.tamanhoPdfBytes > preview.limiteAnexoBytes;
  const semDestinatario = !!preview && preview.para.length === 0;
  const podeEnviar = !!preview && preview.pdfExiste && !semDestinatario && !passaDoLimite && confirmou && (!jaEnviado || reenviar) && !enviando;

  async function enviar() {
    if (!podeEnviar) return;
    setEnviando(true); setErro("");
    try {
      const res = await fetch(`/api/admissoes/${admissaoId}/pacote/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempoContrato: tempoContrato.trim() || undefined, reenviar: jaEnviado ? reenviar : false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 400 (sem pacote/destinatário), 409 (envio recente), 413 (anexo grande) e demais vêm com mensagem pronta.
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Enviar pacote por e-mail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        {carregando ? (
          <p className="text-sm text-gray-500">Carregando pré-visualização...</p>
        ) : !preview ? (
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
              <p><b>Assunto:</b> {preview.assunto}</p>
              <p>
                <b>Anexo:</b> {preview.nomeAnexo}
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

            {preview.avisos.length > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-900">
                <p className="font-semibold mb-1">⚠️ Campos faltando (as linhas correspondentes não vão no e-mail):</p>
                <ul className="list-disc ml-4">{preview.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tempo de contrato</label>
              <input className="input-field" value={tempoContrato} onChange={(e) => setTempoContrato(e.target.value)} maxLength={200} />
              <p className="text-xs text-gray-400 mt-1">Vale só para este e-mail — não altera o cadastro do candidato.</p>
            </div>

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

// A prévia recompõe as linhas a partir das que o servidor mandou, trocando só o "Tempo de Contrato".
// (montarLinhasDados exige o objeto de dados; reconstruímos a partir das linhas já formatadas.)
function linhasParaDados(linhas: LinhaDado[], tempoContrato: string): DadosEmailPacote {
  const v = (rotulo: string) => linhas.find((l) => l.rotulo === rotulo)?.valor ?? "";
  const data = v("Data de início");
  const [d, m, a] = data.split("/");
  return {
    empresa: v("Empresa"),
    cliente: v("Cliente"),
    dataInicio: a ? `${a}-${m}-${d}` : null,
    nome: v("Nome"),
    funcao: v("Função"),
    salario: v("Salário"),
    horario: v("Horário"),
    telefone: v("Telefone"),
    tempoContrato,
  };
}
