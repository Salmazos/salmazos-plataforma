import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ funcionarioId: string; docId: string }>;
}

// Gera o signed URL de um documento específico — revalida tudo no servidor a cada clique
// (nunca confia num storage_path vindo do client): funcionário precisa pertencer ao
// cliente_id do usuário logado e estar ativo, e o documento precisa pertencer à admissão
// desse funcionário e estar com status='aprovado', mesmo padrão de aso-url/contrato-url.
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { funcionarioId, docId } = await params;
  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: funcionario } = await service
    .from("funcionarios")
    .select("id, admissao_id")
    .eq("id", funcionarioId)
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "ativo")
    .maybeSingle();
  if (!funcionario?.admissao_id) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });

  const { data: documento } = await service
    .from("admissao_documentos")
    .select("storage_path")
    .eq("id", docId)
    .eq("admissao_id", funcionario.admissao_id)
    .eq("status", "aprovado")
    .maybeSingle();
  if (!documento?.storage_path) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const { data, error } = await service.storage
    .from("admissao-docs")
    .createSignedUrl(documento.storage_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
