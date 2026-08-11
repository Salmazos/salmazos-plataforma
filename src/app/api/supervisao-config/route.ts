import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { parseBody, clienteMetaSupervisaoCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

// Restrita a PAPEIS_FULL_ACCESS — mesmo nível de acesso da tela /painel/supervisao-config
// (CRUD de clientes_meta_supervisao, que define quem entra no programa de supervisão e com
// que frequência/responsável). Diferente de /painel/supervisao (leitura, liberado também
// pra nivel_acesso='supervisor' via checarAcessoSupervisao).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const gate = checarPapelFullAccess(user);
  if (gate) return gate;

  const svc = createServiceClient();
  const [{ data: metas, error }, { data: clientes }, { data: supervisores }] = await Promise.all([
    svc
      .from("clientes_meta_supervisao")
      .select("*, clientes(id, nome, ativo), analistas_perfil(id, nome_completo)")
      .order("criado_em", { ascending: false }),
    svc.from("clientes").select("id, nome, ativo").eq("ativo", true).order("nome"),
    svc.from("analistas_perfil").select("id, nome_completo, nivel_acesso").eq("ativo", true).order("nome_completo"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: metas, clientes: clientes ?? [], supervisores: supervisores ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const gate = checarPapelFullAccess(user);
  if (gate) return gate;

  const body = await request.json();
  const parsed = parseBody(clienteMetaSupervisaoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { cliente_id, frequencia_dias, supervisor_responsavel_id, modo, data_fim_implantacao } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clientes_meta_supervisao")
    .insert({
      cliente_id,
      frequencia_dias: frequencia_dias ?? 7,
      supervisor_responsavel_id: supervisor_responsavel_id || null,
      modo: modo ?? "padrao",
      data_fim_implantacao: modo === "implantacao" ? (data_fim_implantacao || null) : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Este cliente já está configurado no programa de supervisão." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "criar",
    entidade: "clientes_meta_supervisao",
    entidade_id: data.id,
    detalhes: { cliente_id, frequencia_dias: data.frequencia_dias, supervisor_responsavel_id, modo: data.modo },
  });

  return NextResponse.json({ data }, { status: 201 });
}
