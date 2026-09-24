import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { calcularVencimentoContratoMot } from "@/lib/contratoMotStatus";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import VencimentoContratoPageClient, { type VencimentoContratoRow } from "@/components/VencimentoContratoPageClient";

export const dynamic = "force-dynamic";

export default async function VencimentoContratoPage() {
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
  let funcionariosQuery = svc
    .from("funcionarios")
    .select("id, nome_completo, cliente_id, empresa, data_admissao, clientes(nome)")
    .eq("tipo_servico", "mao_obra_temporaria")
    .eq("status", "ativo")
    .not("data_admissao", "is", null);
  let clientesQuery = svc.from("clientes").select("id, nome").eq("ativo", true).order("nome");
  if (unidadeRH) {
    funcionariosQuery = funcionariosQuery.eq("unidade_id", unidadeRH);
    clientesQuery = clientesQuery.eq("unidade_id", unidadeRH);
  }

  // Só MOT ativo entra nesse relatório — Terceirização e R&S não têm o limite legal de
  // 90/180/270 dias (Lei 6.019/74), e desligado não tem mais decisão de renovação pendente
  // (ver histórico de rescisão em /painel/rescisoes pra isso).
  const [{ data: funcionarios }, { data: clientes }] = await Promise.all([
    funcionariosQuery,
    clientesQuery,
  ]);

  // Mesmo filtro de "só empresas com gente de fato alocada" já usado em
  // /painel/funcionarios — evita lista de 100+ clientes quando só um punhado tem MOT ativo.
  const clienteIdsComMot = new Set((funcionarios ?? []).map((f) => f.cliente_id).filter(Boolean));
  const clientesFiltro = (clientes ?? []).filter((c) => clienteIdsComMot.has(c.id));

  const linhas: VencimentoContratoRow[] = (funcionarios ?? [])
    .map((f) => {
      const v = calcularVencimentoContratoMot(f.data_admissao as string);
      // O embed clientes(nome) pode vir como objeto ou array conforme a inferência do
      // supabase-js — cast explícito pra as duas formas em vez de depender da inferência.
      const cliente = f.clientes as { nome: string } | { nome: string }[] | null;
      return {
        id: f.id,
        nomeCompleto: f.nome_completo,
        clienteId: f.cliente_id,
        empresa: (Array.isArray(cliente) ? cliente[0]?.nome : cliente?.nome) ?? f.empresa ?? "—",
        dataAdmissao: f.data_admissao as string,
        ...v,
      };
    })
    // Do mais perto do vencimento pro mais longe — inclui os já excedidos (dias negativos)
    // sempre no topo, por serem o risco de compliance mais urgente.
    .sort((a, b) => a.diasParaProximoVencimento - b.diasParaProximoVencimento);

  return <VencimentoContratoPageClient linhasIniciais={linhas} clientesFiltro={clientesFiltro} />;
}
