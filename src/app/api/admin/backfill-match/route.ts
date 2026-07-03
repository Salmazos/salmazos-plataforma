import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calcularMatchCandidato } from "@/lib/calcularMatchCandidato";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 10);

  const supabase = createServiceClient();

  const { data: candidatos } = await supabase
    .from("candidatos")
    .select("id")
    .eq("matches_calculados", "[]")
    .order("created_at", { ascending: true })
    .limit(limit);

  console.log(`[backfill-match] encontrados: ${candidatos?.length ?? 0}`);

  if (!candidatos || candidatos.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  for (const c of candidatos) {
    await calcularMatchCandidato(c.id).catch((err) =>
      console.error(`[backfill-match] erro no candidato ${c.id}:`, err)
    );
  }

  const { count } = await supabase
    .from("candidatos")
    .select("id", { count: "exact", head: true })
    .eq("matches_calculados", "[]");

  return NextResponse.json({ processed: candidatos.length, remaining: count ?? 0 });
}
