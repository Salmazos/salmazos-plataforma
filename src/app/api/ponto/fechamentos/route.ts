import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelPonto } from "@/lib/pontoAuth";
import { parseFechamentoXlsx } from "@/lib/pontoImport";
import { slugify } from "@/lib/utils";
import { podeVerUnidade } from "@/lib/unidadeAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelPonto(user);
  if (acessoNegado) return acessoNegado;

  // RH por unidade (mesma regra de Funcionários/Rescisões): supervisor só vê o ponto dos
  // clientes da própria unidade; sócios veem tudo.
  const ctx = await contextoRH(user);
  if (!ctx) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const svc = createServiceClient();
  const clienteId = request.nextUrl.searchParams.get("cliente_id");

  let query = svc
    .from("ponto_fechamentos")
    .select("id, cliente_id, periodo_inicio, periodo_fim, status, criado_em, clientes(nome)")
    .order("periodo_inicio", { ascending: false });
  if (clienteId) query = query.eq("cliente_id", clienteId);
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Contagem de pendências (funcionário sem vínculo, dia fora do padrão sem justificativa)
  // por fechamento — evita o RH ter que abrir cada um só pra saber se falta algo.
  const fechamentoIds = (data ?? []).map((f) => f.id);
  const pendenciasPorFechamento: Record<string, { vinculosPendentes: number; diasSemJustificativa: number }> = {};
  if (fechamentoIds.length > 0) {
    const { data: funcionarios } = await svc
      .from("ponto_funcionarios")
      .select("id, fechamento_id, status_vinculo")
      .in("fechamento_id", fechamentoIds);
    for (const f of funcionarios ?? []) {
      if (!pendenciasPorFechamento[f.fechamento_id]) {
        pendenciasPorFechamento[f.fechamento_id] = { vinculosPendentes: 0, diasSemJustificativa: 0 };
      }
      if (f.status_vinculo === "pendente_vinculo") pendenciasPorFechamento[f.fechamento_id].vinculosPendentes++;
    }
    const todosFuncionarioIds = (funcionarios ?? []).map((f) => f.id);
    if (todosFuncionarioIds.length > 0) {
      const { data: dias } = await svc
        .from("ponto_dias")
        .select("ponto_funcionario_id, fora_padrao, justificativa_rh")
        .in("ponto_funcionario_id", todosFuncionarioIds)
        .eq("fora_padrao", true)
        .is("justificativa_rh", null);
      const funcionarioIdParaFechamento = new Map((funcionarios ?? []).map((f) => [f.id, f.fechamento_id]));
      for (const d of dias ?? []) {
        const fechId = funcionarioIdParaFechamento.get(d.ponto_funcionario_id);
        if (fechId) pendenciasPorFechamento[fechId].diasSemJustificativa++;
      }
    }
  }

  const resultado = (data ?? []).map((f) => ({
    ...f,
    pendencias: pendenciasPorFechamento[f.id] ?? { vinculosPendentes: 0, diasSemJustificativa: 0 },
  }));

  return NextResponse.json({ data: resultado });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelPonto(user);
  if (acessoNegado) return acessoNegado;

  const ctx = await contextoRH(user);
  if (!ctx) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  if (!clienteId) return NextResponse.json({ error: "Selecione um cliente." }, { status: 400 });

  const svc = createServiceClient();

  const { data: cliente } = await svc.from("clientes").select("id, nome, unidade_id").eq("id", clienteId).maybeSingle();
  if (!cliente || !podeVerUnidade(ctx, cliente.unidade_id)) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let importado;
  try {
    importado = parseFechamentoXlsx(buffer);
  } catch (err) {
    console.error("[POST /api/ponto/fechamentos] erro ao ler planilha", err);
    return NextResponse.json({ error: "Não consegui ler esse arquivo. Confirme que é o export do EzePoint (.xlsx)." }, { status: 400 });
  }

  if (!importado.periodoInicio || !importado.periodoFim) {
    return NextResponse.json({ error: "Não encontrei o período (\"Período:\") em nenhuma aba do arquivo." }, { status: 400 });
  }
  if (importado.funcionarios.length === 0) {
    return NextResponse.json({ error: "Nenhuma aba no formato esperado (cabeçalho \"Data\" não encontrado)." }, { status: 400 });
  }

  const { data: fechamentoExistente } = await svc
    .from("ponto_fechamentos")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("periodo_inicio", importado.periodoInicio)
    .eq("periodo_fim", importado.periodoFim)
    .maybeSingle();
  if (fechamentoExistente) {
    return NextResponse.json(
      { error: `Já existe um fechamento importado pra este cliente nesse período (${importado.periodoInicio} a ${importado.periodoFim}).` },
      { status: 409 }
    );
  }

  // Vínculo por nome normalizado (sem acento/caixa) contra os funcionários já cadastrados
  // NESSE cliente — o export não traz CPF, então nome é o único dado em comum. Nunca
  // vincula "no escuro": 0 ou mais de 1 candidato com o mesmo nome normalizado fica
  // pendente pro RH resolver manualmente (ver POST .../funcionarios/[id]/vincular).
  const { data: funcionariosCliente } = await svc
    .from("funcionarios")
    .select("id, nome_completo")
    .eq("cliente_id", clienteId);
  const funcionariosPorNome = new Map<string, string[]>();
  for (const f of funcionariosCliente ?? []) {
    const chave = slugify(f.nome_completo);
    const lista = funcionariosPorNome.get(chave) ?? [];
    lista.push(f.id);
    funcionariosPorNome.set(chave, lista);
  }

  const { data: fechamento, error: erroFechamento } = await svc
    .from("ponto_fechamentos")
    .insert({
      cliente_id: clienteId,
      // Unidade do cliente, não a de quem importa — sócio (Monte Mor) importando ponto de
      // cliente de SBC grava SBC, e é o que o supervisor de SBC precisa enxergar.
      unidade_id: cliente.unidade_id,
      periodo_inicio: importado.periodoInicio,
      periodo_fim: importado.periodoFim,
      arquivo_original_nome: file.name,
      criado_por: user.id,
    })
    .select("id")
    .single();
  if (erroFechamento || !fechamento) {
    return NextResponse.json({ error: erroFechamento?.message ?? "Erro ao criar fechamento." }, { status: 500 });
  }

  let vinculadosAutomaticamente = 0;
  let pendentesVinculo = 0;

  for (const func of importado.funcionarios) {
    const candidatos = funcionariosPorNome.get(slugify(func.nomePlanilha)) ?? [];
    const funcionarioId = candidatos.length === 1 ? candidatos[0] : null;
    if (funcionarioId) vinculadosAutomaticamente++;
    else pendentesVinculo++;

    const { data: pontoFuncionario, error: erroFunc } = await svc
      .from("ponto_funcionarios")
      .insert({
        fechamento_id: fechamento.id,
        funcionario_id: funcionarioId,
        nome_planilha: func.nomePlanilha,
        ezepoint_codigo: func.ezepointCodigo,
        cargo: func.cargo,
        data_admissao: func.dataAdmissao,
        totais: func.totais,
        status_vinculo: funcionarioId ? "vinculado" : "pendente_vinculo",
      })
      .select("id")
      .single();
    if (erroFunc || !pontoFuncionario) {
      console.error("[POST /api/ponto/fechamentos] erro ao criar ponto_funcionarios", erroFunc);
      continue;
    }

    if (func.dias.length > 0) {
      const { error: erroDias } = await svc.from("ponto_dias").insert(
        func.dias.map((d) => ({
          ponto_funcionario_id: pontoFuncionario.id,
          data: d.data,
          dia_semana: d.diaSemana,
          marcacoes: d.marcacoes,
          nota_original: d.notaOriginal,
          campos: d.campos,
          fora_padrao: d.foraPadrao,
          tipo_ocorrencia: d.tipoOcorrencia,
        }))
      );
      if (erroDias) console.error("[POST /api/ponto/fechamentos] erro ao criar ponto_dias", erroDias);
    }
  }

  return NextResponse.json({
    fechamentoId: fechamento.id,
    funcionariosImportados: importado.funcionarios.length,
    vinculadosAutomaticamente,
    pendentesVinculo,
    abasIgnoradas: importado.abasIgnoradas,
  });
}
