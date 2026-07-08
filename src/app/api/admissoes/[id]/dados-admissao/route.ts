import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, admissaoDadosAdmissaoUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, diffCampos } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

interface VagaResumo {
  id: string;
  titulo: string;
  clientes: { nome: string } | null;
}

// Edição pelo analista da vaga vinculada a uma admissão já criada, junto com os campos
// que dependem dela (função/salário/horário/entidade contratante) — pra corrigir casos em
// que o candidato foi reencaminhado pra outra vaga/cliente depois da criação. Mexe
// exclusivamente em `admissoes`; nunca toca em candidatos_vagas nem encaminhamentos —
// aqueles refletem o processo seletivo do candidato, não a admissão específica.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoDadosAdmissaoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: antes } = await svc
    .from("admissoes")
    .select("vaga_id, funcao, salario, horario_trabalho, entidade_contratante, vagas(id, titulo, clientes(nome))")
    .eq("id", id)
    .single();

  if (parsed.data.vaga_id) {
    const { data: vagaExiste } = await svc.from("vagas").select("id").eq("id", parsed.data.vaga_id).maybeSingle();
    if (!vagaExiste) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("admissoes")
    .update(parsed.data)
    .eq("id", id)
    .select("*, vagas(id, titulo, cliente_id, clientes(id, nome))")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const antesVaga = (antes?.vagas ?? null) as unknown as VagaResumo | null;
  const depoisVaga = (data.vagas ?? null) as unknown as VagaResumo | null;

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_dados_admissao_editados_pelo_analista",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: {
      diff: diffCampos(antes as Record<string, unknown> | null, parsed.data as Record<string, unknown>),
      vaga_antes: antesVaga ? { id: antesVaga.id, titulo: antesVaga.titulo, cliente: antesVaga.clientes?.nome ?? null } : null,
      vaga_depois: depoisVaga ? { id: depoisVaga.id, titulo: depoisVaga.titulo, cliente: depoisVaga.clientes?.nome ?? null } : null,
    },
  });

  return NextResponse.json({ data });
}
