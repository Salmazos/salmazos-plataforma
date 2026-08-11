import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { parseBody, faturamentoRsAjusteCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

// Ajustes são imutáveis — sem PATCH/DELETE. Um lançamento errado se corrige com um novo
// ajuste de sinal oposto, nunca apagando o original (rastro de auditoria tipo livro-razão).
export async function POST(request: NextRequest) {
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
  const parsed = parseBody(faturamentoRsAjusteCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ano, mes, valor, descricao } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("faturamento_rs_ajustes_manuais")
    .insert({ ano, mes, valor, descricao, criado_por: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "faturamento_rs_ajuste_criado",
    entidade: "faturamento_rs_ajustes_manuais",
    entidade_id: data.id,
    detalhes: { ano, mes, valor, descricao },
  });

  return NextResponse.json({ data });
}
