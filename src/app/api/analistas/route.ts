import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("analistas_perfil")
    .select("id, nome_completo, email")
    .eq("ativo", true)
    .order("nome_completo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analistas: data ?? [] });
}
