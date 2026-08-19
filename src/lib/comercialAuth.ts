import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Clientes — aberto por padrão a qualquer autenticado (comportamentoPadrao = true), igual
// hoje. Fase 2b aqui só habilita bloquear alguém específico via matriz no futuro — não
// restringe ninguém que já tem acesso. O sub-recurso "Atenção Especial" (PATCH
// /api/clientes/[id]/atencao-especial) tem uma trava adicional própria e mais restrita
// (superuser/diretoria, direto no route handler) — continua intocada, é checagem separada,
// não a mesma coisa.
export async function podeAcessarClientes(user: User): Promise<boolean> {
  return podeAcessarAba(user, "comercial_clientes", true);
}

export async function checarAcessoClientes(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarClientes(user))) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}

// Carteira de Clientes (empresas-visitadas) — restrito por padrão a
// PAPEIS_FULL_ACCESS/supervisor, replicando a allowlist que já existia só na página
// (empresas-visitadas/page.tsx). Fase 2b CORRIGE um furo real aqui: a API
// /api/km/empresas-visitadas não tinha nenhuma checagem de papel, só sessão — qualquer
// autenticado conseguia ler a carteira inteira direto pela API, mesmo com o link escondido
// no Sidebar e a página bloqueada (mesmo tipo de furo já corrigido em Quilometragem).
// Precisa consultar analistas_perfil.nivel_acesso pra achar "supervisor" — só
// app_metadata.role não basta, mesmo padrão de resolverAcessoKm/checarAcessoSupervisao.
export async function podeAcessarCarteiraClientes(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("nivel_acesso")
    .eq("user_id", user.id)
    .maybeSingle();
  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role) || perfil?.nivel_acesso === "supervisor";
  return podeAcessarAba(user, "comercial_carteira", comportamentoPadrao);
}

export async function checarAcessoCarteiraClientes(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarCarteiraClientes(user))) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}

// Gestão de Clientes — aberto por padrão a qualquer autenticado (comportamentoPadrao = true),
// igual hoje. Sem rota de API própria — a tela inteira é montada no server component.
export async function podeAcessarGestaoClientes(user: User): Promise<boolean> {
  return podeAcessarAba(user, "comercial_gestao", true);
}
