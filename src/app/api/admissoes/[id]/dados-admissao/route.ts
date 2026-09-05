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
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoDadosAdmissaoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: antes } = await svc
    .from("admissoes")
    .select("vaga_id, funcao, salario, tipo_salario, horario_trabalho, entidade_contratante, data_admissao, status, vagas(id, titulo, clientes(nome))")
    .eq("id", id)
    .single();

  // Único status realmente terminal pra esse campo — 'aprovado' e 'enviado_contabilidade'
  // continuam liberados de propósito: é justamente depois de 'enviado_contabilidade' que o
  // caso real que motivou esta rota (pacote da contabilidade já montado/assinado com a data
  // errada) precisa ser corrigido. Checado só quando data_admissao vem no payload, pra não
  // restringir os outros campos deste mesmo formulário (comportamento inalterado).
  if (parsed.data.data_admissao !== undefined && antes?.status === "cancelada") {
    return NextResponse.json(
      { error: "Não é possível editar a data de admissão de uma admissão cancelada." },
      { status: 400 }
    );
  }

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

  // Sincroniza com o funcionário já criado por esta admissão (se existir) — sem isso,
  // funcionarios.data_admissao (copiado uma única vez em gerar-pdf/route.ts, no momento da
  // criação) fica divergente da correção feita aqui pra sempre, mesma classe de bug do
  // e-mail de cobrança desatualizado (cliente_email_snapshot) já corrigida antes.
  const dataAdmissaoMudou =
    parsed.data.data_admissao !== undefined && parsed.data.data_admissao !== (antes?.data_admissao ?? null);
  let funcionarioSincronizado: string | null = null;
  if (dataAdmissaoMudou) {
    const { data: funcionarioVinculado } = await svc
      .from("funcionarios")
      .select("id")
      .eq("admissao_id", id)
      .maybeSingle();
    if (funcionarioVinculado) {
      const { error: erroFuncionario } = await svc
        .from("funcionarios")
        .update({ data_admissao: parsed.data.data_admissao })
        .eq("id", funcionarioVinculado.id);
      if (!erroFuncionario) {
        funcionarioSincronizado = funcionarioVinculado.id;
        registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: user.email ?? null,
          acao: "funcionario_data_admissao_sincronizada_por_edicao_admissao",
          entidade: "funcionarios",
          entidade_id: funcionarioVinculado.id,
          detalhes: {
            admissao_id: id,
            data_admissao_anterior: antes?.data_admissao ?? null,
            data_admissao_nova: parsed.data.data_admissao,
          },
        });
      } else {
        console.error(`[PATCH /api/admissoes/[id]/dados-admissao] Falha ao sincronizar data_admissao pro funcionário ${funcionarioVinculado.id}:`, erroFuncionario.message);
      }
    }
  }

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
      funcionario_data_admissao_sincronizado: funcionarioSincronizado,
    },
  });

  return NextResponse.json({ data });
}
