import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, storagePathSchema } from "@/lib/schemas";
import { checarAcessoDocumentos } from "@/lib/documentosAuth";

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoDocumentos(user);
    if (acessoNegado) return acessoNegado;

    const body = await request.json();
    const parsed = parseBody(storagePathSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { path } = parsed.data;

    const supabase = createServiceClient();

    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUploadUrl(path);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      path: data.path,
      token: data.token,
    });
  } catch (err) {
    console.error("[POST /api/documentos/upload-url]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
