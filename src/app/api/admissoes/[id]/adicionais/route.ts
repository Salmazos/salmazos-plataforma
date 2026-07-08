import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoAdicionaisUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Edição da lista de adicionais salariais pelo analista — exclusiva do painel interno.
// Substitui a lista inteira a cada save (mesmo raciocínio do delete+insert já usado em
// admissao_vt_linhas/km_visitas): mais simples que reconciliar diffs de uma lista curta.
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
  const parsed = parseBody(admissaoAdicionaisUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { error: delError } = await svc.from("admissao_adicionais").delete().eq("admissao_id", id);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 400 });

  let data: unknown[] = [];
  if (parsed.data.adicionais.length > 0) {
    const rows = parsed.data.adicionais.map((a) => ({
      admissao_id: id,
      tipo: a.tipo,
      formato_valor: a.formato_valor,
      valor: a.valor,
    }));
    const { data: inserted, error: insError } = await svc.from("admissao_adicionais").insert(rows).select();
    if (insError) return NextResponse.json({ error: insError.message }, { status: 400 });
    data = inserted ?? [];
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_adicionais_atualizados",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { adicionais: parsed.data.adicionais },
  });

  return NextResponse.json({ data });
}
