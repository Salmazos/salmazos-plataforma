import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { previaTs } from "@/lib/propostaServico";

// Prévia do cálculo da proposta de Terceirização para a tela: recebe o CONTEÚDO (serviços, postos, adicionais, benefícios...) e devolve a planilha calculada pelo
// SERVIDOR, com os percentuais vigentes. NÃO grava nada e NUNCA devolve percentuais (só valores; a margem real em pontos-base só para o gestor). Mesmas regras da
// criação: só quem pode escrever em Propostas e pode usar o TS; preço manual e ISS por proposta só da diretoria (403); percentuais de preço não configurados = 422.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const r = await exigirContextoPropostas(user);
  if (r.erro) return r.erro;

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return NextResponse.json({ error: "Informe o conteúdo da proposta." }, { status: 400 });

  const res = await previaTs(createServiceClient(), r.ctx, (corpo as { conteudo?: unknown }).conteudo);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.data });
}
