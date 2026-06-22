import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: "Campo obrigatório: path" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(path, 60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error("[POST /api/documentos/download-url]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
