import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioMotEventoCorrigirSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { hojeBrasiliaISO } from "@/lib/rescisaoProgramada";

interface Params {
  params: Promise<{ id: string; eventoId: string }>;
}

// Evento nunca é apagado nem editado (tabela append-only): corrigir = inserir uma linha compensatória que
// aponta pro evento errado (corrige_evento_id). Só PAPEIS_FULL_ACCESS (superuser/diretoria), com motivo.
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;
  const fullAccessNegado = checarPapelFullAccess(user);
  if (fullAccessNegado) return fullAccessNegado;

  const { id, eventoId } = await params;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(funcionarioMotEventoCorrigirSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data: evento } = await svc
    .from("funcionario_mot_eventos")
    .select("id, tipo, corrige_evento_id")
    .eq("id", eventoId)
    .eq("funcionario_id", id)
    .maybeSingle();
  if (!evento) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  if (evento.corrige_evento_id) {
    return NextResponse.json({ error: "Esta linha já é uma correção e não pode ser corrigida." }, { status: 409 });
  }

  const { data: jaCorrigido } = await svc
    .from("funcionario_mot_eventos")
    .select("id")
    .eq("corrige_evento_id", eventoId)
    .limit(1);
  if ((jaCorrigido ?? []).length > 0) {
    return NextResponse.json({ error: "Este evento já foi corrigido." }, { status: 409 });
  }

  const { data, error } = await svc
    .from("funcionario_mot_eventos")
    .insert({
      funcionario_id: id,
      tipo: evento.tipo,
      data_evento: hojeBrasiliaISO(),
      observacoes: parsed.data.motivo,
      corrige_evento_id: eventoId,
      criado_por: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[mot-eventos/corrigir] Erro ao gravar a correção:", error.message);
    return NextResponse.json({ error: "Não foi possível registrar a correção. Tente novamente." }, { status: 500 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "funcionario_mot_evento_corrigido",
    entidade: "funcionario_mot_eventos",
    entidade_id: data.id,
    detalhes: { funcionario_id: id, evento_corrigido_id: eventoId, tipo: evento.tipo },
  });

  return NextResponse.json({ data: { id: data.id } }, { status: 201 });
}
