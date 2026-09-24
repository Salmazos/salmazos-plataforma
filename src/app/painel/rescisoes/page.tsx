import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import RescisoesPageClient from "@/components/RescisoesPageClient";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";

export const dynamic = "force-dynamic";

export default async function RescisoesPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!(await podeAcessarFuncionarios(user))) redirect("/painel");
  const isFullAccess = PAPEIS_FULL_ACCESS.includes(role);
  // RH por unidade (decisão do Olver, 24/09): supervisor só vê a própria unidade; sócios, todas.
  const ctxRH = await contextoRH(user);
  if (!ctxRH) return <SemAcessoPainel />;
  const unidadeRH = ctxRH.todasUnidades ? null : ctxRH.unidadeId;

  const svc = createServiceClient();
  let rescisoesQuery = svc
    .from("rescisoes")
    .select("*, funcionarios(nome_completo, cargo)")
    .order("data_desligamento", { ascending: false });
  let clientesQuery = svc.from("clientes").select("id, nome").eq("ativo", true).order("nome");
  if (unidadeRH) {
    rescisoesQuery = rescisoesQuery.eq("unidade_id", unidadeRH);
    clientesQuery = clientesQuery.eq("unidade_id", unidadeRH);
  }

  const [{ data: rescisoes }, { data: clientes }] = await Promise.all([
    rescisoesQuery,
    clientesQuery,
  ]);

  return (
    <RescisoesPageClient
      rescisoesIniciais={rescisoes ?? []}
      clientes={clientes ?? []}
      isFullAccess={isFullAccess}
    />
  );
}
