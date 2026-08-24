import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoDocumentos } from "@/lib/documentosAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Exclusão de pasta na árvore Salmazos — ordem de checagem importa: pasta protegida recusa
// antes mesmo de olhar o conteúdo (nem uma pasta padrão vazia pode ser excluída), só depois
// checa documentos/subpastas dentro dela. Mesmo gate de acesso de página que o resto de
// /api/documentos (checarAcessoDocumentos) — o botão de excluir já só aparece pra quem tem
// canDelete no client, mesmo padrão do resto desta tela.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoDocumentos(user);
    if (acessoNegado) return acessoNegado;

    const { id } = await params;
    const svc = createServiceClient();

    const { data: pasta, error: fetchError } = await svc
      .from("documentos_pastas_salmazos")
      .select("id, protegida")
      .eq("id", id)
      .single();

    if (fetchError || !pasta) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
    }

    if (pasta.protegida) {
      return NextResponse.json(
        { error: "Esta é uma pasta padrão do sistema e não pode ser excluída." },
        { status: 400 }
      );
    }

    const [{ count: docsCount }, { count: subpastasCount }] = await Promise.all([
      svc.from("documentos").select("id", { count: "exact", head: true }).eq("pasta_id", id),
      svc.from("documentos_pastas_salmazos").select("id", { count: "exact", head: true }).eq("parent_id", id),
    ]);

    if ((docsCount ?? 0) > 0 || (subpastasCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Não é possível excluir: esta pasta contém documentos ou subpastas. Remova o conteúdo antes de excluir." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await svc
      .from("documentos_pastas_salmazos")
      .delete()
      .eq("id", id);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/documentos-pastas-salmazos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
