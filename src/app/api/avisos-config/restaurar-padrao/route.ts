import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, avisoConfigRestaurarPadraoSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { montarPayloadRestauracao } from "@/lib/avisosPadrao";
import { ROTULO_EVENTO, ROTULO_CANAL, ROTULO_GRUPO } from "@/lib/avisosCatalogo";

// Substitui a configuração atual do grupo pelo padrão versionado em src/lib/avisosPadrao.ts.
// A troca roda inteira numa função SQL (uma transação): ou aplica tudo ou nada.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const parsed = parseBody(avisoConfigRestaurarPadraoSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { grupo } = parsed.data;

  const svc = createServiceClient();
  const { data: analistas, error: errAnalistas } = await svc.from("analistas_perfil").select("user_id").eq("ativo", true);
  if (errAnalistas) return NextResponse.json({ error: errAnalistas.message }, { status: 500 });

  const { payload, ignorados, semDestinatario } = montarPayloadRestauracao(grupo, new Set((analistas ?? []).map((a) => a.user_id)));

  // Regra do último destinatário: nunca deixar um canal ligado sem ninguém.
  if (semDestinatario.length > 0) {
    const lista = semDestinatario.map((x) => `${ROTULO_EVENTO[x.evento] ?? x.evento} (${ROTULO_CANAL[x.canal]})`).join(", ");
    return NextResponse.json(
      { error: `Não foi possível restaurar: o padrão deixaria sem nenhum destinatário ativo, com o aviso ligado: ${lista}. Nada foi alterado.` },
      { status: 409 }
    );
  }

  const { data: total, error } = await svc.rpc("avisos_restaurar_padrao", { p_payload: payload });
  if (error) {
    if (error.code === "42883" || (/avisos_restaurar_padrao/.test(error.message) && /not exist|could not find/i.test(error.message))) {
      return NextResponse.json({ error: "A função de restauração ainda não foi criada no banco (migration migration_avisos_fase1b.sql pendente)." }, { status: 503 });
    }
    if (error.message.includes("ULTIMO_DESTINATARIO")) {
      return NextResponse.json({ error: "Não foi possível restaurar: algum aviso ficaria ligado sem destinatário ativo. Nada foi alterado." }, { status: 409 });
    }
    return NextResponse.json({ error: `Não foi possível restaurar o padrão: ${error.message}` }, { status: 400 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "aviso_padrao_restaurado",
    entidade: "aviso_destinatarios",
    entidade_id: grupo,
    detalhes: { grupo: ROTULO_GRUPO[grupo], destinatarios_gravados: total, usuarios_ignorados: ignorados },
  });

  return NextResponse.json({ data: { grupo, destinatarios: total, ignorados } });
}
