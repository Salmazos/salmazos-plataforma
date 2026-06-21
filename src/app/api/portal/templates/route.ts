import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

async function getClienteId() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  return cu?.cliente_id ?? null;
}

export async function GET() {
  const clienteId = await getClienteId();
  if (!clienteId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("vaga_templates_cliente")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("total_usos", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const clienteId = await getClienteId();
  if (!clienteId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json();
  if (!body.nome?.trim() || !body.cargo?.trim() || !body.tipo_servico) {
    return NextResponse.json({ error: "Nome, cargo e tipo de serviço são obrigatórios." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("vaga_templates_cliente")
    .insert({
      cliente_id: clienteId,
      nome: body.nome.trim(),
      cargo: body.cargo.trim(),
      tipo_servico: body.tipo_servico,
      cidade: body.cidade || null,
      estado: body.estado || null,
      salario: body.salario || null,
      horario_tipo: body.horario_tipo || null,
      horario_texto: body.horario_texto || null,
      horario_padrao: body.horario_padrao ?? null,
      requisitos: body.requisitos || null,
      requisitos_chips: body.requisitos_chips ?? null,
      beneficios: body.beneficios || null,
      beneficios_chips: body.beneficios_chips ?? null,
      observacoes: body.observacoes || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
