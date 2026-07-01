import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ token: string }>;
}

// Rota pública — acessada pelo candidato sem sessão autenticada.
export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  const svc = createServiceClient();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("id, candidato_id, vaga_id, modalidade, status, token_expira_em, token_usado_em, criado_em, candidatos(nome_completo, cargo_pretendido), vagas(titulo)")
    .eq("token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!admissao) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  if (new Date(admissao.token_expira_em) < new Date()) {
    return NextResponse.json({ error: "Este link expirou." }, { status: 410 });
  }

  if (!admissao.token_usado_em) {
    await svc
      .from("admissoes")
      .update({ token_usado_em: new Date().toISOString() })
      .eq("id", admissao.id);
  }

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", admissao.id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", admissao.id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("id, tipo_documento, status, obrigatorio, condicional, motivo_rejeicao").eq("admissao_id", admissao.id).order("created_at", { ascending: true }),
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
