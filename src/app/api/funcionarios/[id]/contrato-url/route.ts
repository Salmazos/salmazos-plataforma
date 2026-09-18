import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Equivalente interno de /api/portal/funcionarios/[funcionarioId]/contrato-url, mas sem a
// trava de cliente_id/status='ativo' de lá (aqui é a equipe interna, que já tem acesso ao
// funcionário independente de status) — recebe o funcionario_id (a listagem não expõe o id
// da linha de funcionario_contratos) e resolve o contrato mais recente por conta própria,
// mesmo critério já usado em funcionarios/[id]/page.tsx.
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: contrato } = await svc
    .from("funcionario_contratos")
    .select("arquivo_path")
    .eq("funcionario_id", id)
    .is("excluido_em", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contrato?.arquivo_path) {
    return NextResponse.json({ error: "Contrato não encontrado ou sem arquivo." }, { status: 404 });
  }

  const { data, error } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(contrato.arquivo_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
