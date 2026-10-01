import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, avisoVagaEmailAtivoSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(avisoVagaEmailAtivoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("aviso_vaga_config")
    .update({ email_ativo: parsed.data.email_ativo, atualizado_em: new Date().toISOString() })
    .eq("evento", parsed.data.evento)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "aviso_vaga_email_ativo_alterado",
    entidade: "aviso_vaga_config",
    entidade_id: parsed.data.evento,
    detalhes: { evento: parsed.data.evento, email_ativo: parsed.data.email_ativo },
  });

  return NextResponse.json({ data });
}
