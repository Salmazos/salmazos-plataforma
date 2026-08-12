import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Fonte única para o nível de acesso "superuser/diretoria" — usado em telas de
// Configurações que não são superuser-exclusivas (Config. SLA, Log de E-mails, Avisos de
// Rescisão) mas também não abrem pra supervisor/dp. Antes disso `isFullAccess` era
// recalculado inline (`["superuser", "diretoria"].includes(role)`) em cada arquivo que
// precisava dele — mesmo risco de divergência silenciosa já corrigido antes pra
// PAPEIS_PAINEL_FUNCIONARIOS/PAPEIS_PAINEL_ADMISSOES. painel/layout.tsx (que decide o que
// aparece no Sidebar) importa esta mesma constante, então o gate real da página/API e o
// que o menu mostra nunca podem divergir.
export const PAPEIS_FULL_ACCESS = ["superuser", "diretoria"];

export function checarPapelFullAccess(user: User): NextResponse | null {
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}

// Mais restrito que checarPapelFullAccess — só "superuser", nem diretoria. Usado nas telas
// do grupo "Configurações" que o menu (SidebarMenu.tsx) já esconde de diretoria; antes dessa
// correção várias dessas rotas ainda aceitavam checarPapelFullAccess, criando a mesma falha
// de "menu escondido mas API ainda permite acesso direto por URL" que o gate do menu existe
// pra evitar.
export function checarPapelSuperuser(user: User): NextResponse | null {
  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}

// Acesso à tela de Cobrança R&S: PAPEIS_FULL_ACCESS sempre tem acesso, mais uma lista
// configurável de analistas/supervisores liberados individualmente pela diretoria (tabela
// cobranca_rs_analistas_acesso, gerenciada em /painel/cobranca-rs-acesso-config — essa tela
// em si continua restrita a PAPEIS_FULL_ACCESS, só quem já tem acesso total pode dar ou
// tirar o acesso de terceiros). Único helper de acesso do projeto que precisa consultar o
// banco (os demais resolvem tudo a partir de app_metadata.role) — por isso é assíncrono e
// devolve boolean puro em vez de NextResponse, pra servir igualmente ao gate de página
// (redirect), rotas de API (403) e ao cálculo de isFullAccess-like do Sidebar.
export async function checarAcessoCobrancaRS(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  if (PAPEIS_FULL_ACCESS.includes(role)) return true;

  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!perfil) return false;

  const { data: acesso } = await svc
    .from("cobranca_rs_analistas_acesso")
    .select("id")
    .eq("analista_perfil_id", perfil.id)
    .eq("ativo", true)
    .maybeSingle();

  return !!acesso;
}
