import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ documentoId: string }>;
}

// Mesmo padrão de aso-url/contrato-url: valida no servidor que o documento pertence ao
// cliente_id do usuário logado (e é do tipo "cliente", nunca "salmazos") antes de gerar o
// signed URL — o cliente nunca deve conseguir abrir um documento de outro cliente só
// adivinhando o id.
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { documentoId } = await params;
  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: documento } = await service
    .from("documentos")
    .select("storage_path")
    .eq("id", documentoId)
    .eq("tipo", "cliente")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .maybeSingle();
  if (!documento) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const { data, error } = await service.storage
    .from("documentos")
    .createSignedUrl(documento.storage_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
