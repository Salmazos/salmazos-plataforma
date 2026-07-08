import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoValeTransporteSchema } from "@/lib/schemas";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Edição total do Vale Transporte pelo analista — mesmo schema e mesma lógica de
// upsert + delete/insert de linhas já usada em PATCH /api/admissoes/token/[token]
// (candidato), aqui exposta como rota autenticada pro painel.
export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoValeTransporteSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: antes } = await svc
    .from("admissao_vale_transporte")
    .select("*")
    .eq("admissao_id", id)
    .maybeSingle();

  const { linhas, ...vtFields } = parsed.data;
  const vtPayload: Record<string, unknown> = { admissao_id: id, ...vtFields };
  if (vtFields.termos_aceitos === true) vtPayload.termos_aceitos_em = new Date().toISOString();
  else if (vtFields.termos_aceitos === false) vtPayload.termos_aceitos_em = null;

  const { data: vtRow, error: vtError } = await svc
    .from("admissao_vale_transporte")
    .upsert(vtPayload, { onConflict: "admissao_id" })
    .select()
    .single();
  if (vtError) return NextResponse.json({ error: vtError.message }, { status: 400 });

  if (linhas) {
    const { error: delError } = await svc.from("admissao_vt_linhas").delete().eq("vale_transporte_id", vtRow.id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 400 });
    if (linhas.length > 0) {
      const { error: linhasError } = await svc.from("admissao_vt_linhas").insert(
        linhas.map((l, idx) => ({ vale_transporte_id: vtRow.id, ...l, ordem: idx + 1 }))
      );
      if (linhasError) return NextResponse.json({ error: linhasError.message }, { status: 400 });
    }
  }

  const { data: linhasAtuais } = await svc
    .from("admissao_vt_linhas")
    .select("*")
    .eq("vale_transporte_id", vtRow.id)
    .order("ordem", { ascending: true });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_vale_transporte_editado_pelo_analista",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { diff: diffCampos(antes, vtFields), linhas_atualizadas: linhas !== undefined },
  });

  return NextResponse.json({ data: { ...vtRow, admissao_vt_linhas: linhasAtuais ?? [] } });
}
