import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { parseBody, candidatoVagaDesistenciaSchema } from "@/lib/schemas";
import { sincronizarPosicoesAbertas } from "@/lib/vagaPosicoes";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { checarAcessoCandidatoVaga } from "@/lib/unidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

const TIPOS_SUPORTADOS = ["mao_obra_temporaria", "terceirizacao"];

// Candidato "contratado" que desistiu antes de ter admissão (caso real Alisson/Novacki, out/2026): sem esta rota a lista
// "Aguardando início de admissão" só tinha "+ Iniciar admissão", e a única saída era mexer no banco. Escopada por
// candidatos_vagas.id de propósito: PATCH /api/candidatos/[id]/etapa age em TODAS as candidaturas do candidato, e o
// "finalizar" (reprovado_final) não desfaz a alocação nem trata o encaminhamento.
// Só MOT e Terceirização: R&S tem cobrança, garantia e fee a desfazer, que ainda não são tratados aqui.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarPapelAdmissoes(user);
    if (acessoNegado) return acessoNegado;
    const bloqueio = await checarAcessoCandidatoVaga(user, id);
    if (bloqueio) return bloqueio;

    const parsed = parseBody(candidatoVagaDesistenciaSchema, await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { motivo, reabrir_vaga } = parsed.data;

    const svc = createServiceClient();

    const { data: cv } = await svc
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, etapa, data_inicio, data_fim")
      .eq("id", id)
      .maybeSingle();
    if (!cv) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    // Idempotência: quem clica duas vezes (ou abre a lista desatualizada) cai aqui no 2º pedido.
    if (cv.etapa !== "contratado") {
      return NextResponse.json({ error: "Esta candidatura não está mais em Contratado (já foi alterada). Atualize a página." }, { status: 409 });
    }

    const { data: vaga } = await svc
      .from("vagas")
      .select("id, titulo, status, tipo_servico, cliente_id")
      .eq("id", cv.vaga_id)
      .maybeSingle();
    if (!vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });

    if (vaga.tipo_servico === "recrutamento_selecao") {
      return NextResponse.json({ error: "Fluxo de R&S ainda não suportado aqui: a contratação pode ter cobrança, garantia e taxa a desfazer." }, { status: 409 });
    }
    if (!TIPOS_SUPORTADOS.includes(vaga.tipo_servico)) {
      return NextResponse.json({ error: "Tipo de serviço da vaga não suportado neste fluxo." }, { status: 409 });
    }

    const { data: admissoes } = await svc
      .from("admissoes")
      .select("id")
      .eq("candidato_id", cv.candidato_id)
      .eq("vaga_id", cv.vaga_id)
      .limit(1);
    if ((admissoes ?? []).length > 0) {
      return NextResponse.json({ error: "Já existe uma admissão para este candidato nesta vaga. Cancele a admissão em vez de registrar a desistência aqui." }, { status: 409 });
    }

    // Atualização condicional à etapa lida: se outra pessoa mexeu no meio, nenhuma linha muda e ninguém é desfeito pela metade.
    const { data: atualizada, error: updateErr } = await svc
      .from("candidatos_vagas")
      .update({ etapa: "nao_tem_interesse", motivo_reprovacao: motivo, data_inicio: null, data_fim: null })
      .eq("id", id)
      .eq("etapa", "contratado")
      .select("id")
      .maybeSingle();
    if (updateErr) {
      console.error(`[desistencia] Falha ao gravar a desistência (cv_id=${id}):`, updateErr.message);
      return NextResponse.json({ error: "Não foi possível registrar a desistência. Nada foi alterado; tente novamente." }, { status: 500 });
    }
    if (!atualizada) {
      return NextResponse.json({ error: "Esta candidatura não está mais em Contratado (já foi alterada). Atualize a página." }, { status: 409 });
    }

    // A partir daqui a candidatura já mudou: o que falhar é logado e devolvido em `avisos`, sem desfazer o que já foi gravado.
    const avisos: string[] = [];
    const falhou = (etapa: string, detalhe: unknown) => {
      const msg = detalhe instanceof Error ? detalhe.message : String(detalhe);
      console.error(`[desistencia] Falha parcial em "${etapa}" (cv_id=${id}):`, msg);
      avisos.push(etapa);
    };

    let clienteNome: string | null = null;
    if (vaga.cliente_id) {
      const { data: cliente } = await svc.from("clientes").select("nome").eq("id", vaga.cliente_id).maybeSingle();
      clienteNome = cliente?.nome ?? null;
    }

    // Alocação do candidato: só zera se ela ainda for DESTA colocação (mesma vaga, cliente e data de início);
    // se ele já foi alocado em outra vaga depois, essa alocação não é tocada.
    try {
      const { data: candidato } = await svc
        .from("candidatos")
        .select("id, status_alocacao, alocacao_vaga_titulo, alocacao_cliente_nome, alocacao_data_inicio")
        .eq("id", cv.candidato_id)
        .maybeSingle();
      const alocadoAqui =
        !!candidato &&
        typeof candidato.status_alocacao === "string" && candidato.status_alocacao.startsWith("alocado_") &&
        candidato.alocacao_vaga_titulo === vaga.titulo &&
        (candidato.alocacao_cliente_nome ?? null) === clienteNome &&
        (candidato.alocacao_data_inicio ?? null) === (cv.data_inicio ?? null);
      if (alocadoAqui) {
        const { error } = await svc
          .from("candidatos")
          .update({
            status_alocacao: "disponivel", alocacao_cliente_nome: null, alocacao_vaga_titulo: null, alocacao_data_inicio: null,
            alocacao_data_fim: null, alocacao_tipo_servico: null, alocacao_renovavel: false,
          })
          .eq("id", cv.candidato_id);
        if (error) falhou("alocação do candidato", error.message);
      }
    } catch (err) {
      falhou("alocação do candidato", err);
    }

    // Encaminhamento aprovado ao cliente (marcado na contratação) vira "desistiu", só o desta vaga e deste cliente.
    try {
      if (vaga.cliente_id) {
        const { data: aprovados } = await svc
          .from("encaminhamentos")
          .select("id, vaga_id")
          .eq("candidato_id", cv.candidato_id)
          .eq("cliente_id", vaga.cliente_id)
          .eq("status", "aprovado")
          .order("created_at", { ascending: false });
        const alvo = (aprovados ?? []).find((e) => e.vaga_id === cv.vaga_id) ?? (aprovados ?? []).find((e) => !e.vaga_id);
        if (alvo) {
          const { error } = await svc.from("encaminhamentos").update({ status: "desistiu" }).eq("id", alvo.id).eq("status", "aprovado");
          if (error) falhou("encaminhamento ao cliente", error.message);
        }
      }
    } catch (err) {
      falhou("encaminhamento ao cliente", err);
    }

    // Reabertura só com confirmação do analista e só de vaga "fechada" (nunca cancelada). O e-mail de encerramento que
    // o fechamento automático já enviou não é desfeito. data_abertura não muda: a vaga nunca deixou de precisar de gente
    // (diferente da reativação manual), então o tempo de preenchimento dos relatórios segue contando da abertura original.
    let vagaReaberta = false;
    try {
      if (reabrir_vaga === true && vaga.status === "fechada") {
        const { error } = await svc.from("vagas").update({ status: "aberta", data_fechamento: null }).eq("id", vaga.id).eq("status", "fechada");
        if (error) falhou("reabertura da vaga", error.message);
        else {
          vagaReaberta = true;
          registrarAuditoria({
            usuario_id: user.id,
            usuario_nome: user.email ?? null,
            acao: "vaga_atualizada",
            entidade: "vagas",
            entidade_id: vaga.id,
            detalhes: { status_anterior: "fechada", status_novo: "aberta", origem: "desistencia_antes_da_admissao", candidatos_vagas_id: id },
          });
        }
      }
    } catch (err) {
      falhou("reabertura da vaga", err);
    }

    // Recalcula as posições pela contagem real de contratados. MOT reaberta por decisão de alguém não pode fechar sozinha
    // na mesma chamada (mesma regra da reativação manual); Terceirização segue o padrão.
    try {
      const r = await sincronizarPosicoesAbertas(vaga.id, svc, { permitirFechamentoAutomatico: vaga.tipo_servico !== "mao_obra_temporaria" });
      if (!r) falhou("posições da vaga", "vaga não encontrada no recálculo");
    } catch (err) {
      falhou("posições da vaga", err);
    }

    void registrarHistorico({
      candidato_id: cv.candidato_id,
      tipo: "etapa_alterada",
      descricao: `Candidato desistiu antes do início da admissão em ${vaga.titulo}${clienteNome ? ` (${clienteNome})` : ""}. Movido para Não tem Interesse. Motivo: ${motivo}`,
      metadata: { cv_id: id, vaga_id: cv.vaga_id, etapa_anterior: "contratado", etapa: "nao_tem_interesse", motivo, vaga_reaberta: vagaReaberta },
      criado_por: user.email ?? null,
    });

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc).catch(() => user.email ?? null),
      acao: "candidato_desistiu_antes_da_admissao",
      entidade: "candidatos_vagas",
      entidade_id: id,
      detalhes: { candidato_id: cv.candidato_id, vaga_id: cv.vaga_id, motivo, vaga_reaberta: vagaReaberta, data_inicio_anterior: cv.data_inicio ?? null, avisos },
    });

    return NextResponse.json({ resultado: "desistiu", vaga_reaberta: vagaReaberta, avisos });
  } catch (err) {
    console.error("[POST /api/candidatos-vagas/[id]/desistencia]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
