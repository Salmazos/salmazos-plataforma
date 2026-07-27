import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Admissão Digital lida com dados sensíveis (CPF, RG, endereço, dados bancários, PIX) —
// acesso restrito a superuser/diretoria/supervisor/dp. "analista" foi removido de propósito
// (revertido depois de ter sido liberado por engano numa sessão anterior) e não deve voltar
// a ter acesso, nem pela tela (ver gates em src/app/painel/admissoes/**/page.tsx e
// requireSupervisor em SidebarMenu.tsx) nem por chamada direta à API — por isso toda rota
// administrativa do módulo (tudo em src/app/api/admissoes/** exceto o namespace
// público token/[token]/**, que não passa por aqui) precisa chamar isto depois do
// `if (!user)`.
// 'dp' foi incluído no mesmo nível de supervisor: a admissão digital alimenta a criação
// automática de `funcionarios` (ver gerar-pdf/route.ts), então quem cuida do Departamento
// Pessoal precisa poder acompanhar/gerenciar admissões, não só a lista de funcionários.
const PAPEIS_PAINEL_ADMISSOES = ["superuser", "diretoria", "supervisor", "dp"];

export function checarPapelAdmissoes(user: User): NextResponse | null {
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_ADMISSOES.includes(role)) {
    return NextResponse.json({ error: "Acesso restrito à equipe de RH." }, { status: 403 });
  }
  return null;
}
