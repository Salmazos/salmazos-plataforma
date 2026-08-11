import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { parseBody, faturamentoRsImpostoSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = parseBody(faturamentoRsImpostoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ano, mes, percentual } = parsed.data;

  const svc = createServiceClient();

  const { data: anterior } = await svc
    .from("faturamento_rs_impostos_mensais")
    .select("percentual")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  const { data, error } = await svc
    .from("faturamento_rs_impostos_mensais")
    .upsert(
      { ano, mes, percentual, informado_por: user.id, atualizado_em: new Date().toISOString() },
      { onConflict: "ano,mes" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "faturamento_rs_imposto_definido",
    entidade: "faturamento_rs_impostos_mensais",
    entidade_id: data.id,
    detalhes: { ano, mes, percentual_novo: percentual, percentual_anterior: anterior?.percentual ?? null },
  });

  return NextResponse.json({ data });
}
