import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Quilometragem/Reembolsos expõe dado financeiro pessoal (km rodado, valores de reembolso).
// Sem isso, qualquer usuário autenticado podia forjar analista_id na URL e ler/editar/apagar
// registros de outro analista. "Gestor" (Fase 2b — migrado pro sistema central de exceção,
// ver podeAcessarAba): comportamento padrão continua PAPEIS_FULL_ACCESS/supervisor, mas uma
// exceção individual em usuario_acesso_customizado (chave_aba "reembolsos_quilometragem")
// sempre vence — libera quem o papel não liberaria, ou bloqueia quem o papel liberaria. O
// próprio analista_id nunca é afetado por isso: ver/editar os próprios registros continua
// liberado pra qualquer autenticado, independente de gestor.
export interface AcessoKm {
  analistaPerfilId: string | null;
  gestor: boolean;
}

export async function resolverAcessoKm(user: User): Promise<AcessoKm> {
  const role = user.app_metadata?.role ?? "analista";

  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nivel_acesso")
    .eq("user_id", user.id)
    .maybeSingle();

  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role) || perfil?.nivel_acesso === "supervisor";
  const gestor = await podeAcessarAba(user, "reembolsos_quilometragem", comportamentoPadrao);
  return { analistaPerfilId: perfil?.id ?? null, gestor };
}

// Para rotas que recebem analista_id explícito (query ou body). Sem id informado, nunca lista
// todo mundo por omissão: cai pro próprio analista_id do usuário, a não ser que ele seja
// gestor E a rota permita explicitamente o modo agregado (permitirTodosSemId).
export async function autorizarAnalistaId(
  user: User,
  analistaIdSolicitado: string | null,
  opts: { permitirTodosSemId?: boolean } = {}
): Promise<{ analistaId: string | null; erro: NextResponse | null }> {
  const { analistaPerfilId, gestor } = await resolverAcessoKm(user);

  if (!analistaIdSolicitado) {
    if (gestor && opts.permitirTodosSemId) return { analistaId: null, erro: null };
    if (!analistaPerfilId) {
      return {
        analistaId: null,
        erro: NextResponse.json({ error: "analista_id é obrigatório." }, { status: 400 }),
      };
    }
    return { analistaId: analistaPerfilId, erro: null };
  }

  if (gestor || analistaIdSolicitado === analistaPerfilId) {
    return { analistaId: analistaIdSolicitado, erro: null };
  }

  return {
    analistaId: null,
    erro: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }),
  };
}

// Para rotas que recebem id de registro/visita (não analista_id direto) — usar depois de
// buscar o analista_id dono do registro no banco.
export async function autorizarDonoRegistro(
  user: User,
  donoAnalistaId: string | null
): Promise<NextResponse | null> {
  const { analistaPerfilId, gestor } = await resolverAcessoKm(user);
  if (gestor) return null;
  if (donoAnalistaId && donoAnalistaId === analistaPerfilId) return null;
  return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
}
