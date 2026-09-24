import { createClient, createServiceClient } from "@/lib/supabase/server";
import BancoCandidatosClient from "@/components/BancoCandidatosClient";
import type { CandidatoRow, VagaInteresseInfo } from "@/components/BancoCandidatosClient";
import { contextoUnidadeDaSessao, podeVerUnidade } from "@/lib/unidadeAuth";

export const dynamic = "force-dynamic";

const CANDIDATOS_SELECT =
  "id, nome_completo, cpf, idade, genero, cargo_pretendido, cidade, origem, triagem_score, triagem_label, triagem_resumo, melhor_match_score, melhor_match_vaga_titulo, juridico_tem_trabalhista, juridico_total_processos, juridico_consultado_em, escavador_status, bloqueado, created_at, status_alocacao, alocacao_cliente_nome, alocacao_vaga_titulo, alocacao_data_inicio, alocacao_data_fim, alocacao_tipo_servico, resumo_profissional, resumo_candidato, experiencias_profissionais, habilidades, formacao_academica, vagas_interesse, reprovado_internamente, matches_calculados";

const PAGE_SIZES = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

type SearchParams = {
  alocacao?: string;
  nome?: string;
  cargo?: string;
  cidade?: string;
  idadeMin?: string;
  idadeMax?: string;
  score?: string;
  match?: string;
  kw?: string;
  origem?: string;
  genero?: string;
  semGenero?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

// Reaplicado em três lugares (lista paginada, contagem "filtrado" e nas
// contagens por aba só quando a aba não é a ativa) -- centralizado aqui pra
// não divergir. NÃO inclui o filtro de aba (status_alocacao), que é aplicado
// à parte por quem chama.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarFiltros(query: any, params: SearchParams) {
  const nome = params.nome?.trim();
  const cargo = params.cargo?.trim();
  const cidade = params.cidade?.trim();
  const kw = params.kw?.trim();
  const idadeMin = params.idadeMin ? parseInt(params.idadeMin, 10) : null;
  const idadeMax = params.idadeMax ? parseInt(params.idadeMax, 10) : null;
  const scoreMin = params.score ? parseInt(params.score, 10) : null;
  const matchMin = params.match ? parseInt(params.match, 10) : null;

  let q = query;
  if (nome) q = q.ilike("nome_completo", `%${nome}%`);
  if (cargo) q = q.ilike("cargo_pretendido", `%${cargo}%`);
  if (cidade) q = q.ilike("cidade", `%${cidade}%`);
  if (idadeMin !== null && !Number.isNaN(idadeMin)) q = q.gte("idade", idadeMin);
  if (idadeMax !== null && !Number.isNaN(idadeMax)) q = q.lte("idade", idadeMax);
  if (scoreMin !== null && !Number.isNaN(scoreMin)) q = q.gte("triagem_score", scoreMin);
  if (matchMin !== null && !Number.isNaN(matchMin)) q = q.gte("melhor_match_score", matchMin);
  if (params.origem) {
    // origem nula é tratada como "cadastro_rapido" no restante do sistema
    // (ver OrigemBadge em BancoCandidatosClient.tsx) -- replica aqui.
    if (params.origem === "cadastro_rapido") q = q.or("origem.eq.cadastro_rapido,origem.is.null");
    else q = q.eq("origem", params.origem);
  }
  if (params.genero) q = q.eq("genero", params.genero);
  if (params.semGenero === "1") q = q.is("genero", null);
  if (kw) q = q.ilike("busca_texto", `%${kw}%`);
  return q;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarFiltroAba(query: any, alocacao: string) {
  if (alocacao === "disponivel") return query.or("status_alocacao.is.null,status_alocacao.eq.disponivel");
  if (alocacao === "alocado_mot" || alocacao === "alocado_rs" || alocacao === "alocado_terceirizacao") {
    return query.eq("status_alocacao", alocacao);
  }
  return query; // "todos"
}

export default async function BancoCandidatosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const authClient = await createClient();

  const alocacao = params.alocacao ?? "disponivel";
  const pageSize = PAGE_SIZES.includes(Number(params.pageSize) as (typeof PAGE_SIZES)[number])
    ? Number(params.pageSize)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * pageSize;

  let listaQuery = supabase.from("candidatos").select(CANDIDATOS_SELECT, { count: "exact" });
  listaQuery = aplicarFiltroAba(listaQuery, alocacao);
  listaQuery = aplicarFiltros(listaQuery, params);
  listaQuery =
    params.sort === "nome_asc"
      ? listaQuery.order("nome_completo", { ascending: true })
      : params.sort === "nome_desc"
      ? listaQuery.order("nome_completo", { ascending: false })
      : listaQuery.order("created_at", { ascending: false });
  listaQuery = listaQuery.range(offset, offset + pageSize - 1);

  const [
    { data, count: totalFiltrado },
    { count: totalGeral },
    { count: countDisponivel },
    { count: countMot },
    { count: countRs },
    { count: countTerc },
    { data: { user } },
  ] = await Promise.all([
    listaQuery,
    supabase.from("candidatos").select("id", { count: "exact", head: true }),
    aplicarFiltroAba(supabase.from("candidatos").select("id", { count: "exact", head: true }), "disponivel"),
    supabase.from("candidatos").select("id", { count: "exact", head: true }).eq("status_alocacao", "alocado_mot"),
    supabase.from("candidatos").select("id", { count: "exact", head: true }).eq("status_alocacao", "alocado_rs"),
    supabase.from("candidatos").select("id", { count: "exact", head: true }).eq("status_alocacao", "alocado_terceirizacao"),
    authClient.auth.getUser(),
  ]);

  const [analistaPerfil, ativosResult] = await Promise.all([
    user
      ? supabase.from("analistas_perfil").select("nome_completo").eq("user_id", user.id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("candidatos_vagas")
      .select("candidato_id")
      .in("etapa", ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"]),
  ]);

  const analistaNome = analistaPerfil.data?.nome_completo ?? "";
  const idsEmProcesso = [...new Set((ativosResult.data ?? []).map((r: { candidato_id: string }) => r.candidato_id))];

  // Títulos das vagas em que os candidatos desta página se inscreveram (chip "vaga de
  // interesse"), com QUALQUER status — antes o chip só achava o título entre as vagas
  // abertas e, com a vaga pausada/fechada, mostrava o começo do id. Vaga de outra unidade
  // não expõe o título (mesma regra de unidade do resto do Recrutamento).
  const idsInteresse = [
    ...new Set(((data ?? []) as CandidatoRow[]).flatMap((c) => c.vagas_interesse ?? [])),
  ];
  const vagasInteresse: Record<string, VagaInteresseInfo> = {};
  if (idsInteresse.length > 0) {
    const ctx = await contextoUnidadeDaSessao();
    const { data: vagasRows } = await supabase
      .from("vagas")
      .select("id, titulo, status, unidade_id")
      .in("id", idsInteresse);
    for (const v of vagasRows ?? []) {
      const visivel = ctx ? podeVerUnidade(ctx, v.unidade_id) : false;
      vagasInteresse[v.id] = visivel
        ? { titulo: v.titulo, status: v.status }
        : { titulo: "Vaga de outra unidade", status: null };
    }
  }

  return (
    <BancoCandidatosClient
      candidatos={(data ?? []) as CandidatoRow[]}
      analista={analistaNome}
      idsEmProcesso={idsEmProcesso}
      vagasInteresse={vagasInteresse}
      totalGeral={totalGeral ?? 0}
      totalFiltrado={totalFiltrado ?? 0}
      contagensAbas={{
        todos: totalGeral ?? 0,
        disponivel: countDisponivel ?? 0,
        alocado_mot: countMot ?? 0,
        alocado_rs: countRs ?? 0,
        alocado_terceirizacao: countTerc ?? 0,
      }}
      pagina={page}
      pageSize={pageSize}
    />
  );
}
