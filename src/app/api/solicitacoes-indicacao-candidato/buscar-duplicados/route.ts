import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { buscarDuplicadosPorTelefone } from "@/lib/indicacaoDuplicados";

// Busca de candidatos duplicados por telefone ao revisar uma indicação direta.
// Retorna apenas a correspondência EXATA (normalizada: somente dígitos).
// Rota restrita a usuários internos (analista, supervisor, dp, diretoria, superuser).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const indicacaoId = request.nextUrl.searchParams.get("indicacao_id");
  if (!indicacaoId) {
    return NextResponse.json({ error: "indicacao_id é obrigatório." }, { status: 400 });
  }

  const service = createServiceClient();

  // Buscar a indicação pendente
  const { data: sol, error: solErr } = await service
    .from("solicitacoes_indicacao_candidato")
    .select("candidato_telefone, unidade_id")
    .eq("id", indicacaoId)
    .maybeSingle();

  if (solErr) {
    console.error("[buscar-duplicados] Erro ao buscar indicação:", solErr);
    return NextResponse.json({ error: "Erro ao buscar indicação." }, { status: 500 });
  }

  if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) {
    return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
  }

  const { duplicados, erro: erroBusca } = await buscarDuplicadosPorTelefone(service, sol.candidato_telefone);
  if (erroBusca) return NextResponse.json({ error: "Erro ao buscar candidatos." }, { status: 500 });

  return NextResponse.json({ duplicados });
}
