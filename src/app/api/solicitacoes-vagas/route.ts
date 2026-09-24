import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade } from "@/lib/unidadeAuth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const statusFilter = request.nextUrl.searchParams.get("status") ?? "pendente";

  const service = createServiceClient();
  let query = service
    .from("solicitacoes_vagas")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter !== "todos") {
    query = query.eq("status", statusFilter);
  }
  if (!ctx.todasUnidades) {
    query = query.eq("unidade_id", ctx.unidadeId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], count: data?.length ?? 0 });
}
