import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FuncionariosPageClient from "@/components/FuncionariosPageClient";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import { resolverFotosFuncionarios } from "@/lib/funcionarioFoto";
import { faltasDoCadastro, type PerfilFuncionario } from "@/lib/funcionarioPerfil";

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

  const fotoUrlPorFuncionario = await resolverFotosFuncionarios(
    (funcionarios ?? []).map((f) => ({ id: f.id, foto_path: f.foto_path, admissao_id: f.admissao_id }))
  );

  // "Cadastro incompleto": só ATIVO sem admissão (a admissão é a fonte dos demais). Duas consultas no total, só quando há legado; tabela ausente = vazio.
  const legadosAtivos = (funcionarios ?? []).filter((f) => f.status === "ativo" && !f.admissao_id).map((f) => f.id);
  const perfilPorFuncionario = new Map<string, PerfilFuncionario>();
  const filhosPorFuncionario = new Map<string, number>();
  if (legadosAtivos.length > 0) {
    const [{ data: perfis }, { data: filhos }] = await Promise.all([
      svc.from("funcionario_perfil").select("funcionario_id, sexo, data_nascimento, grau_instrucao, filhos_informado_em").in("funcionario_id", legadosAtivos),
      svc.from("funcionario_filhos").select("funcionario_id").in("funcionario_id", legadosAtivos),
    ]);
    for (const p of (perfis ?? []) as (PerfilFuncionario & { funcionario_id: string })[]) perfilPorFuncionario.set(p.funcionario_id, p);
    for (const c of (filhos ?? []) as { funcionario_id: string }[]) filhosPorFuncionario.set(c.funcionario_id, (filhosPorFuncionario.get(c.funcionario_id) ?? 0) + 1);
  }

  const funcionariosComAso = (funcionarios ?? []).map((f) => ({
    ...f,
    faltas_cadastro: f.status === "ativo" ? faltasDoCadastro(f.admissao_id, perfilPorFuncionario.get(f.id), filhosPorFuncionario.get(f.id) ?? 0) : [],
    aso_data_exame_mais_recente: asoMaisRecentePorFuncionario.get(f.id) ?? null,
    tem_contrato: funcionarioIdsComContrato.has(f.id),
    foto_url: fotoUrlPorFuncionario.get(f.id) ?? null,
  }));

  return (
    <FuncionariosPageClient
      funcionariosIniciais={funcionariosComAso}
      clientes={clientes ?? []}
      clientesFiltro={clientesComFuncionario}
    />
  );
}
