import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioUpdateSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { classificarTurno } from "@/lib/classificarTurno";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(funcionarioUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: antes } = await svc
    .from("funcionarios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!antes) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });

  const campos: Record<string, unknown> = {};
  if (parsed.data.nome_completo !== undefined) campos.nome_completo = parsed.data.nome_completo;
  if (parsed.data.cliente_id !== undefined) campos.cliente_id = parsed.data.cliente_id;
  if (parsed.data.empresa !== undefined) campos.empresa = parsed.data.empresa;
  if (parsed.data.cargo !== undefined) campos.cargo = parsed.data.cargo;
  if (parsed.data.data_admissao !== undefined) campos.data_admissao = parsed.data.data_admissao;
  if (parsed.data.tipo_servico !== undefined) campos.tipo_servico = parsed.data.tipo_servico;

  // turno_trabalho só é recalculado quando um dos três campos de turno vem no body — edições
  // que não mexem em turno (ex: só cargo) não devem tocar na classificação já salva. O
  // cálculo usa hora_inicio/hora_fim já mesclados (novo valor enviado, ou o que já estava
  // salvo), porque o RH pode editar só um dos dois horários por vez.
  const tocaTurno =
    parsed.data.turno_hora_inicio !== undefined ||
    parsed.data.turno_hora_fim !== undefined ||
    parsed.data.turno_trabalho_override !== undefined;
  if (tocaTurno) {
    const turnoHoraInicio = parsed.data.turno_hora_inicio !== undefined ? parsed.data.turno_hora_inicio : antes.turno_hora_inicio;
    const turnoHoraFim = parsed.data.turno_hora_fim !== undefined ? parsed.data.turno_hora_fim : antes.turno_hora_fim;
    campos.turno_hora_inicio = turnoHoraInicio ?? null;
    campos.turno_hora_fim = turnoHoraFim ?? null;
    campos.turno_trabalho = parsed.data.turno_trabalho_override ?? classificarTurno(turnoHoraInicio, turnoHoraFim);
  }

  const { data, error } = await svc
    .from("funcionarios")
    .update(campos)
    .eq("id", id)
    .select("*, clientes(nome)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_editado",
    entidade: "funcionarios",
    entidade_id: id,
    detalhes: { diff: diffCampos(antes, campos) },
  });

  return NextResponse.json({ data });
}
