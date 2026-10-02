import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, lembreteAcaoSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { dataAdiamentoValida } from "@/lib/lembretesRegras";

// Só o DONO do lembrete age sobre ele (diretoria/gestor só lê). O service client ignora RLS,
// então a checagem de dono é feita aqui, em código.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não altera lembretes." }, { status: 403 });

  const svc = createServiceClient();
  const { data: lembrete } = await svc.from("lembretes").select("id, vendedor_id, status, adiamentos").eq("id", id).maybeSingle();
  // 404 (e não 403) para lembrete de outro vendedor: não confirma que o id existe.
  if (!lembrete || lembrete.vendedor_id !== ctx.analistaId) {
    return NextResponse.json({ error: "Lembrete não encontrado." }, { status: 404 });
  }

  const parsed = parseBody(lembreteAcaoSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  if (lembrete.status !== "pendente") {
    return NextResponse.json({ error: "Este lembrete já foi concluído ou cancelado." }, { status: 409 });
  }

  const agora = new Date().toISOString();
  let campos: Record<string, unknown>;
  if (d.acao === "adiar") {
    if (!dataAdiamentoValida(d.nova_data, hojeSaoPaulo())) {
      return NextResponse.json({ error: "Escolha uma data depois de hoje para adiar." }, { status: 400 });
    }
    campos = { data_lembrete: d.nova_data, adiamentos: (lembrete.adiamentos ?? 0) + 1, updated_at: agora };
  } else if (d.acao === "concluir") {
    campos = { status: "feito", concluido_em: agora, updated_at: agora };
  } else {
    campos = { status: "cancelado", updated_at: agora };
  }

  // .eq("status", "pendente") também no update: duas ações simultâneas não passam as duas.
  const { data, error } = await svc
    .from("lembretes")
    .update(campos)
    .eq("id", id)
    .eq("vendedor_id", ctx.analistaId)
    .eq("status", "pendente")
    .select("id, status, data_lembrete, adiamentos")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Este lembrete já foi concluído ou cancelado." }, { status: 409 });
  return NextResponse.json({ data });
}
