import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, empresaVincularClienteSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Liga uma empresa da Carteira (prospect) a um cliente já cadastrado, por escolha explícita de quem usa a tela (nunca automático).
// Mesmo gate do cadastro de clientes: o vínculo é sobre o cadastro do cliente. Empresa e cliente têm que ser da mesma unidade, e uma empresa
// que já tem outro cliente nunca é sobrescrita.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;
  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;
  if (!UUID.test(id)) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const parsed = parseBody(empresaVincularClienteSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const clienteId = parsed.data.cliente_id;

  const svc = createServiceClient();
  const { data: empresa } = await svc.from("empresas_visitadas").select("id, nome, unidade_id, cliente_id").eq("id", id).maybeSingle();
  if (!empresa || !podeVerUnidade(ctx, empresa.unidade_id)) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const { data: cliente } = await svc.from("clientes").select("id, nome, unidade_id, ativo").eq("id", clienteId).maybeSingle();
  if (!cliente || !podeVerUnidade(ctx, cliente.unidade_id)) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (cliente.unidade_id !== empresa.unidade_id) return NextResponse.json({ error: "A empresa e o cliente precisam ser da mesma unidade." }, { status: 400 });
  if (!cliente.ativo) return NextResponse.json({ error: "Este cliente está inativo. Reative o cadastro antes de vincular." }, { status: 409 });

  const mensagemJaTem = "Esta empresa da Carteira já está vinculada a outro cliente. Nada foi alterado.";
  if (empresa.cliente_id) {
    if (empresa.cliente_id === clienteId) return NextResponse.json({ data: { id: empresa.id, cliente_id: clienteId } });
    return NextResponse.json({ error: mensagemJaTem }, { status: 409 });
  }

  // Condicional: só liga se ainda estiver sem cliente (corrida com outro usuário).
  const { data: atualizadas, error } = await svc
    .from("empresas_visitadas")
    .update({ cliente_id: clienteId })
    .eq("id", id)
    .is("cliente_id", null)
    .select("id");
  if (error) {
    console.error("[vincular-cliente da empresa] Erro ao vincular:", error.code ?? "sem código");
    return NextResponse.json({ error: "Não foi possível vincular. Nada foi alterado." }, { status: 500 });
  }
  if ((atualizadas ?? []).length === 0) return NextResponse.json({ error: mensagemJaTem }, { status: 409 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "empresa_vinculada_cliente",
    entidade: "empresas_visitadas",
    entidade_id: id,
    detalhes: { empresa_id: id, empresa_nome: empresa.nome, cliente_id: clienteId, cliente_nome: cliente.nome },
  });
  return NextResponse.json({ data: { id, cliente_id: clienteId } });
}
