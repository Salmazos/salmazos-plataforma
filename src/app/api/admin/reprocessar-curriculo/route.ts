import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extractAndUpdateCandidato } from "@/lib/extrairCurriculo";
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
  const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 5);

  const supabase = createServiceClient();

  const { data: candidatos } = await supabase
    .from("candidatos")
    .select("id, curriculo_url, resumo_candidato")
    .not("curriculo_url", "is", null)
    .or("resumo_profissional.is.null,resumo_profissional.eq.")
    .order("created_at", { ascending: true })
    .limit(limit);

  console.log(`[reprocessar-curriculo] encontrados: ${candidatos?.length ?? 0}`);

  if (!candidatos || candidatos.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  for (const c of candidatos) {
    try {
      await extractAndUpdateCandidato(c.id, c.curriculo_url as string, (c.resumo_candidato as string) ?? "");
      await calcularMatchCandidato(c.id);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      console.error(`[reprocessar-curriculo] erro no candidato ${c.id}:`, mensagem);
      await supabase
        .from("candidatos")
        .update({ resumo_profissional: `[ERRO_REPROCESSAMENTO] ${mensagem.slice(0, 200)}` })
        .eq("id", c.id);
    }
  }

  const { count } = await supabase
    .from("candidatos")
    .select("id", { count: "exact", head: true })
    .not("curriculo_url", "is", null)
    .or("resumo_profissional.is.null,resumo_profissional.eq.");

  return NextResponse.json({ processed: candidatos.length, remaining: count ?? 0 });
}
