import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { parseBody, cobrancaRsRetroativaSchema } from "@/lib/schemas";
import { gerarCobrancaRSSeAplicavel } from "@/lib/cobrancaRS";
import { resolverTipoServicoVigente } from "@/lib/tipoServicoVigente";
import { checarAcessoCandidatoVaga } from "@/lib/unidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Gera a cobrança R&S de uma contratação que foi registrada como "não gerar" (candidatos_vagas.gerar_cobranca_rs=false). Só diretoria e
// superuser. É a correção do caso em que a decisão foi tomada por engano: não existia caminho para voltar atrás.
// Não mexe em etapa, garantia, posições da vaga, alocação nem histórico de contratação; a comissão nasce depois, do jeito de sempre, quando a
// cobrança é enviada (comissao.ts lê cobrancas_rs, nunca gerar_cobranca_rs). Sem duplicar: já existindo cobrança desta candidatura, recusa
// (e o UNIQUE de cobrancas_rs.candidato_vaga_id garante no banco). decisao_cobranca_registrada_em NÃO é alterada: o momento da decisão
// original fica preservado e vai na auditoria.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    const negado = checarPapelFullAccess(user);
    if (negado) return negado;
    const bloqueio = await checarAcessoCandidatoVaga(user, id);
    if (bloqueio) return bloqueio;

    const parsed = parseBody(cobrancaRsRetroativaSchema, await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { justificativa } = parsed.data;

    const svc = createServiceClient();
    const { data: cv } = await svc
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, etapa, gerar_cobranca_rs, decisao_cobranca_registrada_em, vagas!candidatos_vagas_vaga_id_fkey(tipo_servico)")
      .eq("id", id)
      .maybeSingle();
    if (!cv) return NextResponse.json({ error: "Candidatura não encontrada." }, { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vagaTipo = ((cv as any).vagas?.tipo_servico ?? null) as string | null;

    if (cv.etapa !== "contratado") return NextResponse.json({ error: "Só é possível gerar a cobrança de uma candidatura contratada." }, { status: 409 });
    const tipo = await resolverTipoServicoVigente(svc, cv.candidato_id, cv.vaga_id, vagaTipo);
    if (tipo !== "recrutamento_selecao") return NextResponse.json({ error: "Cobrança R&S só existe para contratação de Recrutamento e Seleção." }, { status: 409 });
    if (cv.gerar_cobranca_rs === true) return NextResponse.json({ error: "Esta contratação já está marcada para gerar cobrança." }, { status: 409 });
    if (cv.gerar_cobranca_rs !== false) return NextResponse.json({ error: "Esta contratação não tem decisão de cobrança registrada como \"não gerar\"." }, { status: 409 });

    const { data: existente } = await svc.from("cobrancas_rs").select("id").eq("candidato_vaga_id", id).maybeSingle();
    if (existente) return NextResponse.json({ error: "Já existe cobrança para esta contratação.", cobranca_rs_id: existente.id }, { status: 409 });

    // Troca condicional (guarda de contagem): só vira "gerar" se continuar false e contratado; duas chamadas simultâneas não passam as duas.
    const { data: virou, error: virarErr } = await svc
      .from("candidatos_vagas")
      .update({ gerar_cobranca_rs: true })
      .eq("id", id)
      .eq("gerar_cobranca_rs", false)
      .eq("etapa", "contratado")
      .select("id");
    if (virarErr) {
      console.error("[gerar-cobranca-retroativa] Falha ao atualizar a decisão:", virarErr.message);
      return NextResponse.json({ error: "Não foi possível atualizar a decisão de cobrança. Nada foi alterado." }, { status: 500 });
    }
    if (!virou || virou.length !== 1) return NextResponse.json({ error: "A decisão desta contratação mudou enquanto você a abria. Recarregue a página." }, { status: 409 });

    const resultado = await gerarCobrancaRSSeAplicavel(cv.vaga_id, id, svc, user.id).catch((err) => {
      console.error("[gerar-cobranca-retroativa] Erro ao gerar a cobrança:", err);
      return { criada: false as const, motivo: undefined };
    });

    const usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, svc).catch(() => null);
    if (!resultado.criada) {
      // Desfaz a troca para a decisão original continuar de pé (só se ninguém a mudou nesse meio tempo).
      await svc.from("candidatos_vagas").update({ gerar_cobranca_rs: false }).eq("id", id).eq("gerar_cobranca_rs", true);
      registrarAuditoria({
        usuario_id: user.id, usuario_nome: usuarioNome, acao: "cobranca_rs_retroativa_nao_gerada", entidade: "candidatos_vagas", entidade_id: id,
        detalhes: { vaga_id: cv.vaga_id, candidato_id: cv.candidato_id, motivo: resultado.motivo ?? "erro", justificativa },
      });
      const msg = resultado.motivo === "ja_existe" ? "Já existe cobrança para esta contratação."
        : resultado.motivo === "sem_fee_configurado" ? "A vaga não tem taxa (%) configurada. Configure a taxa e tente de novo."
        : resultado.motivo === "sem_cliente_vinculado" ? "A vaga não tem cliente cadastrado. Vincule o cliente e tente de novo."
        : "Não foi possível gerar a cobrança. A decisão anterior foi mantida.";
      return NextResponse.json({ error: msg, motivo: resultado.motivo ?? null }, { status: resultado.motivo === "ja_existe" ? 409 : 422 });
    }

    registrarAuditoria({
      usuario_id: user.id, usuario_nome: usuarioNome, acao: "cobranca_rs_gerada_retroativa", entidade: "candidatos_vagas", entidade_id: id,
      detalhes: {
        vaga_id: cv.vaga_id, candidato_id: cv.candidato_id, cobranca_rs_id: resultado.id ?? null, justificativa,
        decisao_anterior: { gerar_cobranca_rs: false, registrada_em: cv.decisao_cobranca_registrada_em },
      },
    });
    return NextResponse.json({ cobranca_rs_id: resultado.id ?? null });
  } catch (err) {
    console.error("[POST /api/candidatos-vagas/[id]/gerar-cobranca-retroativa]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
