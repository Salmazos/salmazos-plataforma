import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { checarAcessoAdmissaoRH } from "@/lib/rhUnidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

const BUCKET = "admissao-docs";
const TIPO_PACOTE = "contabilidade" as const;
// Documento assinado contém dados sensíveis (LGPD) — signed URL de no máximo 15 minutos,
// mesmo padrão de /api/admissoes/[id]/pacote e /api/admissoes/[id]/assinatura.
const SIGNED_URL_TTL_SECONDS = 900;

// Signed URL para reabrir o pacote da contabilidade já assinado eletronicamente
// (admissao_envelopes_assinatura.path, preenchido pelo webhook da ZapSign).
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;
  const bloqueioUnidade = await checarAcessoAdmissaoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();

  const { data: envelope, error } = await svc
    .from("admissao_envelopes_assinatura")
    .select("path")
    .eq("admissao_id", id)
    .eq("tipo_pacote", TIPO_PACOTE)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!envelope?.path) return NextResponse.json({ error: "Esta admissão ainda não tem o pacote da contabilidade assinado." }, { status: 400 });

  const { data, error: signError } = await svc.storage
    .from(BUCKET)
    .createSignedUrl(envelope.path, SIGNED_URL_TTL_SECONDS);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
