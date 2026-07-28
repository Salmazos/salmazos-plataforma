import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SidebarMenu from "@/components/SidebarMenu";
import PopupAniversariosHoje from "@/components/PopupAniversariosHoje";
import NotificacoesProvider from "@/components/NotificacoesProvider";
import { PAPEIS_PAINEL_FUNCIONARIOS } from "@/lib/funcionariosAuth";
import { PAPEIS_PAINEL_ADMISSOES } from "@/lib/admissaoAuth";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  const isFullAccess = ["superuser", "diretoria"].includes(role);
  const isSupervisorOrAbove = ["superuser", "diretoria", "supervisor"].includes(role);
  // 'dp' é um papel dedicado ao Departamento Pessoal — não entra em isSupervisorOrAbove
  // porque isso liberaria Relatórios e Carteira de Clientes, fora do escopo do DP. Tem
  // flags próprias só para os módulos que o DP realmente usa: Funcionários/Rescisões
  // (sempre) e Admissões (mesmo nível de acesso que supervisor — a admissão digital
  // alimenta a criação automática de funcionários). Importadas de funcionariosAuth.ts/
  // admissaoAuth.ts em vez de reescritas aqui — mesma fonte usada pelos gates reais de
  // página/API, pra nunca divergir do que o Sidebar mostra.
  const canAccessFuncionarios = PAPEIS_PAINEL_FUNCIONARIOS.includes(role);
  const canAccessAdmissoes = PAPEIS_PAINEL_ADMISSOES.includes(role);

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("id, nome_completo, cargo, avatar_url, nivel_acesso")
    .eq("user_id", user.id)
    .single();

  return (
    <NotificacoesProvider>
      <div className="min-h-screen bg-gray-100 flex">
        <SidebarMenu
          userEmail={user.email ?? ""}
          userName={perfil?.nome_completo ?? null}
          userCargo={perfil?.cargo ?? null}
          userAvatar={perfil?.avatar_url ?? null}
          role={role}
          isFullAccess={isFullAccess}
          isSupervisorOrAbove={isSupervisorOrAbove}
          canAccessFuncionarios={canAccessFuncionarios}
          canAccessAdmissoes={canAccessAdmissoes}
        />
        <main className="flex-1 min-w-0 px-6 py-6">{children}</main>
        <PopupAniversariosHoje />
      </div>
    </NotificacoesProvider>
  );
}
