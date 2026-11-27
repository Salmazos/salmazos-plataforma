import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { carregarProposta, ehDonoDaProposta, podeVerProposta, previaTs } from "@/lib/propostaServico";

// Prévia do cálculo da proposta de Terceirização para a tela: recebe o CONTEÚDO (serviços, postos, adicionais, benefícios...) e devolve a planilha calculada pelo
// SERVIDOR, com os percentuais vigentes. NÃO grava nada. O vendedor recebe SÓ o preço mensal por posto e o total; custo e ganho vão apenas para gestor/diretoria. Mesmas regras da
// criação: só quem pode escrever em Propostas e pode usar o TS. Na edição (proposta_id) vale o ganho e o preço manual já gravados, como no salvar. Fora isso, preço manual e ganho por proposta só de gestor/diretoria (403); sem ganho definido = 422.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const r = await exigirContextoPropostas(user);
  if (r.erro) return r.erro;

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return NextResponse.json({ error: "Informe o conteúdo da proposta." }, { status: 400 });

  const { conteudo, proposta_id, posicoes } = corpo as { conteudo?: unknown; proposta_id?: unknown; posicoes?: unknown };
  const svc = createServiceClient();
  // Edição de proposta salva: o mesmo acesso do salvar (quem não vê recebe 404; quem só acompanha, 403).
  let salva: { proposta: NonNullable<Awaited<ReturnType<typeof carregarProposta>>>; posicoes?: unknown } | undefined;
  if (proposta_id !== undefined) {
    const proposta = typeof proposta_id === "string" ? await carregarProposta(svc, proposta_id) : null;
    if (!proposta || proposta.modelo !== "TS" || !podeVerProposta(r.ctx, proposta)) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
    if (!ehDonoDaProposta(r.ctx, proposta)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    salva = { proposta, posicoes };
  }

  const res = await previaTs(svc, r.ctx, conteudo, salva);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.data });
}
