import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, acessoCustomizadoUpdateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { ABAS_POR_CHAVE } from "@/lib/abasConfig";

// Só superuser lê ou escreve aqui — é esta tabela que decide acesso a tudo mais, então é a
// mais protegida da plataforma (RLS já bloqueia a chave anon/authenticated por completo,
// ver supabase/migration_acesso_customizado.sql; este gate é a segunda camada).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const gate = checarPapelSuperuser(user);
  if (gate) return gate;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("usuario_acesso_customizado")
    .select("analista_perfil_id, chave_aba, liberado");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// Upsert de uma célula específica (analista_perfil_id + chave_aba). liberado=true/false grava
// a exceção; liberado=null volta pro estado "sem exceção" — deleta a linha em vez de gravar,
// pra podeAcessarAba() cair de volta no comportamento de papel padrão.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const gate = checarPapelSuperuser(user);
  if (gate) return gate;

  const body = await request.json();
  const parsed = parseBody(acessoCustomizadoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { analista_perfil_id, chave_aba, liberado } = parsed.data;

  if (!ABAS_POR_CHAVE.has(chave_aba)) {
    return NextResponse.json({ error: "chave_aba desconhecida." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo")
    .eq("id", analista_perfil_id)
    .single();
  if (!perfil) return NextResponse.json({ error: "Analista não encontrado." }, { status: 404 });

  const usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, svc);
  const rotulo = ABAS_POR_CHAVE.get(chave_aba)?.rotulo ?? chave_aba;

  if (liberado === null) {
    const { error } = await svc
      .from("usuario_acesso_customizado")
      .delete()
      .eq("analista_perfil_id", analista_perfil_id)
      .eq("chave_aba", chave_aba);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "acesso_customizado_removido",
      entidade: "usuario_acesso_customizado",
      entidade_id: analista_perfil_id,
      detalhes: { analista_nome: perfil.nome_completo, chave_aba, rotulo },
    });

    return NextResponse.json({ data: null });
  }

  // criado_por_user_id reflete quem gravou o valor atual da exceção (upsert sobrescreve em
  // toggles subsequentes) — o histórico completo de quem mudou o quê e quando fica em
  // audit_logs, não nesta coluna.
  const { data, error } = await svc
    .from("usuario_acesso_customizado")
    .upsert(
      { analista_perfil_id, chave_aba, liberado, criado_por_user_id: user.id },
      { onConflict: "analista_perfil_id,chave_aba" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: usuarioNome,
    acao: liberado ? "acesso_customizado_liberado" : "acesso_customizado_bloqueado",
    entidade: "usuario_acesso_customizado",
    entidade_id: analista_perfil_id,
    detalhes: { analista_nome: perfil.nome_completo, chave_aba, rotulo, liberado },
  });

  return NextResponse.json({ data });
}
