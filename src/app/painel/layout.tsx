import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import SidebarMenu from "@/components/SidebarMenu";
import PopupAniversariosHoje from "@/components/PopupAniversariosHoje";
import PopupRescisoesHoje from "@/components/PopupRescisoesHoje";
import PopupAsoPeriodicoHoje from "@/components/PopupAsoPeriodicoHoje";
import PopupCobrancasRSPendentes from "@/components/PopupCobrancasRSPendentes";
import PopupSupervisaoPendente from "@/components/PopupSupervisaoPendente";
import NotificacoesProvider from "@/components/NotificacoesProvider";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { podeAcessarAdmissoes } from "@/lib/admissaoAuth";
import { PAPEIS_FULL_ACCESS, checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";
import { checarAcessoSupervisao } from "@/lib/supervisaoAuth";
import { podeAcessarAniversarios } from "@/lib/aniversariosAuth";
import { podeAcessarFinanceiroRs } from "@/lib/financeiroRsAuth";
import { podeAcessarFaturamentoRs } from "@/lib/faturamentoRsAuth";
import { podeAcessarRelatorios } from "@/lib/relatoriosAuth";
import { podeAcessarDashboard } from "@/lib/dashboardAuth";

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
  const isFullAccess = PAPEIS_FULL_ACCESS.includes(role);
  const isSupervisorOrAbove = ["superuser", "diretoria", "supervisor"].includes(role);
  // 'dp' é um papel dedicado ao Departamento Pessoal — não entra em isSupervisorOrAbove
  // porque isso liberaria Relatórios e Carteira de Clientes, fora do escopo do DP. Tem
  // flags próprias só para os módulos que o DP realmente usa: Funcionários/Rescisões
  // (sempre) e Admissões (mesmo nível de acesso que supervisor — a admissão digital
  // alimenta a criação automática de funcionários). Importadas de funcionariosAuth.ts/
  // admissaoAuth.ts em vez de reescritas aqui — mesma fonte usada pelos gates reais de
  // página/API, pra nunca divergir do que o Sidebar mostra.
  const canAccessFuncionarios = await podeAcessarFuncionarios(user);
  const canAccessAdmissoes = await podeAcessarAdmissoes(user);
  const canAccessCobrancasRS = await checarAcessoCobrancaRS(user);
  // Acesso restrito: sem acesso amplo, mas já gerou pelo menos uma cobrança própria
  // (independente do status — continua enxergando o link mesmo depois de
  // aprovada/paga, pra acessar o histórico do que ele mesmo gerou). Só consulta o banco
  // quando falta o acesso amplo — quem já tem canAccessCobrancasRS não precisa disso.
  let temCobrancasGeradas = false;
  if (!canAccessCobrancasRS) {
    const svc = createServiceClient();
    const { data: minhas } = await svc
      .from("cobrancas_rs")
      .select("id")
      .eq("gerado_por_user_id", user.id)
      .limit(1);
    temCobrancasGeradas = !!minhas && minhas.length > 0;
  }
  const canAccessSupervisao = (await checarAcessoSupervisao(user)).acesso;
  const canAccessAniversarios = await podeAcessarAniversarios(user);
  const canAccessFinanceiroRs = await podeAcessarFinanceiroRs(user);
  const canAccessFaturamentoRs = await podeAcessarFaturamentoRs(user);
  const canAccessRelatorios = await podeAcessarRelatorios(user);
  const canAccessDashboard = await podeAcessarDashboard(user);

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
          canAccessAniversarios={canAccessAniversarios}
          canAccessCobrancasRS={canAccessCobrancasRS}
          temCobrancasGeradas={temCobrancasGeradas}
          canAccessSupervisao={canAccessSupervisao}
          canAccessFinanceiroRs={canAccessFinanceiroRs}
          canAccessFaturamentoRs={canAccessFaturamentoRs}
          canAccessRelatorios={canAccessRelatorios}
          canAccessDashboard={canAccessDashboard}
        />
        <main className="flex-1 min-w-0 px-6 py-6">{children}</main>
        <PopupAniversariosHoje />
        <PopupRescisoesHoje />
        <PopupAsoPeriodicoHoje />
        <PopupCobrancasRSPendentes />
        <PopupSupervisaoPendente />
      </div>
    </NotificacoesProvider>
  );
}
