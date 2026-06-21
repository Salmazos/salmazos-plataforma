import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const statusFilter = request.nextUrl.searchParams.get("status") ?? "pendente";

  const service = createServiceClient();
  const query = service
    .from("solicitacoes_vagas")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter !== "todos") {
    query.eq("status", statusFilter);
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], count: data?.length ?? 0 });
}
