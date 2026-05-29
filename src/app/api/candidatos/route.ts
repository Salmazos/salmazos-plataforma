import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { enviarEmailConfirmacao } from "@/lib/email";

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
        cpf: body.cpf,
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
        origem: body.origem || "Banco de talentos",
        etapa_kanban: "triagem",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
