import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoContabilidadeEmailUpdateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { deixariaSemCcAtivo, MSG_ULTIMO_CC } from "@/lib/emailPacoteContabilidade";
import type { User } from "@supabase/supabase-js";

interface Params {
  params: Promise<{ id: string }>;
}

async function autenticar(): Promise<{ user: User | null; status: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, status: 401 };
  return checarPapelSuperuser(user) ? { user: null, status: 403 } : { user, status: 200 };
}

type Svc = ReturnType<typeof createServiceClient>;

// Trava de segurança NO SERVIDOR: nunca remover nem desativar o último Cc ativo (a tabela é pequena,
// então lê tudo e aplica a regra pura). Há uma janela teórica de corrida entre duas chamadas
// simultâneas; o envio ainda tem o Cc mínimo como último recurso.
async function ultimoCcAtivo(svc: Svc, id: string): Promise<boolean> {
  const { data } = await svc.from("admissao_contabilidade_email_destinatarios").select("id, email, copia, ativo");
  return deixariaSemCcAtivo((data ?? []) as { id: string; email: string; copia: boolean; ativo: boolean }[], id);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { user, status } = await autenticar();
  if (!user) return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Acesso restrito." }, { status });

  const { id } = await params;
  const parsed = parseBody(admissaoContabilidadeEmailUpdateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  if (d.ativo === false && (await ultimoCcAtivo(svc, id))) {
    return NextResponse.json({ error: MSG_ULTIMO_CC }, { status: 409 });
  }

  const campos: Record<string, unknown> = {};
  if (d.ativo !== undefined) campos.ativo = d.ativo;
  if (d.nome !== undefined) campos.nome = d.nome;
  const { data, error } = await svc
    .from("admissao_contabilidade_email_destinatarios")
    .update(campos)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const lista = data.copia ? "Cc" : "Para";
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: d.ativo === undefined ? "admissao_contabilidade_email_renomeado" : data.ativo ? "admissao_contabilidade_email_reativado" : "admissao_contabilidade_email_desativado",
    entidade: "admissao_contabilidade_email_destinatarios",
    entidade_id: data.id,
    detalhes: { lista, nome: data.nome, email: data.email, ativo: data.ativo },
  });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { user, status } = await autenticar();
  if (!user) return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Acesso restrito." }, { status });

  const { id } = await params;
  const svc = createServiceClient();
  if (await ultimoCcAtivo(svc, id)) {
    return NextResponse.json({ error: MSG_ULTIMO_CC }, { status: 409 });
  }

  const { data, error } = await svc
    .from("admissao_contabilidade_email_destinatarios")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data) {
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "admissao_contabilidade_email_removido",
      entidade: "admissao_contabilidade_email_destinatarios",
      entidade_id: data.id,
      detalhes: { lista: data.copia ? "Cc" : "Para", nome: data.nome, email: data.email },
    });
  }
  return NextResponse.json({ ok: true });
}
