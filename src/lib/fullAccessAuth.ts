import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
