import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  // order("id") é o desempate: listas criadas num único comando têm criado_em idêntico, e sem ele o
  // Postgres pode devolver as linhas em outra ordem a cada consulta (a linha pula depois de um UPDATE).
  const [eventos, canais, destinatarios, usuarios] = await Promise.all([
    svc.from("aviso_eventos").select("evento, grupo, descricao, canais_suportados"),
    svc.from("aviso_eventos_canais").select("evento, canal, ativo"),
    svc.from("aviso_destinatarios").select("id, evento, canal, tipo_destinatario, usuario_id, email, nome, ativo, criado_em").order("criado_em").order("id"),
    svc.from("analistas_perfil").select("user_id, nome_completo, email").eq("ativo", true).order("nome_completo"),
  ]);

  const erro = eventos.error ?? canais.error ?? destinatarios.error;
  if (erro) {
    // Migration ainda não aplicada (ou erro de leitura): a tela explica em vez de quebrar.
    return NextResponse.json({ error: erro.message, migracaoPendente: true }, { status: 503 });
  }

  return NextResponse.json({
    eventos: eventos.data ?? [],
    canais: canais.data ?? [],
    destinatarios: destinatarios.data ?? [],
    usuarios: usuarios.data ?? [],
  });
}
