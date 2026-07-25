import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, admissaoContabilidadeMontarEnviarSchema } from "@/lib/schemas";
import { DOCUMENTOS_CONTABILIDADE, documentosObrigatorios } from "@/lib/contabilidadeDocumentosMatch";
import { criarEnvelopeDeAssinatura } from "@/lib/clicksign";
import { registrarAuditoria } from "@/lib/audit";
import type { AdmissaoDocumentoContabilidade } from "@/types";

interface Params { params: Promise<{ id: string }> }

const BUCKET = "admissao-docs";
const TIPO_PACOTE = "contabilidade" as const;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(admissaoContabilidadeMontarEnviarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { nomeCandidato, emailCandidato } = parsed.data;

  const svc = createServiceClient();

  const { data: admissao, error: admError } = await svc.from("admissoes").select("id").eq("id", id).single();
  if (admError || !admissao) return NextResponse.json({ error: "Admissão não encontrada." }, { status: 404 });

  const { data: envelopeExistente } = await svc
    .from("admissao_envelopes_assinatura")
    .select("id, status")
    .eq("admissao_id", id)
    .eq("tipo_pacote", TIPO_PACOTE)
    .maybeSingle();
  if (envelopeExistente?.status === "pendente") {
    return NextResponse.json(
      { error: "Já existe uma solicitação de assinatura eletrônica em andamento para o pacote da contabilidade desta admissão." },
      { status: 409 }
    );
  }

  const { data: documentos } = await svc.from("admissao_documentos_contabilidade").select("*").eq("admissao_id", id);

  const docs = (documentos ?? []) as AdmissaoDocumentoContabilidade[];
  const docsPorTipo = new Map(docs.map((d) => [d.tipo_documento, d]));

  // Mesma regra usada na tela de conferência (ver contabilidadeDocumentosMatch.ts) —
  // revalidada aqui pra nunca montar/enviar um pacote incompleto, mesmo que a UI tenha
  // deixado passar ou a chamada tenha vindo direto da API. Só os 4 fixos são obrigatórios
  // — Ficha de IR, Salário Família e Termo de Responsabilidade nunca bloqueiam o envio.
  const faltando = documentosObrigatorios().filter((d) => d.obrigatorio && !docsPorTipo.has(d.tipo_documento));
  if (faltando.length > 0) {
    const labelsFaltando = faltando.map((d) => d.label);
    return NextResponse.json(
      { error: `Documentos obrigatórios faltando: ${labelsFaltando.join(", ")}.`, faltando: labelsFaltando },
      { status: 400 }
    );
  }

  // ── Monta o PDF final na ordem fixa dos 7 tipos, pulando os condicionais ausentes ──
  // Mesmo mecanismo de merge já usado em gerar-pdf/route.ts e carta-conta-salario/route.ts:
  // PDFDocument.load + copyPages sobre cada PDF individual já existente.
  const pdfFinal = await PDFDocument.create();
  const naoAnexados: string[] = [];

  for (const def of DOCUMENTOS_CONTABILIDADE) {
    const doc = docsPorTipo.get(def.tipo_documento);
    if (!doc) continue;

    const { data: fileBlob, error: dlError } = await svc.storage.from(BUCKET).download(doc.storage_path);
    if (dlError || !fileBlob) {
      naoAnexados.push(def.label);
      continue;
    }

    try {
      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      const subDoc = await PDFDocument.load(bytes);
      const copiedPages = await pdfFinal.copyPages(subDoc, subDoc.getPageIndices());
      copiedPages.forEach((p) => pdfFinal.addPage(p));
    } catch {
      naoAnexados.push(def.label);
    }
  }

  if (naoAnexados.length > 0) {
    return NextResponse.json(
      { error: `Não foi possível abrir os seguintes arquivos como PDF: ${naoAnexados.join(", ")}. Reenvie-os antes de montar o pacote.` },
      { status: 400 }
    );
  }

  const pdfBytes = await pdfFinal.save();
  const uploadPath = `docs-contabilidade/${id}/pacote-final-${Date.now()}.pdf`;
  const { error: uploadError } = await svc.storage
    .from(BUCKET)
    .upload(uploadPath, Buffer.from(pdfBytes), { contentType: "application/pdf" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // ── Envia pra assinatura eletrônica (mesmo fluxo do pacote interno) ────────────────
  let resultado;
  try {
    // O candidato é o ÚNICO signatário, igual ao pacote interno — a empresa não assina
    // este pacote por aqui.
    resultado = await criarEnvelopeDeAssinatura({
      nomeEnvelope: `Admissão — Contabilidade — ${nomeCandidato}`,
      filename: uploadPath.split("/").pop() || `admissao-contabilidade-${id}.pdf`,
      contentBase64: Buffer.from(pdfBytes).toString("base64"),
      nomeSignatario: nomeCandidato,
      emailSignatario: emailCandidato,
      metadata: { admissao_id: id, tipo_pacote: TIPO_PACOTE },
      // Reforço página-a-página — não existe posicionamento de coordenada da assinatura
      // principal via API da Clicksign (ver nota em lib/clicksign.ts). Os PDFs
      // individuais da contabilidade já vêm com o espaço de assinatura correto.
      rubricaPaginas: "all",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar envelope na Clicksign.";
    console.error("[POST /api/admissoes/[id]/documentos-contabilidade/montar-enviar]", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: upsertError } = await svc
    .from("admissao_envelopes_assinatura")
    .upsert(
      {
        admissao_id: id,
        tipo_pacote: TIPO_PACOTE,
        documento_externo_id: resultado.documentId,
        status: "pendente",
        assinado_em: null,
        path: null,
        provedor: "clicksign",
      },
      { onConflict: "admissao_id,tipo_pacote" }
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_documentos_contabilidade_montado_e_enviado",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: {
      storage_path: uploadPath,
      envelope_id: resultado.envelopeId,
      document_id: resultado.documentId,
      signer_id: resultado.signerId,
      documentos_incluidos: DOCUMENTOS_CONTABILIDADE.filter((d) => docsPorTipo.has(d.tipo_documento)).map((d) => d.label),
    },
  });

  return NextResponse.json({ envelopeId: resultado.envelopeId });
}
