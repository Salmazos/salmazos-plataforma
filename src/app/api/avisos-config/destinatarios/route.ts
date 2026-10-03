import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, avisoConfigDestinatarioCreateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const parsed = parseBody(avisoConfigDestinatarioCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const { data: ev } = await svc.from("aviso_eventos").select("evento, canais_suportados").eq("evento", d.evento).maybeSingle();
  if (!ev) return NextResponse.json({ error: "Aviso não encontrado." }, { status: 404 });
  if (!(ev.canais_suportados ?? []).includes(d.canal)) {
    return NextResponse.json({ error: "Este aviso não suporta esse canal." }, { status: 400 });
  }

  let linha: Record<string, unknown>;
  let nomeAuditoria: string | null;
  if (d.tipo_destinatario === "usuario") {
    const { data: analista } = await svc
      .from("analistas_perfil")
      .select("user_id, ativo, nome_completo, email")
      .eq("user_id", d.usuario_id)
      .maybeSingle();
    if (!analista || !analista.ativo) {
      return NextResponse.json({ error: "Analista inativo ou não encontrado." }, { status: 400 });
    }
    if (d.canal === "email" && !analista.email) {
      return NextResponse.json({ error: "Este usuário não tem e-mail cadastrado." }, { status: 400 });
    }
    linha = { evento: d.evento, canal: d.canal, tipo_destinatario: "usuario", usuario_id: d.usuario_id, ativo: true };
    nomeAuditoria = analista.nome_completo ?? null;
  } else {
    if (d.canal === "sino") {
      return NextResponse.json({ error: "O sino só aceita usuários da plataforma." }, { status: 400 });
    }
    linha = {
      evento: d.evento,
      canal: d.canal,
      tipo_destinatario: "email",
      email: d.email.trim().toLowerCase(),
      nome: d.nome.trim(),
      ativo: true,
    };
    nomeAuditoria = d.nome.trim();
  }

  const { data, error } = await svc.from("aviso_destinatarios").insert(linha).select().single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Este destinatário já está cadastrado para este aviso." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "aviso_destinatario_adicionado",
    entidade: "aviso_destinatarios",
    entidade_id: data.id,
    detalhes: { evento: d.evento, canal: d.canal, tipo_destinatario: d.tipo_destinatario, nome: nomeAuditoria },
  });

  return NextResponse.json({ data }, { status: 201 });
}
