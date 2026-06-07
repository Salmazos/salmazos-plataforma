import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const status = request.nextUrl.searchParams.get("status") ?? "";
  const tipo   = request.nextUrl.searchParams.get("tipo")   ?? "";
  const from   = request.nextUrl.searchParams.get("from")   ?? "";
  const to     = request.nextUrl.searchParams.get("to")     ?? "";

  let query = svc
    .from("email_logs")
    .select("*, candidatos(nome_completo)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (tipo)   query = query.eq("tipo", tipo);
  if (from)   query = query.gte("created_at", from);
  if (to)     query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
