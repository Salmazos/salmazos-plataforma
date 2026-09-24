import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FuncionariosPageClient from "@/components/FuncionariosPageClient";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  if (!(await podeAcessarFuncionarios(user))) redirect("/painel");
  // RH por unidade (decisão do Olver, 24/09): supervisor só vê a própria unidade; sócios, todas.
  const ctxRH = await contextoRH(user);
  if (!ctxRH) return <SemAcessoPainel />;
  const unidadeRH = ctxRH.todasUnidades ? null : ctxRH.unidadeId;

  const svc = createServiceClient();
  let funcionariosQuery = svc.from("funcionarios").select("*, clientes(nome)").order("criado_em", { ascending: false });
  let clientesQuery = svc.from("clientes").select("id, nome").eq("ativo", true).order("nome");
  if (unidadeRH) {
    funcionariosQuery = funcionariosQuery.eq("unidade_id", unidadeRH);
    clientesQuery = clientesQuery.eq("unidade_id", unidadeRH);
  }

  const [{ data: funcionarios }, { data: clientes }, { data: asos }, { data: contratos }] = await Promise.all([
    funcionariosQuery,
    clientesQuery,
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
