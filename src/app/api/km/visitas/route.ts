import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, kmVisitaCreateSchema } from "@/lib/schemas";
import { autorizarDonoRegistro } from "@/lib/kmAuth";
import { recalcularEmpresaVisitada } from "@/lib/carteiraClientes";

async function autorizarPorRegistroId(user: User, registroId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data: registro } = await svc.from("km_registros").select("analista_id").eq("id", registroId).maybeSingle();
  if (!registro) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  return autorizarDonoRegistro(user, registro.analista_id);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const registroId = request.nextUrl.searchParams.get("registro_id");
  if (!registroId) return NextResponse.json({ error: "registro_id é obrigatório." }, { status: 400 });

  const erroDono = await autorizarPorRegistroId(user, registroId);
  if (erroDono) return erroDono;

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

  const erroDono = await autorizarPorRegistroId(user, registro_id);
  if (erroDono) return erroDono;

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
    let analistaUnidadeId: string | null = null;
    if (registro?.analista_id) {
      const { data: perfil } = await svc
        .from("analistas_perfil")
        .select("nome_completo, user_id, unidade_id")
        .eq("id", registro.analista_id)
        .single();
      analistaNome = perfil?.nome_completo ?? null;
      analistaUserId = perfil?.user_id ?? null;
      analistaUnidadeId = perfil?.unidade_id ?? null;
    }
    // Carteira é separada por unidade (decisão do Olver, 24/09): a empresa fica na unidade de
    // quem visitou. Sem unidade conhecida não grava na carteira — a visita em si já foi salva.
    if (!analistaUnidadeId) throw new Error(`analista sem unidade (registro_id=${registro_id})`);

    // Look for existing empresa (case-insensitive), só na carteira da mesma unidade
    const { data: existing } = await svc
      .from("empresas_visitadas")
      .select("id, contato_nome, contato_telefone, contato_email, cliente_id, total_visitas")
      .ilike("nome", empresa)
      .eq("unidade_id", analistaUnidadeId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Só preenche contato em branco — total/datas/último visitante são recalculados abaixo.
      const contatoEmBranco = {
        ...((!existing.contato_nome && contato) ? { contato_nome: contato } : {}),
        ...((!existing.contato_telefone && contato_telefone) ? { contato_telefone } : {}),
        ...((!existing.contato_email && contato_email) ? { contato_email } : {}),
      };
      if (Object.keys(contatoEmBranco).length > 0) {
        await svc.from("empresas_visitadas").update(contatoEmBranco).eq("id", existing.id);
      }
    } else {
      // Visita de supervisão já traz cliente_id do combobox — evita adivinhar por nome.
      // Comercial continua resolvendo por match de nome, como antes.
      let empresaClienteId: string | null = cliente_id || null;
      if (!empresaClienteId) {
        const { data: cliente } = await svc
          .from("clientes")
          .select("id")
          .ilike("nome", empresa)
          .eq("unidade_id", analistaUnidadeId)
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
        unidade_id: analistaUnidadeId,
      });
    }

    await recalcularEmpresaVisitada(svc, empresa, analistaUnidadeId);
  } catch (err) {
    // Upsert is best-effort — don't fail the visita save
    console.error("[POST /api/km/visitas] Carteira não atualizada:", err);
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const registroId = request.nextUrl.searchParams.get("registro_id");
  if (!registroId) return NextResponse.json({ error: "registro_id é obrigatório." }, { status: 400 });

  const erroDono = await autorizarPorRegistroId(user, registroId);
  if (erroDono) return erroDono;

  const svc = createServiceClient();

  // Guarda quais empresas perdem visita antes de apagar, pra recalcular a carteira delas
  // depois (a tela de KM apaga e regrava todas as visitas ao editar um registro).
  const [{ data: visitasApagadas }, { data: registro }] = await Promise.all([
    svc.from("km_visitas").select("empresa").eq("registro_id", registroId),
    svc.from("km_registros").select("analista_id").eq("id", registroId).maybeSingle(),
  ]);

  const { error } = await svc.from("km_visitas").delete().eq("registro_id", registroId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    const { data: perfil } = registro?.analista_id
      ? await svc.from("analistas_perfil").select("unidade_id").eq("id", registro.analista_id).maybeSingle()
      : { data: null };
    if (perfil?.unidade_id) {
      const empresas = [...new Set((visitasApagadas ?? []).map((v) => v.empresa as string).filter(Boolean))];
      for (const empresa of empresas) await recalcularEmpresaVisitada(svc, empresa, perfil.unidade_id);
    }
  } catch (err) {
    // A visita já foi apagada; a carteira fica pra próxima gravação corrigir.
    console.error("[DELETE /api/km/visitas] Carteira não recalculada:", err);
  }

  return NextResponse.json({ success: true });
}
