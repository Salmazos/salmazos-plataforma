import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { base64, contentType } = await request.json();
  if (!base64 || !contentType) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png"];
  if (!allowedTypes.includes(contentType)) {
    return NextResponse.json({ error: "Formato não suportado. Use JPG ou PNG." }, { status: 400 });
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Imagem muito grande. Máximo 2MB." }, { status: 400 });
  }

  const svc = createServiceClient();
  const filePath = `${user.id}/avatar.jpg`;

  const { error: uploadError } = await svc.storage
    .from("avatares")
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = svc.storage.from("avatares").getPublicUrl(filePath);
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await svc
    .from("analistas_perfil")
    .update({ avatar_url: avatarUrl })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ avatar_url: avatarUrl });
}
