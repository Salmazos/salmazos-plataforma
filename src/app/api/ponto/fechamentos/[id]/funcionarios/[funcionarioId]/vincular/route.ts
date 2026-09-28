import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelPonto } from "@/lib/pontoAuth";
import { parseBody, pontoFuncionarioVincularSchema } from "@/lib/schemas";
import { checarAcessoFechamentoPontoRH } from "@/lib/rhUnidadeAuth";

interface Params {
  params: Promise<{ id: string; funcionarioId: string }>;
}

// Resolve manualmente uma linha "pendente_vinculo" (aba do EzePoint cujo nome não bateu com
// exatamente 1 funcionário cadastrado nesse cliente) — nunca decide sozinho, só grava a
// escolha do RH: ou vincula a um funcionario_id específico, ou marca como "ignorado" (ex:
// relógio compartilhado trouxe alguém que não é desse cliente).
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelPonto(user);
  if (acessoNegado) return acessoNegado;

  const { id: fechamentoId, funcionarioId: pontoFuncionarioId } = await params;
  const bloqueioUnidade = await checarAcessoFechamentoPontoRH(user, fechamentoId);
  if (bloqueioUnidade) return bloqueioUnidade;
  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(pontoFuncionarioVincularSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: pontoFuncionario } = await svc
    .from("ponto_funcionarios")
    .select("id, fechamento_id, ponto_fechamentos!inner(cliente_id)")
    .eq("id", pontoFuncionarioId)
    .maybeSingle();
  if (!pontoFuncionario || pontoFuncionario.fechamento_id !== fechamentoId) {
    return NextResponse.json({ error: "Registro não encontrado neste fechamento." }, { status: 404 });
  }

  if (parsed.data.ignorar) {
    const { error } = await svc
      .from("ponto_funcionarios")
      .update({ funcionario_id: null, status_vinculo: "ignorado" })
      .eq("id", pontoFuncionarioId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Sem funcionário e sem ignorar = "Desfazer" de um ignorado: volta a ficar pendente pro RH
  // decidir de novo (nunca vira vínculo sozinho).
  if (!parsed.data.funcionario_id) {
    const { error } = await svc
      .from("ponto_funcionarios")
      .update({ funcionario_id: null, status_vinculo: "pendente_vinculo" })
      .eq("id", pontoFuncionarioId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Confirma que o funcionário escolhido é do MESMO cliente do fechamento — trava contra um
  // vínculo cruzado por engano (ex: nome parecido de outro cliente).
  const clienteId = (pontoFuncionario.ponto_fechamentos as unknown as { cliente_id: string }).cliente_id;
  const { data: funcionario } = await svc
    .from("funcionarios")
    .select("id, cliente_id")
    .eq("id", parsed.data.funcionario_id)
    .maybeSingle();
  if (!funcionario || funcionario.cliente_id !== clienteId) {
    return NextResponse.json({ error: "Esse funcionário não pertence ao cliente deste fechamento." }, { status: 400 });
  }

  const { error } = await svc
    .from("ponto_funcionarios")
    .update({ funcionario_id: parsed.data.funcionario_id, status_vinculo: "vinculado" })
    .eq("id", pontoFuncionarioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
