import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoClientes } from "@/lib/comercialAuth";

// Upload do logo do cliente — mesmo padrão de api/meu-perfil/avatar/route.ts (base64 direto
// no body, sem signed-URL: arquivo pequeno, não sensível). Reaproveita o bucket público
// "avatares" (já existe e já é público) em vez de criar um bucket novo só pra isso.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;

  const { base64, contentType } = await request.json();
  if (!base64 || !contentType) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const allowedTypes: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
  };
  const ext = allowedTypes[contentType];
  if (!ext) {
    return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, SVG ou WEBP." }, { status: 400 });
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Imagem muito grande. Máximo 2MB." }, { status: 400 });
  }

  const svc = createServiceClient();
  const filePath = `clientes/${id}/logo.${ext}`;

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
  // Cache-bust — senão o navegador do cliente segue mostrando o logo antigo depois de troca
  // (mesmo path, mesmo nome de arquivo, upsert só troca o conteúdo).
  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { data, error: updateError } = await svc
    .from("clientes")
    .update({ logo_url: logoUrl })
    .eq("id", id)
    .select("id, logo_url")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
