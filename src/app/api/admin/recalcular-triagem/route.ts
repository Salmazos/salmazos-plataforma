import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calcularTriagem } from "@/lib/triagemAutomatica";

export const maxDuration = 300;

export async function GET() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: candidatos, error } = await supabase
    .from("candidatos")
    .select("id")
    .is("triagem_score", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = candidatos?.length ?? 0;
  let processados = 0;

  for (const candidato of candidatos ?? []) {
    try {
      await calcularTriagem(candidato.id as string);
      processados++;
    } catch (err) {
      console.error(`[recalcular-triagem] Candidato ${candidato.id}:`, err);
    }
  }

  return NextResponse.json({ total, processados });
}
