import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Documentos — aberto por padrão a qualquer autenticado (comportamentoPadrao = true), igual
// hoje (antes só o middleware global garantia sessão, sem nenhum gate de papel/exceção
// próprio). Fase 2b aqui só habilita bloquear alguém específico via matriz no futuro — não
// restringe ninguém que já tem acesso.
export async function podeAcessarDocumentos(user: User): Promise<boolean> {
  return podeAcessarAba(user, "documentos", true);
}

export async function checarAcessoDocumentos(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarDocumentos(user))) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
