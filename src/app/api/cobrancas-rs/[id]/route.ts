import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsRascunhoSchema } from "@/lib/schemas";
import { checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const temAcesso = await checarAcessoCobrancaRS(user);
  if (!temAcesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const { id } = await params;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("cobrancas_rs")
    .select("*, vagas(titulo)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

// "Salvar rascunho" — sem validação obrigatória, salva parcial. Só edita cobranças ainda
// em pendente_revisao (uma vez aprovada/enviada, o snapshot fica congelado). Também usada
// como primeiro passo de "Aprovar e enviar" (ver /aprovar), pra garantir que a validação
// do lado do servidor reflita exatamente o que está persistido.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const temAcesso = await checarAcessoCobrancaRS(user);
  if (!temAcesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(cobrancaRsRascunhoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { cargo, salario, data_inicio, cliente_cnpj, cliente_endereco, prazo_cobranca } = parsed.data;

  const svc = createServiceClient();

  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status, cliente_id, cliente_cnpj_snapshot, cliente_endereco_snapshot")
    .eq("id", id)
    .single();

  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  if (atual.status !== "pendente_revisao") {
    return NextResponse.json({ error: "Esta cobrança já foi revisada e não pode mais ser editada." }, { status: 400 });
  }

  const campos: Record<string, unknown> = {};
  if (cargo !== undefined) campos.cargo = cargo || null;
  if (salario !== undefined) campos.salario = salario;
  if (data_inicio !== undefined) campos.data_inicio = data_inicio || null;
  if (prazo_cobranca !== undefined) campos.prazo_cobranca = prazo_cobranca || null;

  // CNPJ/Endereço só são graváveis aqui enquanto o snapshot ainda não tiver esse dado —
  // uma vez preenchido (seja do cadastro original ou desta tela), passa a ser somente
  // leitura no modal, então o servidor não deveria aceitar sobrescrevê-lo por essa via.
  if (cliente_cnpj && !atual.cliente_cnpj_snapshot) campos.cliente_cnpj_snapshot = cliente_cnpj;
  if (cliente_endereco && !atual.cliente_endereco_snapshot) campos.cliente_endereco_snapshot = cliente_endereco;

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Cadastro do cliente também é atualizado, não só o snapshot desta cobrança — fica
  // completo para o futuro (próximas cobranças do mesmo cliente já vêm com o dado).
  if (atual.cliente_id && (campos.cliente_cnpj_snapshot || campos.cliente_endereco_snapshot)) {
    const clienteUpdate: Record<string, unknown> = {};
    if (campos.cliente_cnpj_snapshot) clienteUpdate.cnpj = campos.cliente_cnpj_snapshot;
    if (campos.cliente_endereco_snapshot) clienteUpdate.endereco = campos.cliente_endereco_snapshot;
    await svc.from("clientes").update(clienteUpdate).eq("id", atual.cliente_id);
  }

  return NextResponse.json({ data });
}
