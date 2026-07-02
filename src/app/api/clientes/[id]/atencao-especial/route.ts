import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, clienteAtencaoEspecialSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Marca/desmarca "Atenção Especial" num cliente — restrito a superuser/diretoria.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = user.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria"].includes(role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = parseBody(clienteAtencaoEspecialSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { atencao_especial, nota } = parsed.data;

  const svc = createServiceClient();

  const updates = atencao_especial
    ? {
        atencao_especial: true,
        atencao_especial_nota: nota?.trim() || null,
        atencao_especial_marcado_em: new Date().toISOString(),
        atencao_especial_marcado_por: user.id,
      }
    : {
        atencao_especial: false,
        atencao_especial_nota: null,
        atencao_especial_marcado_em: null,
        atencao_especial_marcado_por: null,
      };

  const { data, error } = await svc
    .from("clientes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // NOTA: registrarAuditoria é fire-and-forget (sem waitUntil) — ver observação
  // reportada separadamente sobre possível perda silenciosa de escritas em audit_logs.
  // A leitura de "quem marcou" nesta feature NÃO depende de audit_logs (usa
  // atencao_especial_marcado_por + analistas_perfil), então não é afetada por isso.
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: atencao_especial ? "cliente_atencao_especial_marcada" : "cliente_atencao_especial_removida",
    entidade: "clientes",
    entidade_id: id,
    detalhes: { nota: nota ?? null },
  });

  return NextResponse.json({ data });
}
