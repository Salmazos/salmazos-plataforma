import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { obterDestinatariosPagaCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { avisarCobrancaRSEmail } from "@/lib/avisarCobrancaRS";
import { EVENTO_COBRANCA_RS_PAGA, TIPO_EMAIL_COBRANCA_PAGA } from "@/lib/cobrancaRSRegras";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const temAcesso = await checarAcessoCobrancaRS(user);
  if (!temAcesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const { id } = await params;
  const svc = createServiceClient();

  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status")
    .eq("id", id)
    .single();

  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  // Aceita tanto 'validada' (fluxo normal: diretoria já definiu vencimento) quanto
  // 'aprovada_enviada' (caso raro de marcar como paga sem nunca ter preenchido a data de
  // vencimento) — preserva comportamento que já existia antes da separação desses dois status.
  if (atual.status !== "aprovada_enviada" && atual.status !== "validada") {
    return NextResponse.json({ error: "Só é possível marcar como paga uma cobrança já enviada." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({ status: "paga", pago_em: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Invalida o Router Cache do lado do cliente pra /painel/cobrancas-rs — mesma lógica de
  // aprovar/route.ts (ver comentário lá). Roda antes do after() do e-mail de propósito, pra
  // garantir que aconteça mesmo se o envio falhar.
  revalidatePath("/painel/cobrancas-rs");

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "cobranca_rs_marcada_paga",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: { cliente: data.cliente_nome_snapshot, candidato: data.candidato_nome_snapshot },
  });

  // E-mail (sem sino) ao revisor da cobrança — best-effort, nunca
  // bloqueia nem derruba a resposta: o pagamento já foi confirmado no banco antes disso.
  // after() (não uma Promise solta) garante que o runtime espera esse trabalho terminar
  // depois de enviar a resposta, em vez de arriscar a função ser congelada antes do envio
  // sair — mesmo padrão já usado em notificar-encerramento/route.ts.
  after(async () => {
    try {
      // Aviso interno (Configurações > Avisos > cobranca_rs_paga). Sem lista no canal e-mail, o legado é SÓ o revisor desta
      // cobrança (revisado_por), e só se ele não for diretoria nem superuser (comparado por nivel_acesso): a diretoria
      // inteira (Elizabete, Andreza, Lucas Miguel e Olver) fica de fora deste e-mail — Elizabete é quem autoriza e realiza a
      // cobrança, e os demais decidiram que também não precisam de confirmação de um pagamento que a própria diretoria
      // fez (pedido do Olver, 23/09). O revisor sempre recebe, mesmo sem o toggle de acesso configurável nas outras
      // telas de Cobrança R&S: qualquer analista que revisa é comissionado pela vaga fechada, precisa saber quando o
      // pagamento sai. Antes isso era feito excluindo 4 e-mails fixos; agora a regra não depende de endereço. Lista vazia é
      // esperado (cobrança sem revisor, ou revisada pela diretoria): o envio é pulado. Com lista no canal, só a lista.
      await avisarCobrancaRSEmail(svc, {
        evento: EVENTO_COBRANCA_RS_PAGA,
        tipo: TIPO_EMAIL_COBRANCA_PAGA,
        cobrancaId: id,
        contexto: "marcar-paga",
        semDestinatarioEsperado: true,
        legado: () => obterDestinatariosPagaCobrancaRS(data.revisado_por ?? null, svc),
        montar: () =>
          getEmailTemplate("cobranca_rs_paga", {
            nome: "",
            cargo: data.cargo ?? "—",
            nomeCliente: data.cliente_nome_snapshot,
            nomeCandidato: data.candidato_nome_snapshot ?? undefined,
            feeValor: data.fee_valor,
            // Normaliza pra "YYYY-MM-DD" antes de passar pro template — data.pago_em é
            // timestamptz completo, mas o formatador de dataPagamento (mesmo padrão de
            // dataVencimento) espera só a parte da data.
            dataPagamento: data.pago_em ? data.pago_em.split("T")[0] : undefined,
            tipoCobrancaRS: data.tipo,
          }),
      });
    } catch (err) {
      console.error(`[marcar-paga] Erro ao montar e-mail de pagamento (cobranca_id=${id}):`, err);
    }
  });

  return NextResponse.json({ data });
}
