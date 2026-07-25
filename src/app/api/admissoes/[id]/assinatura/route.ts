import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Documento assinado contém dados sensíveis (LGPD) — signed URL de no máximo 15 minutos,
// mesmo padrão de /api/admissoes/[id]/pacote.
const SIGNED_URL_TTL_SECONDS = 900;

// Signed URL para reabrir o PDF assinado eletronicamente (admissao_envelopes_assinatura.path,
// preenchido pelo webhook da Clicksign quando o candidato conclui a assinatura do pacote
// interno — Ficha Cadastral + Autorização Sindical + Solicitação de VT).
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const { data: envelope, error } = await svc
    .from("admissao_envelopes_assinatura")
    .select("path")
    .eq("admissao_id", id)
    .eq("tipo_pacote", "interno")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!envelope?.path) return NextResponse.json({ error: "Esta admissão ainda não tem documento assinado." }, { status: 400 });

  const { data, error: signError } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(envelope.path, SIGNED_URL_TTL_SECONDS);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
