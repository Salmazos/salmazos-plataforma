import { NextRequest, NextResponse } from "next/server";
import { resolveAdmissaoByToken } from "@/lib/admissaoToken";

interface Params {
  params: Promise<{ token: string; docId: string }>;
}

// Documentos de admissão contêm dados sensíveis (LGPD) — signed URL de no máximo 15 minutos,
// mesmo padrão usado na rota equivalente do painel interno (ver
// api/admissoes/[id]/documentos/[docId]/route.ts).
const SIGNED_URL_TTL_SECONDS = 900;

// Signed URL pro próprio candidato conferir a foto que acabou de enviar, em tamanho real
// — sem isso não há como saber se o enquadramento/nitidez ficou bom antes de seguir.
export async function GET(_request: NextRequest, { params }: Params) {
  const { token, docId } = await params;

  const resolved = await resolveAdmissaoByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  const { admissaoId, svc } = resolved;

  const { data: doc, error } = await svc
    .from("admissao_documentos")
    .select("storage_path")
    .eq("id", docId)
    .eq("admissao_id", admissaoId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!doc.storage_path) return NextResponse.json({ error: "Documento ainda não enviado." }, { status: 400 });

  const { data, error: signError } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
