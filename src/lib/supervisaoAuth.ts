import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Acesso ao módulo de Supervisão de Postos de Trabalho (Fase 2b — migrado pro sistema
// central de exceção, ver podeAcessarAba): comportamento padrão continua PAPEIS_FULL_ACCESS
// (diretoria/superuser, via app_metadata.role) OU analistas_perfil.nivel_acesso = 'supervisor',
// mas uma exceção individual em usuario_acesso_customizado (chave_aba "supervisao_postos")
// sempre vence — libera quem o papel não liberaria, ou bloqueia quem o papel liberaria.
// Diferente de Quilometragem, aqui não existe recorte de "dados próprios": é tudo ou nada
// pro módulo inteiro (o recorte de carteira por supervisor_responsavel_id em
// clientes_meta_supervisao continua acontecendo depois, sem relação com esta checagem).
// Precisa consultar o banco (perfilId é necessário pros callers filtrarem a carteira), por
// isso é assíncrono — mesmo padrão de checarAcessoCobrancaRS em fullAccessAuth.ts.
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

  const comportamentoPadrao = fullAccess || perfil?.nivel_acesso === "supervisor";
  const acesso = await podeAcessarAba(user, "supervisao_postos", comportamentoPadrao);

  return { acesso, fullAccess, analistaPerfilId: perfil?.id ?? null };
}

// Gate de rota de API (painel de supervisão) — 'analista' e 'dp' caem aqui como 403.
export async function checarApiAcessoSupervisao(user: User): Promise<NextResponse | null> {
  const { acesso } = await checarAcessoSupervisao(user);
  if (!acesso) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
