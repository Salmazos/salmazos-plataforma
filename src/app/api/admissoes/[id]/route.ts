import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("*, candidatos(id, nome_completo, cargo_pretendido, telefone, email), vagas(id, titulo)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
  ]);

  return NextResponse.json({
    data: {
      admissao,
      dados_pessoais: dadosPessoais ?? null,
      dependentes: dependentes ?? [],
      documentos: documentos ?? [],
    },
  });
}
