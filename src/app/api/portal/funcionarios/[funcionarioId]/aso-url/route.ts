import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// Equivalente do portal para /api/funcionarios/asos/[asoId]/arquivo-url — mesma lógica de
// contrato-url/route.ts (ver comentário lá): resolve o exame mais recente a partir do
// funcionarioId (mesmo critério de portal/(app)/funcionarios/page.tsx) e valida no servidor
// que o funcionário pertence ao cliente_id do usuário logado E está ativo, antes de gerar o
// signed URL.
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { funcionarioId } = await params;
  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: funcionario } = await service
    .from("funcionarios")
    .select("id")
    .eq("id", funcionarioId)
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "ativo")
    .maybeSingle();
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });

  const { data: aso } = await service
    .from("funcionario_asos")
    .select("arquivo_path")
    .eq("funcionario_id", funcionarioId)
    .is("excluido_em", null)
    .order("data_exame", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!aso?.arquivo_path) {
    return NextResponse.json({ error: "Este exame não tem arquivo anexado." }, { status: 404 });
  }

  const { data, error } = await service.storage
    .from("admissao-docs")
    .createSignedUrl(aso.arquivo_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
