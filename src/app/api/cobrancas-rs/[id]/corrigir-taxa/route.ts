import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsCorrigirTaxaSchema } from "@/lib/schemas";
import { podeRevisarCobranca } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import {
  AVISO_LANCAMENTO_AJUSTADO, avisoLancamentoPago, buscarLancamentosDaCobranca, separarLancamentos, separarPorValorAntigo, validarCorrecaoDeTaxa,
} from "@/lib/cobrancaRSCorrecao";

interface Params {
  params: Promise<{ id: string }>;
}

// Corrige a taxa (%) de uma cobrança já aprovada, sem cancelar, e leva junto tudo que depende dela: o valor da cobrança, a
// contratação (candidatos_vagas.admissao_fee_*) e o lançamento em Faturamento Unidades ainda não pago. Rota à parte de
// propósito: o PATCH genérico congela a cobrança depois de aprovada e não foi afrouxado.
//
// Sem transação no banco (decisão de não criar migração/RPC): os passos rodam em ordem e, se um falhar, os anteriores são
// desfeitos para os valores de antes — o mesmo padrão de rollback da decisão de indicação direta.
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = parseBody(cobrancaRsCorrigirTaxaSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const percentual = parsed.data.fee_percentual;

  const svc = createServiceClient();
  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status, tipo, salario, fee_percentual, fee_valor, candidato_vaga_id, gerado_por_user_id, cliente_nome_snapshot, candidato_nome_snapshot")
    .eq("id", id)
    .single();
  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  if (!(await podeRevisarCobranca(user, atual))) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const validacao = validarCorrecaoDeTaxa(atual, percentual);
  if (!validacao.ok) return NextResponse.json({ error: validacao.error }, { status: 400 });
  const feeValor = validacao.feeValor;

  const usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, svc);
  const antes = { fee_percentual: atual.fee_percentual, fee_valor: atual.fee_valor };

  // Nada a mudar: não grava, não audita.
  if (Number(atual.fee_percentual) === percentual && Number(atual.fee_valor) === feeValor) {
    return NextResponse.json({ data: atual, avisos: [], alterado: false });
  }

  // 1) Cobrança. O status entra na condição: se foi paga/cancelada entre a leitura e agora, nada é gravado.
  const { data: atualizada, error: cobrancaErr } = await svc
    .from("cobrancas_rs")
    .update({ fee_percentual: percentual, fee_valor: feeValor })
    .eq("id", id)
    .eq("status", atual.status)
    .select()
    .maybeSingle();
  if (cobrancaErr) return NextResponse.json({ error: "Não foi possível corrigir a taxa. Nada foi alterado." }, { status: 500 });
  if (!atualizada) {
    return NextResponse.json({ error: "O status da cobrança mudou enquanto a taxa era corrigida. Recarregue e confira antes de tentar de novo." }, { status: 409 });
  }

  const avisos: string[] = [];
  const desfazerCobranca = async () => {
    const { error } = await svc.from("cobrancas_rs").update(antes).eq("id", id);
    return error;
  };
  const falhar = async (acao: string, erroOriginal: string, extra: Record<string, unknown>, desfazer: () => Promise<unknown>) => {
    let rollbackFalhou = false;
    try {
      const erroRollback = await desfazer();
      rollbackFalhou = !!erroRollback;
    } catch {
      rollbackFalhou = true;
    }
    await registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: rollbackFalhou ? `${acao}_rollback_falhou` : acao,
      entidade: "cobrancas_rs",
      entidade_id: id,
      detalhes: { erro: erroOriginal, antes, tentativa: { fee_percentual: percentual, fee_valor: feeValor }, ...extra },
    });
    return NextResponse.json(
      {
        error: rollbackFalhou
          ? "Falha ao propagar a nova taxa e não foi possível desfazer por completo. Confira a cobrança, a contratação e o lançamento antes de tentar de novo."
          : "Não foi possível propagar a nova taxa. Nada foi alterado.",
      },
      { status: 500 }
    );
  };

  // 2) Contratação (só cobrança de contratação aponta para uma candidatura; a de cancelamento não tem).
  let contratacaoAntes: { admissao_fee_percentual: number | null; admissao_fee_valor: number | null } | null = null;
  const propagaContratacao = atual.tipo === "contratacao" && !!atual.candidato_vaga_id;
  if (propagaContratacao) {
    const { data: cv, error: cvLeituraErr } = await svc
      .from("candidatos_vagas")
      .select("id, admissao_fee_percentual, admissao_fee_valor")
      .eq("id", atual.candidato_vaga_id)
      .maybeSingle();
    if (cvLeituraErr) return falhar("cobranca_rs_taxa_corrigida_erro_contratacao", cvLeituraErr.message, {}, desfazerCobranca);
    if (!cv) {
      avisos.push("A contratação desta cobrança não foi encontrada — o valor dela não foi atualizado.");
    } else {
      contratacaoAntes = { admissao_fee_percentual: cv.admissao_fee_percentual ?? null, admissao_fee_valor: cv.admissao_fee_valor ?? null };
      const { error: cvErr } = await svc
        .from("candidatos_vagas")
        .update({ admissao_fee_percentual: percentual, admissao_fee_valor: feeValor })
        .eq("id", atual.candidato_vaga_id);
      if (cvErr) return falhar("cobranca_rs_taxa_corrigida_erro_contratacao", cvErr.message, {}, desfazerCobranca);
    }
  }
  const desfazerContratacao = async () => {
    if (!contratacaoAntes) return null;
    const { error } = await svc.from("candidatos_vagas").update(contratacaoAntes).eq("id", atual.candidato_vaga_id);
    return error;
  };

  // Os dois desfazem sempre: um erro ao voltar a contratação não pode impedir de voltar a cobrança.
  const desfazerTudo = async () => {
    const erroContratacao = await desfazerContratacao();
    const erroCobranca = await desfazerCobranca();
    return erroContratacao ?? erroCobranca;
  };

  // 3) Lançamento em Faturamento Unidades: só o pendente que ainda tem o valor antigo da cobrança muda. O pago não é tocado e
  // o pendente com valor diferente (ajustado na mão) também não: ambos viram aviso.
  const busca = await buscarLancamentosDaCobranca(svc, id);
  if (busca.erro) {
    return falhar("cobranca_rs_taxa_corrigida_erro_lancamento", busca.erro, {}, desfazerTudo);
  }
  const { pendentes: pendentesDoMarcador, pagos } = separarLancamentos(busca.lancamentos);
  const { alinhados: pendentes, divergentes } = separarPorValorAntigo(pendentesDoMarcador, atual.fee_valor);
  if (pendentes.length > 0) {
    const { error: lancErr } = await svc
      .from("contas_receber_hortolandia")
      .update({ valor: feeValor, atualizado_em: new Date().toISOString() })
      .in("id", pendentes.map((l) => l.id));
    if (lancErr) {
      return falhar("cobranca_rs_taxa_corrigida_erro_lancamento", lancErr.message, {}, desfazerTudo);
    }
  }
  if (divergentes.length > 0) avisos.push(AVISO_LANCAMENTO_AJUSTADO);
  const avisoPago = avisoLancamentoPago(pagos, { campo: "valor" });
  if (avisoPago) avisos.push(avisoPago);

  revalidatePath("/painel/cobrancas-rs");

  await registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: usuarioNome,
    acao: "cobranca_rs_taxa_corrigida",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: {
      cliente: atual.cliente_nome_snapshot,
      candidato: atual.candidato_nome_snapshot,
      status: atual.status,
      antes,
      depois: { fee_percentual: percentual, fee_valor: feeValor },
      contratacao: propagaContratacao ? { antes: contratacaoAntes, depois: contratacaoAntes ? { admissao_fee_percentual: percentual, admissao_fee_valor: feeValor } : null } : null,
      lancamentos_atualizados: pendentes.map((l) => ({ id: l.id, valor_antes: l.valor, valor_depois: feeValor })),
      lancamentos_pagos_nao_alterados: pagos.map((l) => l.id),
      lancamentos_valor_ajustado_nao_alterados: divergentes.map((l) => ({ id: l.id, valor: l.valor })),
    },
  });

  return NextResponse.json({ data: atualizada, avisos, alterado: true, lancamentos_atualizados: pendentes.length });
}
