import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { parseBody, faturamentoHortolandiaImpostoSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { resolverUnidadeFaturamento, checarEscritaFaturamento } from "@/lib/faturamentoUnidades";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;
  const somenteLeitura = await checarEscritaFaturamento(user);
  if (somenteLeitura) return somenteLeitura;

  const body = await request.json();
  const parsed = parseBody(faturamentoHortolandiaImpostoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ano, mes, percentual } = parsed.data;
  const { unidadeId, erro } = await resolverUnidadeFaturamento(user, parsed.data.unidade_id);
  if (erro) return erro;

  const svc = createServiceClient();

  const { data: anterior } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
    .select("percentual")
    .eq("unidade_id", unidadeId)
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  // Imposto do mês é por unidade (UNIQUE unidade_id+ano+mes — ver
  // migration_faturamento_unidades_imposto_por_unidade.sql).
  const { data, error } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
    .upsert(
      { unidade_id: unidadeId, ano, mes, percentual, informado_por: user.id, atualizado_em: new Date().toISOString() },
      { onConflict: "unidade_id,ano,mes" }
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
    detalhes: { unidade_id: unidadeId, ano, mes, percentual_novo: percentual, percentual_anterior: anterior?.percentual ?? null },
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
  const { unidadeId, erro } = await resolverUnidadeFaturamento(user, searchParams.get("unidade"));
  if (erro) return erro;

  const svc = createServiceClient();
  const { data } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
    .select("ano, mes, percentual, atualizado_em")
    .eq("unidade_id", unidadeId)
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  return NextResponse.json({ data: data ?? null });
}
