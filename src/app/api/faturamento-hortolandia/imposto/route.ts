import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { parseBody, faturamentoHortolandiaImpostoSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(faturamentoHortolandiaImpostoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ano, mes, percentual } = parsed.data;

  const svc = createServiceClient();

  const { data: anterior } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
    .select("percentual")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  const { data, error } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
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
    acao: "faturamento_hortolandia_imposto_definido",
    entidade: "faturamento_hortolandia_impostos_mensais",
    entidade_id: data.id,
    detalhes: { ano, mes, percentual_novo: percentual, percentual_anterior: anterior?.percentual ?? null },
  });

  return NextResponse.json({ data });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Parâmetros ano/mes inválidos." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
    .select("ano, mes, percentual, atualizado_em")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  return NextResponse.json({ data: data ?? null });
}
