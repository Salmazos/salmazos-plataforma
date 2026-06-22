import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createServiceClient();

    const { data: doc, error: fetchError } = await supabase
      .from("documentos")
      .select("id, storage_path")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: "Documento não encontrado." },
        { status: 404 }
      );
    }

    const { error: storageError } = await supabase.storage
      .from("documentos")
      .remove([doc.storage_path]);

    if (storageError) {
      console.error("[DELETE /api/documentos] storage error:", storageError);
      return NextResponse.json(
        { error: "Erro ao remover arquivo do storage." },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
      .from("documentos")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/documentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
