import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FuncionariosPageClient from "@/components/FuncionariosPageClient";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  if (!(await podeAcessarFuncionarios(user))) redirect("/painel");

  const svc = createServiceClient();

  const [{ data: funcionarios }, { data: clientes }, { data: asos }, { data: contratos }] = await Promise.all([
    svc.from("funcionarios").select("*, clientes(nome)").order("criado_em", { ascending: false }),
    svc.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
    svc.from("funcionario_asos").select("funcionario_id, data_exame").is("excluido_em", null).order("data_exame", { ascending: false }),
    svc.from("funcionario_contratos").select("funcionario_id").is("excluido_em", null),
  ]);

  // Filtro da listagem só deve oferecer empresas com funcionário cadastrado (evita uma
  // lista de 100+ clientes da carteira quando só um punhado tem gente de fato alocada).
  // O select de empresa do modal "Adicionar manualmente" continua usando a lista cheia —
  // lá o objetivo é justamente cadastrar o primeiro funcionário de uma empresa nova.
  const clienteIdsComFuncionario = new Set((funcionarios ?? []).map((f) => f.cliente_id).filter(Boolean));
  const clientesComFuncionario = (clientes ?? []).filter((c) => clienteIdsComFuncionario.has(c.id));

  // Já ordenado por data_exame desc, então o primeiro encontro de cada funcionario_id é o
  // exame mais recente — status do ASO é sempre calculado sobre essa linha (ver lib/asoStatus.ts).
  const asoMaisRecentePorFuncionario = new Map<string, string>();
  for (const a of asos ?? []) {
    if (!asoMaisRecentePorFuncionario.has(a.funcionario_id)) {
      asoMaisRecentePorFuncionario.set(a.funcionario_id, a.data_exame);
    }
  }
  // Contrato aqui é binário (Sim/Não) — só indica se existe pelo menos 1 registro em
  // funcionario_contratos, não excluído. O arquivo a abrir (o mais recente) é resolvido
  // pela própria rota /api/funcionarios/[id]/contrato-url, então não precisamos do
  // arquivo_path aqui na listagem.
  const funcionarioIdsComContrato = new Set((contratos ?? []).map((c) => c.funcionario_id));

  const funcionariosComAso = (funcionarios ?? []).map((f) => ({
    ...f,
    aso_data_exame_mais_recente: asoMaisRecentePorFuncionario.get(f.id) ?? null,
    tem_contrato: funcionarioIdsComContrato.has(f.id),
  }));

  return (
    <FuncionariosPageClient
      funcionariosIniciais={funcionariosComAso}
      clientes={clientes ?? []}
      clientesFiltro={clientesComFuncionario}
    />
  );
}
