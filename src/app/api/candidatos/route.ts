import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { enviarEmailConfirmacao } from "@/lib/email";

export async function GET(request: NextRequest) {
  const busca  = request.nextUrl.searchParams.get("busca") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "ativo";

  const supabase = createServiceClient();
  let query = supabase
    .from("candidatos")
    .select("id, nome_completo, cargo_pretendido, cidade, estado, origem, etapa_kanban, responsavel, status")
    .order("nome_completo")
    .limit(30);

  if (status) query = query.eq("status", status);
  if (busca)  query = query.ilike("nome_completo", `%${busca}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const required = [
      "nome_completo",
      "telefone",
      "cargo_pretendido",
      "tempo_experiencia",
      "turno_disponivel",
    ];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Campo obrigatório ausente: ${field}` },
          { status: 400 }
        );
      }
    }

    const supabase = createServiceClient();

    // Verificar CPF duplicado apenas quando informado
    if (body.cpf) {
      const { data: existente } = await supabase
        .from("candidatos")
        .select("id")
        .eq("cpf", body.cpf)
        .maybeSingle();

      if (existente) {
        return NextResponse.json(
          { error: "Já existe um cadastro com este CPF." },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("candidatos")
      .insert({
        nome_completo: body.nome_completo,
        cpf: body.cpf || `TEMP-${Date.now()}`,
        telefone: body.telefone,
        email: body.email,
        cidade: body.cidade,
        estado: body.estado,
        cargo_pretendido: body.cargo_pretendido,
        tempo_experiencia: body.tempo_experiencia,
        turno_disponivel: body.turno_disponivel,
        pretensao_salarial: body.pretensao_salarial || null,
        habilidades: body.habilidades || [],
        resumo_profissional: body.resumo_profissional || null,
        curriculo_url: body.curriculo_url || null,
        idade: body.idade || null,
        formacao_academica: body.formacao_academica || null,
        origem: body.origem || "Banco de talentos",
        etapa_kanban: "triagem",
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/candidatos] Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    // Enviar e-mail de confirmação apenas quando e-mail foi informado
    if (body.email) {
      enviarEmailConfirmacao({
        to: body.email,
        nomeCandidato: body.nome_completo,
        cargoPretendido: body.cargo_pretendido,
      }).catch((err) => console.error("[Email]", err));
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/candidatos]", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
