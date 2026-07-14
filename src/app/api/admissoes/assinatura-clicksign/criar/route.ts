import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, assinaturaClicksignCriarSchema } from "@/lib/schemas";
import { criarEnvelopeDeAssinatura } from "@/lib/clicksign";
import { registrarAuditoria } from "@/lib/audit";

const BUCKET = "admissao-docs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(assinaturaClicksignCriarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { admissaoId, pdfPath, nomeCandidato, emailCandidato } = parsed.data;

  const svc = createServiceClient();

  const { data: admissao, error: admError } = await svc
    .from("admissoes")
    .select("id, metodo_assinatura, assinatura_documento_externo_id, assinatura_em")
    .eq("id", admissaoId)
    .single();
  if (admError || !admissao) {
    return NextResponse.json({ error: "Admissão não encontrada." }, { status: 404 });
  }
  if (admissao.assinatura_documento_externo_id && !admissao.assinatura_em) {
    return NextResponse.json(
      { error: "Já existe uma solicitação de assinatura eletrônica em andamento para esta admissão." },
      { status: 409 }
    );
  }

  const { data: pdfBlob, error: dlError } = await svc.storage.from(BUCKET).download(pdfPath);
  if (dlError || !pdfBlob) {
    return NextResponse.json(
      { error: `Não foi possível baixar o PDF em "${pdfPath}": ${dlError?.message ?? "arquivo não encontrado"}.` },
      { status: 400 }
    );
  }

  const contentBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");
  const filename = pdfPath.split("/").pop() || `admissao-${admissaoId}.pdf`;

  let resultado;
  try {
    // O candidato é o ÚNICO signatário — a empresa (Salmazos) nunca assina este pacote
    // por aqui, de propósito.
    resultado = await criarEnvelopeDeAssinatura({
      nomeEnvelope: `Admissão — ${nomeCandidato}`,
      filename,
      contentBase64,
      nomeSignatario: nomeCandidato,
      emailSignatario: emailCandidato,
      metadata: { admissao_id: admissaoId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar envelope na Clicksign.";
    console.error("[POST /api/admissoes/assinatura-clicksign/criar]", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: updateError } = await svc
    .from("admissoes")
    .update({
      metodo_assinatura: "eletronica",
      assinatura_provedor: "clicksign",
      assinatura_documento_externo_id: resultado.envelopeId,
    })
    .eq("id", admissaoId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_assinatura_clicksign_criada",
    entidade: "admissoes",
    entidade_id: admissaoId,
    detalhes: { envelope_id: resultado.envelopeId, document_id: resultado.documentId, signer_id: resultado.signerId },
  });

  return NextResponse.json({ envelopeId: resultado.envelopeId });
}
