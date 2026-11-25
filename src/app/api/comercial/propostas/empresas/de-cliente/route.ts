import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, MSG_SO_ACOMPANHA_PROPOSTAS, type ContextoPropostas } from "@/lib/propostasAcesso";
import { parseBody, empresaDeClienteSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { empresasDaUnidade, nomeNormalizado, ordenarPorAntiguidade, type EmpresaResumo } from "@/lib/propostaEmpresasCliente";

type Svc = ReturnType<typeof createServiceClient>;

const MSG_CLIENTE_NAO_ENCONTRADO = "Cliente não encontrado.";
const MSG_NOME_JA_NA_CARTEIRA = "Já existe uma empresa com este nome na Carteira. Escolha a empresa da Carteira na lista; ela não é ligada ao cliente automaticamente.";

// Cria a empresa da Carteira (empresas_visitadas) de um CLIENTE cadastrado que ainda não tem uma, ligada a ele por cliente_id, para a proposta seguir
// normalmente. Só acontece quando alguém escolhe o cliente na tela de proposta (nada em massa). Só quem pode escrever em Propostas; só cliente ATIVO da
// unidade do usuário (mesmo com acesso a todas as unidades). Não cria oportunidade no Funil e nunca liga uma empresa que já existia por nome.
// Sem índice único em cliente_id, a idempotência é feita aqui: (1) antes de inserir, devolve a empresa que o cliente já tem; (2) depois de inserir,
// se existir OUTRA mais antiga, apaga SÓ a linha que esta chamada acabou de criar (por id exato) e devolve a mais antiga.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });
  if (!ctx.unidadeId) return NextResponse.json({ error: "Seu perfil não tem unidade definida." }, { status: 400 });

  const parsed = parseBody(empresaDeClienteSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data: cliente, error: erroCliente } = await svc
    .from("clientes")
    .select("id, nome, unidade_id, ativo, cidade, contato_nome, contato_telefone, contato_email")
    .eq("id", parsed.data.cliente_id)
    .maybeSingle();
  if (erroCliente) return NextResponse.json({ error: "Não foi possível carregar o cliente. Nada foi criado." }, { status: 500 });
  // Sempre a unidade do usuário (todasUnidades é ignorado): cliente de outra unidade responde como inexistente.
  if (!cliente || cliente.unidade_id !== ctx.unidadeId) return NextResponse.json({ error: MSG_CLIENTE_NAO_ENCONTRADO }, { status: 404 });
  if (!cliente.ativo) return NextResponse.json({ error: "Este cliente está inativo. Reative o cadastro antes de fazer a proposta." }, { status: 409 });

  // Empresa de teste só existe para o gestor: o vendedor recebe 404, como se o cliente não estivesse disponível.
  const { data: marcadas, error: erroMarcadas } = await svc.from("empresas_teste").select("empresa_id");
  if (erroMarcadas) return NextResponse.json({ error: "Não foi possível verificar as empresas. Nada foi criado." }, { status: 500 });
  const idsTeste = new Set((marcadas ?? []).map((m) => m.empresa_id as string));

  const empresas = await empresasDaUnidade(svc, ctx.unidadeId);
  if (!empresas) return NextResponse.json({ error: "Não foi possível verificar a Carteira. Nada foi criado." }, { status: 500 });

  const doCliente = empresas.filter((e) => e.cliente_id === cliente.id).sort(ordenarPorAntiguidade);
  if (doCliente.length > 0) return devolver(svc, ctx, doCliente[0], idsTeste, 200);

  // Empresa com o MESMO nome (sem vínculo com este cliente): nunca se liga em silêncio; a pessoa escolhe a empresa da Carteira.
  const mesmoNome = empresas.filter((e) => nomeNormalizado(e.nome) === nomeNormalizado(cliente.nome));
  if (mesmoNome.length > 0) {
    if (!ctx.gestor && mesmoNome.every((e) => idsTeste.has(e.id))) return NextResponse.json({ error: MSG_CLIENTE_NAO_ENCONTRADO }, { status: 404 });
    return NextResponse.json({ error: MSG_NOME_JA_NA_CARTEIRA }, { status: 409 });
  }

  const agora = new Date().toISOString();
  const { data: criada, error: erroInsert } = await svc
    .from("empresas_visitadas")
    .insert({
      nome: cliente.nome,
      unidade_id: ctx.unidadeId,
      created_by: ctx.userId,
      cliente_id: cliente.id,
      cidade: (cliente.cidade as string | null)?.trim() || null,
      primeira_visita_em: agora,
      ultima_visita_em: agora,
      total_visitas: 0,
      ultimo_visitante_id: null,
    })
    .select("id, nome, cliente_id, created_at")
    .single();
  if (erroInsert || !criada) {
    console.error("[propostas] Empresa do cliente não criada:", erroInsert?.code ?? "sem código");
    return NextResponse.json({ error: "Não foi possível criar a empresa do cliente. Nada foi criado." }, { status: 500 });
  }

  // Compensação: duas pessoas escolhendo o mesmo cliente ao mesmo tempo. A mais antiga (created_at, id) fica; a mais nova some SE for a que ESTA chamada
  // criou (id exato). Nada que já existia antes é apagado. O contato só é copiado depois, para a empresa que ficou.
  const { data: depois, error: erroDepois } = await svc.from("empresas_visitadas").select("id, nome, cliente_id, created_at").eq("cliente_id", cliente.id).eq("unidade_id", ctx.unidadeId);
  if (erroDepois) {
    console.error("[propostas] Duplicidade da empresa do cliente não conferida:", erroDepois.code ?? "sem código");
    return NextResponse.json({ error: "A empresa foi criada, mas não foi possível conferi-la. Escolha-a na Carteira." }, { status: 500 });
  }
  const ordenadas = ((depois ?? []) as EmpresaResumo[]).sort(ordenarPorAntiguidade);
  const maisAntiga = ordenadas[0];
  if (maisAntiga && maisAntiga.id !== criada.id) {
    const { error: erroApagar } = await svc.from("empresas_visitadas").delete().eq("id", criada.id);
    if (erroApagar) console.error("[propostas] Empresa duplicada do cliente não apagada:", erroApagar.code ?? "sem código");
    return devolver(svc, ctx, maisAntiga, idsTeste, 200);
  }

  // Contato do cliente como contato principal (opção A). Falha só no contato não derruba a criação (o A/C ainda pode ser digitado na proposta).
  let contatos: { id: string; nome: string; cargo: string | null; principal: boolean }[] = [];
  const nomeContato = (cliente.contato_nome as string | null)?.trim();
  if (nomeContato) {
    const { data: contato, error: erroContato } = await svc
      .from("empresa_contatos")
      .insert({
        empresa_visitada_id: criada.id,
        unidade_id: ctx.unidadeId,
        nome: nomeContato,
        telefone: (cliente.contato_telefone as string | null)?.trim() || null,
        email: (cliente.contato_email as string | null)?.trim() || null,
        principal: true,
        criado_por: ctx.analistaId,
      })
      .select("id, nome, cargo, principal")
      .single();
    if (erroContato) console.error("[propostas] Contato do cliente não copiado:", erroContato.code ?? "sem código");
    else if (contato) contatos = [{ id: contato.id, nome: contato.nome, cargo: contato.cargo ?? null, principal: contato.principal }];
  }

  // Auditoria sem telefone, e-mail nem CNPJ.
  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "empresa_criada_via_proposta",
    entidade: "empresas_visitadas",
    entidade_id: criada.id,
    unidade_id: ctx.unidadeId,
    detalhes: { origem: "cliente", cliente_id: cliente.id, nome: cliente.nome, com_contato: contatos.length > 0 },
  });

  return NextResponse.json({
    data: {
      id: criada.id,
      nome: criada.nome,
      cliente_id: criada.cliente_id,
      contatos,
      // Recém-criada: nunca de teste e sem oportunidade. Só o gestor recebe `teste` (como na busca).
      ...(ctx.temFunil ? { oportunidade_aberta: null } : {}),
      ...(ctx.gestor ? { teste: false } : {}),
    },
  }, { status: 201 });
}

// Empresa que já existia para o cliente: mesmos campos de um item da busca (contatos, oportunidade aberta só para quem tem Funil, teste só para o gestor).
async function devolver(svc: Svc, ctx: ContextoPropostas, empresa: EmpresaResumo, idsTeste: Set<string>, status: number) {
  const ehTeste = idsTeste.has(empresa.id);
  if (ehTeste && !ctx.gestor) return NextResponse.json({ error: MSG_CLIENTE_NAO_ENCONTRADO }, { status: 404 });

  const { data: contatos } = await svc
    .from("empresa_contatos")
    .select("id, nome, cargo, principal")
    .eq("empresa_visitada_id", empresa.id)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true });

  let aberta: { id: string; vendedor_nome: string | null; etapa: string } | null = null;
  if (ctx.temFunil) {
    const { data: opp } = await svc.from("oportunidades").select("id, vendedor_id, etapa").eq("empresa_visitada_id", empresa.id).not("etapa", "in", "(ganho,perdido)").limit(1).maybeSingle();
    if (opp) {
      const { data: vendedor } = await svc.from("analistas_perfil").select("nome_completo").eq("id", opp.vendedor_id).maybeSingle();
      aberta = { id: opp.id as string, vendedor_nome: (vendedor?.nome_completo as string | undefined) ?? null, etapa: opp.etapa as string };
    }
  }
  return NextResponse.json({
    data: {
      id: empresa.id,
      nome: empresa.nome,
      cliente_id: empresa.cliente_id,
      contatos: (contatos ?? []).map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo ?? null, principal: c.principal })),
      ...(ctx.temFunil ? { oportunidade_aberta: aberta } : {}),
      ...(ctx.gestor ? { teste: ehTeste } : {}),
    },
  }, { status });
}
