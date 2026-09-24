import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import RelatoriosPageClient from "@/components/RelatoriosPageClient";
import { ETAPAS_KANBAN_VISIVEIS } from "@/lib/constants";
import { podeAcessarRelatorios } from "@/lib/relatoriosAuth";
import { resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import SeletorUnidade from "@/components/SeletorUnidade";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ unidade?: string }> }) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarRelatorios(user))) redirect("/painel");

  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return <SemAcessoPainel />;

  const supabase = createServiceClient();

  // Mesmo modelo do Dashboard (decisão do Olver, 24/09): sócios escolhem Todas (padrão) ou
  // uma unidade; quem não vê todas as unidades (ex: supervisor) fica travado na própria.
  const { data: unidades } = await supabase.from("unidades").select("id, nome").order("nome");
  const { unidade: unidadeParam } = await searchParams;
  const unidadeSel: string | null = ctx.todasUnidades
    ? ((unidades ?? []).find((u) => u.id === unidadeParam)?.id ?? null)
    : ctx.unidadeId;

  const [{ data: candidatos }, { data: encaminhamentosTodos }, { data: clientesTodos }, { data: vagasTodas }, { data: candidatosVagasTodos }, { data: analistasPerfil }, { data: fluxoFinanceiroRSTodos }] =
    await Promise.all([
      supabase
        .from("candidatos")
        .select("id, responsavel, status, created_at"),
      supabase
        .from("encaminhamentos")
        .select("id, candidato_id, cliente_id, status, created_at, updated_at"),
      supabase
        .from("clientes")
        .select("id, nome, responsavel_comercial, ativo, unidade_id")
        .order("nome"),
      supabase
        .from("vagas")
        .select("id, titulo, status, data_abertura, data_fechamento, cliente_id, tipo_servico, responsavel, unidade_id, clientes(nome)")
        .order("data_fechamento", { ascending: false, nullsFirst: false }),
      // Fonte de verdade da etapa do candidato — não candidatos.etapa_kanban, que
      // não é atualizada de forma confiável (mesmo critério do Kanban/Dashboard).
      supabase
        .from("candidatos_vagas")
        .select("candidato_id, etapa, vaga_id")
        .in("etapa", ETAPAS_KANBAN_VISIVEIS),
      // candidatos.responsavel guarda o nome completo (atribuído via analistas_perfil,
      // desde 20/06/2026) — não o primeiro nome de ANALISTAS. Buscamos os nomes reais
      // aqui em vez de depender da constante desatualizada.
      supabase
        .from("analistas_perfil")
        .select("nome_completo, unidade_id")
        .eq("ativo", true)
        .order("nome_completo"),
      // Filtro por tipo_servico é feito no client (RelatoriosPageClient) — mais simples
      // e seguro do que filtrar por coluna de relação embutida via PostgREST aqui.
      supabase
        .from("candidatos_vagas")
        .select(
          "id, admissao_salario, admissao_fee_percentual, admissao_fee_valor, admissao_fee_prazo, admissao_fee_origem, fee_status, candidatos(nome_completo), vagas!candidatos_vagas_vaga_id_fkey!inner(titulo, tipo_servico, unidade_id, fee_rs_percentual, taxa_cancelamento, taxa_cancelamento_percentual, cliente_id, clientes(nome))"
        )
        .eq("etapa", "contratado"),
    ]);

  // Vaga e cliente têm unidade; candidatura e fluxo R&S herdam da vaga, encaminhamento do
  // cliente. Métricas por analista: só analistas da unidade (candidatos.responsavel = nome
  // completo). O banco de candidatos em si é compartilhado — não se filtra candidato.
  const naUnidade = (unidadeId: string | null | undefined) => !unidadeSel || unidadeId === unidadeSel;
  const vagas = (vagasTodas ?? []).filter((v) => naUnidade(v.unidade_id));
  const clientes = (clientesTodos ?? []).filter((c) => naUnidade(c.unidade_id));
  const vagaIds = new Set(vagas.map((v) => v.id));
  const clienteIds = new Set(clientes.map((c) => c.id));
  const candidatosVagas = (candidatosVagasTodos ?? []).filter((cv) => !unidadeSel || vagaIds.has(cv.vaga_id));
  const encaminhamentos = (encaminhamentosTodos ?? []).filter((e) => !unidadeSel || clienteIds.has(e.cliente_id));
  const fluxoFinanceiroRS = (fluxoFinanceiroRSTodos ?? []).filter((r) => {
    // PostgREST devolve o embed many-to-one como objeto, mas o tipo inferido é array.
    const vaga = r.vagas as unknown as { unidade_id: string } | null;
    return naUnidade(vaga?.unidade_id);
  });
  const analistas = (analistasPerfil ?? []).filter((a) => naUnidade(a.unidade_id));

  return (
    <>
    {ctx.todasUnidades && (
      <SeletorUnidade unidades={unidades ?? []} unidadeSel={unidadeSel} basePath="/painel/relatorios" />
    )}
    <RelatoriosPageClient
      candidatos={candidatos ?? []}
      encaminhamentos={encaminhamentos}
      clientes={clientes}
      vagas={vagas}
      candidatosVagas={candidatosVagas}
      analistas={analistas.map((a) => a.nome_completo)}
      fluxoFinanceiroRS={fluxoFinanceiroRS}
    />
    </>
  );
}
