import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, avisoConfigDestinatarioUpdateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { bloqueioUltimoDestinatario } from "@/lib/avisosConfig";

async function autorizar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }), user: null };
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return { erro: acessoNegado, user: null };
  return { erro: null, user };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { erro, user } = await autorizar();
  if (erro || !user) return erro!;

  const parsed = parseBody(avisoConfigDestinatarioUpdateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data: atual } = await svc.from("aviso_destinatarios").select("*").eq("id", id).maybeSingle();
  if (!atual) return NextResponse.json({ error: "Destinatário não encontrado." }, { status: 404 });

  if (atual.ativo && !parsed.data.ativo) {
    const bloqueio = await bloqueioUltimoDestinatario(svc, atual.evento, atual.canal, id);
    if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: 409 });
  }

  const { data, error } = await svc.from("aviso_destinatarios").update({ ativo: parsed.data.ativo }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: parsed.data.ativo ? "aviso_destinatario_ativado" : "aviso_destinatario_desativado",
    entidade: "aviso_destinatarios",
    entidade_id: id,
    detalhes: { evento: atual.evento, canal: atual.canal, tipo_destinatario: atual.tipo_destinatario, nome: atual.nome, email: atual.email, usuario_id: atual.usuario_id },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { erro, user } = await autorizar();
  if (erro || !user) return erro!;

  const svc = createServiceClient();
  const { data: atual } = await svc.from("aviso_destinatarios").select("*").eq("id", id).maybeSingle();
  if (!atual) return NextResponse.json({ error: "Destinatário não encontrado." }, { status: 404 });

  if (atual.ativo) {
    const bloqueio = await bloqueioUltimoDestinatario(svc, atual.evento, atual.canal, id);
    if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: 409 });
  }

  const { error } = await svc.from("aviso_destinatarios").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "aviso_destinatario_removido",
    entidade: "aviso_destinatarios",
    entidade_id: id,
    detalhes: { evento: atual.evento, canal: atual.canal, tipo_destinatario: atual.tipo_destinatario, nome: atual.nome, email: atual.email, usuario_id: atual.usuario_id },
  });

  return NextResponse.json({ data: { id } });
}
