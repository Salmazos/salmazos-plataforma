import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FuncionariosPageClient from "@/components/FuncionariosPageClient";
import { PAPEIS_PAINEL_FUNCIONARIOS } from "@/lib/funcionariosAuth";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_FUNCIONARIOS.includes(role)) redirect("/painel");

  const svc = createServiceClient();

  const [{ data: funcionarios }, { data: clientes }] = await Promise.all([
    svc.from("funcionarios").select("*, clientes(nome)").order("criado_em", { ascending: false }),
    svc.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // Filtro da listagem só deve oferecer empresas com funcionário cadastrado (evita uma
  // lista de 100+ clientes da carteira quando só um punhado tem gente de fato alocada).
  // O select de empresa do modal "Adicionar manualmente" continua usando a lista cheia —
  // lá o objetivo é justamente cadastrar o primeiro funcionário de uma empresa nova.
  const clienteIdsComFuncionario = new Set((funcionarios ?? []).map((f) => f.cliente_id).filter(Boolean));
  const clientesComFuncionario = (clientes ?? []).filter((c) => clienteIdsComFuncionario.has(c.id));

  return (
    <FuncionariosPageClient
      funcionariosIniciais={funcionarios ?? []}
      clientes={clientes ?? []}
      clientesFiltro={clientesComFuncionario}
    />
  );
}
