import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Vagas para onde uma indicação SEM vaga pode ser direcionada: do mesmo cliente, abertas, do mesmo tipo de serviço e da mesma
// unidade (as mesmas regras de validarDirecionamento, que o POST /direcionar confere de novo).
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const service = createServiceClient();
  const { data: sol } = await service.from("solicitacoes_indicacao_candidato").select("*").eq("id", id).maybeSingle();
  if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
  if (sol.status !== "pendente" || sol.vaga_id || !sol.tipo_servico) return NextResponse.json({ data: [] });

  const { data, error } = await service
    .from("vagas")
    .select("id, titulo, cidade, estado, tipo_servico")
    .eq("cliente_id", sol.cliente_id)
    .eq("status", "aberta")
    .eq("tipo_servico", sol.tipo_servico)
    .eq("unidade_id", sol.unidade_id)
    .order("titulo", { ascending: true });
  if (error) {
    console.error("[GET vagas-elegiveis]", error.message);
    return NextResponse.json({ error: "Não foi possível carregar as vagas." }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
