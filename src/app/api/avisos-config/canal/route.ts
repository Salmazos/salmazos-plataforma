import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, avisoConfigCanalSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { eventoEmailCliente } from "@/lib/avisosCatalogo";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const parsed = parseBody(avisoConfigCanalSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { evento, canal, ativo } = parsed.data;

  // E-mails ao cliente só têm o canal e-mail (liga/desliga), nunca sino nem popup.
  if (eventoEmailCliente(evento) && canal !== "email") {
    return NextResponse.json({ error: "Este aviso só tem o canal e-mail." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: ev } = await svc.from("aviso_eventos").select("evento, canais_suportados").eq("evento", evento).maybeSingle();
  if (!ev) return NextResponse.json({ error: "Aviso não encontrado." }, { status: 404 });
  if (!(ev.canais_suportados ?? []).includes(canal)) {
    return NextResponse.json({ error: "Este aviso não suporta esse canal." }, { status: 400 });
  }

  const { error } = await svc
    .from("aviso_eventos_canais")
    .upsert({ evento, canal, ativo, atualizado_em: new Date().toISOString() }, { onConflict: "evento,canal" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: ativo ? "aviso_canal_ligado" : "aviso_canal_desligado",
    entidade: "aviso_eventos_canais",
    entidade_id: `${evento}:${canal}`,
    detalhes: { evento, canal, ativo },
  });

  return NextResponse.json({ data: { evento, canal, ativo } });
}
