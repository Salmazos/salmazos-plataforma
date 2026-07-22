import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { parseBody, encaminhamentoCreateSchema } from "@/lib/schemas";

// Se vier só a data (YYYY-MM-DD, do <input type="date">), fixa meio-dia em
// Brasília antes de gravar — mesma convenção usada pros registros já existentes
// na migração date -> timestamptz, evitando que a data exibida mude de dia
// dependendo do fuso de quem lê depois.
function normalizarDataEntrevista(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${valor}T12:00:00-03:00`;
  return valor;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const candidato_id = searchParams.get("candidato_id");

  const supabase = createServiceClient();

  // When fetching for a specific candidate keep the lightweight select used by the
  // candidate profile; when fetching all records (agenda view) join extra tables.
  const select = candidato_id
    ? "*, cliente:clientes(id, nome, cidade, segmento, servicos)"
    : "*, cliente:clientes(id, nome, cidade, segmento, servicos), candidato:candidatos(id, nome_completo, responsavel), vaga:vagas(id, titulo)";

  let query = supabase
    .from("encaminhamentos")
    .select(select)
    .order("data_entrevista", { ascending: true });

  if (candidato_id) query = query.eq("candidato_id", candidato_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(encaminhamentoCreateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServiceClient();

    // Verifica duplicidade (retorna para informar o front, mas não bloqueia)
    const { data: existente } = await supabase
      .from("encaminhamentos")
      .select("id, data_entrevista, status")
      .eq("candidato_id", body.candidato_id)
      .eq("cliente_id", body.cliente_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("encaminhamentos")
      .insert({
        candidato_id: parsed.data.candidato_id,
        cliente_id: parsed.data.cliente_id,
        data_entrevista: normalizarDataEntrevista(parsed.data.data_entrevista),
        status: parsed.data.status,
        tipo_servico: body.tipo_servico || null,
        observacoes: body.observacoes || null,
        vaga_id: body.vaga_id || null,
      })
      .select("*, cliente:clientes(id, nome, cidade, segmento, servicos)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const clienteNome = (data.cliente as { nome?: string } | null)?.nome ?? "cliente";
    void registrarHistorico({
      candidato_id: data.candidato_id,
      tipo: "encaminhamento",
      descricao: `Encaminhado para entrevista em ${clienteNome}`,
      metadata: {
        encaminhamento_id: data.id,
        cliente_id: data.cliente_id,
        data_entrevista: data.data_entrevista,
        tipo_servico: data.tipo_servico ?? null,
      },
    });

    // Sync: if linked to a vaga, ensure candidatos_vagas record exists at triagem
    if (data.vaga_id) {
      await supabase
        .from("candidatos_vagas")
        .upsert(
          { candidato_id: data.candidato_id, vaga_id: data.vaga_id, etapa: "triagem" },
          { onConflict: "candidato_id,vaga_id", ignoreDuplicates: true }
        );
    }

    return NextResponse.json({ data, duplicata: existente ?? null }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/encaminhamentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
