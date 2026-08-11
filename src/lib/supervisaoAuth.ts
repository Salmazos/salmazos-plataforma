import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

// Acesso ao módulo de Supervisão de Postos de Trabalho tem duas fontes: PAPEIS_FULL_ACCESS
// (diretoria/superuser, via app_metadata.role — mesma fonte usada em todo o resto do
// projeto) vê tudo; analistas_perfil.nivel_acesso = 'supervisor' vê só a própria carteira
// (clientes onde é supervisor_responsavel_id em clientes_meta_supervisao). Precisa consultar
// o banco (perfilId é necessário pros callers filtrarem a carteira), por isso é assíncrono —
// mesmo padrão de checarAcessoCobrancaRS em fullAccessAuth.ts.
export interface AcessoSupervisao {
  acesso: boolean;
  fullAccess: boolean;
  analistaPerfilId: string | null;
}

export async function checarAcessoSupervisao(user: User): Promise<AcessoSupervisao> {
  const role = user.app_metadata?.role ?? "analista";
  const fullAccess = PAPEIS_FULL_ACCESS.includes(role);

  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nivel_acesso")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fullAccess) {
    return { acesso: true, fullAccess: true, analistaPerfilId: perfil?.id ?? null };
  }
  if (perfil?.nivel_acesso === "supervisor") {
    return { acesso: true, fullAccess: false, analistaPerfilId: perfil.id };
  }
  return { acesso: false, fullAccess: false, analistaPerfilId: perfil?.id ?? null };
}

// Gate de rota de API (painel de supervisão) — 'analista' e 'dp' caem aqui como 403.
export async function checarApiAcessoSupervisao(user: User): Promise<NextResponse | null> {
  const { acesso } = await checarAcessoSupervisao(user);
  if (!acesso) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
