import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, kmVisitaCreateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const registroId = request.nextUrl.searchParams.get("registro_id");
  if (!registroId) return NextResponse.json({ error: "registro_id é obrigatório." }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("km_visitas")
    .select("*")
    .eq("registro_id", registroId)
    .order("ordem", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(kmVisitaCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { registro_id, empresa, contato, motivo, resultado, ordem } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("km_visitas")
    .insert({
      registro_id,
      empresa,
      contato: contato || null,
      motivo: motivo || null,
      resultado: resultado || null,
      ordem: ordem ?? 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const registroId = request.nextUrl.searchParams.get("registro_id");
  if (!registroId) return NextResponse.json({ error: "registro_id é obrigatório." }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("km_visitas").delete().eq("registro_id", registroId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
