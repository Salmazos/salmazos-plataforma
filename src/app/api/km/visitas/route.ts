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
  const {
    registro_id, empresa, contato, contato_telefone, contato_email, motivo, resultado, ordem,
    tipo_visita, cliente_id, checklist_equipe_completa, checklist_epi, checklist_uniforme,
    checklist_pontualidade, checklist_ambiente, checklist_feedback_cliente,
    problema_identificado, problema_descricao, plano_acao, evidencias_fotos,
  } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("km_visitas")
    .insert({
      registro_id,
      empresa,
      contato: contato || null,
      contato_telefone: contato_telefone || null,
      contato_email: contato_email || null,
      motivo: motivo || null,
      resultado: resultado || null,
      ordem: ordem ?? 1,
      tipo_visita: tipo_visita ?? "comercial",
      cliente_id: cliente_id || null,
      checklist_equipe_completa: checklist_equipe_completa || null,
      checklist_epi: checklist_epi || null,
      checklist_uniforme: checklist_uniforme || null,
      checklist_pontualidade: checklist_pontualidade || null,
      checklist_ambiente: checklist_ambiente || null,
      checklist_feedback_cliente: checklist_feedback_cliente || null,
      problema_identificado: problema_identificado ?? false,
      problema_descricao: problema_descricao || null,
      plano_acao: plano_acao || null,
      evidencias_fotos: evidencias_fotos ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ── Upsert empresas_visitadas ──
  try {
    // Resolve analista info from the registro
    const { data: registro } = await svc
      .from("km_registros")
      .select("analista_id")
      .eq("id", registro_id)
      .single();

    let analistaNome: string | null = null;
    let analistaUserId: string | null = null;
    if (registro?.analista_id) {
      const { data: perfil } = await svc
        .from("analistas_perfil")
        .select("nome_completo, user_id")
        .eq("id", registro.analista_id)
        .single();
      analistaNome = perfil?.nome_completo ?? null;
      analistaUserId = perfil?.user_id ?? null;
    }

    // Look for existing empresa (case-insensitive)
    const { data: existing } = await svc
      .from("empresas_visitadas")
      .select("id, contato_nome, contato_telefone, contato_email, cliente_id, total_visitas")
      .ilike("nome", empresa)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update: bump counters and fill in blank contact fields
      await svc
        .from("empresas_visitadas")
        .update({
          ultima_visita_em: new Date().toISOString(),
          total_visitas: (existing.total_visitas ?? 0) + 1,
          ultimo_visitante_id: analistaUserId,
          ultimo_visitante_nome: analistaNome,
          ...((!existing.contato_nome && contato) ? { contato_nome: contato } : {}),
          ...((!existing.contato_telefone && contato_telefone) ? { contato_telefone } : {}),
          ...((!existing.contato_email && contato_email) ? { contato_email } : {}),
        })
        .eq("id", existing.id);
    } else {
      // Visita de supervisão já traz cliente_id do combobox — evita adivinhar por nome.
      // Comercial continua resolvendo por match de nome, como antes.
      let empresaClienteId: string | null = cliente_id || null;
      if (!empresaClienteId) {
        const { data: cliente } = await svc
          .from("clientes")
          .select("id")
          .ilike("nome", empresa)
          .limit(1)
          .maybeSingle();
        if (cliente) empresaClienteId = cliente.id;
      }

      await svc.from("empresas_visitadas").insert({
        nome: empresa,
        contato_nome: contato || null,
        contato_telefone: contato_telefone || null,
        contato_email: contato_email || null,
        cliente_id: empresaClienteId,
        primeira_visita_em: new Date().toISOString(),
        ultima_visita_em: new Date().toISOString(),
        total_visitas: 1,
        ultimo_visitante_id: analistaUserId,
        ultimo_visitante_nome: analistaNome,
        created_by: analistaUserId,
      });
    }
  } catch {
    // Upsert is best-effort — don't fail the visita save
  }

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
