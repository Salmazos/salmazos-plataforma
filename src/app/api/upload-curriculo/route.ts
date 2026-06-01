import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const arquivo = formData.get("arquivo") as File | null;

    if (!arquivo) {
      return NextResponse.json(
        { error: "Campo 'arquivo' ausente." },
        { status: 400 }
      );
    }

    const TIPOS_ACEITOS: Record<string, string> = {
      "application/pdf": "application/pdf",
      "application/msword": "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg": "image/jpeg",
      "image/png": "image/png",
    };

    const contentType = TIPOS_ACEITOS[arquivo.type];
    if (!contentType) {
      return NextResponse.json(
        { error: "Formato não suportado. Use PDF, Word ou imagem (JPG, PNG)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const nomeArquivo = `${Date.now()}-${arquivo.name.replace(/\s+/g, "_")}`;

    const supabase = createServiceClient();

    const { error } = await supabase.storage
      .from("curriculos")
      .upload(nomeArquivo, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: publicUrl } = supabase.storage
      .from("curriculos")
      .getPublicUrl(nomeArquivo);

    return NextResponse.json({ url: publicUrl.publicUrl }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/upload-curriculo]", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
