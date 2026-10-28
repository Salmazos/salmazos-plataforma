import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { buscarEmpresasCandidatas } from "@/lib/carteiraVinculo";

// Empresas da Carteira (prospects, sem cliente) da unidade do cliente com nome parecido: alimenta a pergunta "vincular?" logo após o cadastro.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;
  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const { data: cliente } = await svc.from("clientes").select("id, nome, unidade_id").eq("id", id).maybeSingle();
  if (!cliente || !cliente.unidade_id || !podeVerUnidade(ctx, cliente.unidade_id)) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const candidatas = await buscarEmpresasCandidatas(svc, cliente.nome as string, cliente.unidade_id as string);
  if (!candidatas) return NextResponse.json({ error: "Não foi possível consultar a Carteira." }, { status: 500 });
  return NextResponse.json({ data: candidatas });
}
