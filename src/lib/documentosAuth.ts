import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";
import { checarAcessoCliente } from "@/lib/unidadeAuth";

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

// Retrofit SBC (decisão do Olver, 24/09): documento de CLIENTE fica na unidade do cliente —
// cada unidade só vê/baixa/sobe/apaga os dos seus clientes (sócios veem todos). Documento
// interno da Salmazos (pastas, sem cliente) é da empresa e fica compartilhado entre as
// unidades. O caminho no Storage segue sempre "clientes/<cliente_id>/..." ou
// "salmazos/<pasta_id>/..." (DocumentosPageClient; conferido nos 12 existentes em 24/09) —
// qualquer outro formato é recusado, em vez de assinar um caminho que não se sabe de quem é.
export async function checarAcessoCaminhoDocumento(user: User, path: string): Promise<NextResponse | null> {
  if (path.startsWith("salmazos/")) return null;
  const clienteId = /^clientes\/([0-9a-f-]{36})\//.exec(path)?.[1];
  if (!clienteId) return NextResponse.json({ error: "Caminho de documento inválido." }, { status: 400 });
  return checarAcessoCliente(user, clienteId);
}
