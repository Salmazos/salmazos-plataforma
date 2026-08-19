import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoClientes } from "@/lib/comercialAuth";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("cliente_usuarios")
    .select("id")
    .eq("cliente_id", id)
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ temPortal: (data?.length ?? 0) > 0 });
}
