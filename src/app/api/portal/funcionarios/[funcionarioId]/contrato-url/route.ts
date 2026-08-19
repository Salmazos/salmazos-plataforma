import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// Equivalente do portal para /api/funcionarios/contratos/[contratoId]/arquivo-url — mas
// recebendo funcionarioId (o portal não expõe IDs de linha de funcionario_contratos pro
// cliente) e resolvendo o contrato mais recente por conta própria, mesmo critério já usado
// em portal/(app)/funcionarios/page.tsx. Trava de segurança validada no servidor, nunca no
// client: o funcionário só é retornado se pertencer ao cliente_id do usuário logado (via
// cliente_usuarios) E estiver com status='ativo' — um cliente não pode ver contrato de
// funcionário de outra empresa nem de alguém já desligado, mesmo sabendo o ID.
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

  const { data: contrato } = await service
    .from("funcionario_contratos")
    .select("arquivo_path")
    .eq("funcionario_id", funcionarioId)
    .is("excluido_em", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contrato?.arquivo_path) {
    return NextResponse.json({ error: "Contrato não encontrado ou sem arquivo." }, { status: 404 });
  }

  const { data, error } = await service.storage
    .from("admissao-docs")
    .createSignedUrl(contrato.arquivo_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
