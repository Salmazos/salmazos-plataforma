import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

// Pacote de contabilidade contém dados sensíveis (LGPD) — signed URL de no máximo 15 minutos.
const SIGNED_URL_TTL_SECONDS = 900;

// Signed URL para reabrir o pacote de contabilidade já gerado para esta admissão.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("pdf_pacote_path")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!admissao.pdf_pacote_path) return NextResponse.json({ error: "Nenhum pacote foi gerado ainda para esta admissão." }, { status: 400 });

  const { data, error: signError } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(admissao.pdf_pacote_path, SIGNED_URL_TTL_SECONDS);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
