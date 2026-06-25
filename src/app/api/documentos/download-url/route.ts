import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, storagePathSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(storagePathSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { path } = parsed.data;

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
