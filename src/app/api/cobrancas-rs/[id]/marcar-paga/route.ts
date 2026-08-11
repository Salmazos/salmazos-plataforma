import { NextRequest, NextResponse, after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { obterDestinatariosCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";

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
  if (atual.status !== "aprovada_enviada") {
    return NextResponse.json({ error: "Só é possível marcar como paga uma cobrança já enviada." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({ status: "paga", pago_em: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "cobranca_rs_marcada_paga",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: { cliente: data.cliente_nome_snapshot, candidato: data.candidato_nome_snapshot },
  });

  // E-mail (sem sino) pros mesmos destinatários do aviso de atraso — best-effort, nunca
  // bloqueia nem derruba a resposta: o pagamento já foi confirmado no banco antes disso.
  // after() (não uma Promise solta) garante que o runtime espera esse trabalho terminar
  // depois de enviar a resposta, em vez de arriscar a função ser congelada antes do envio
  // sair — mesmo padrão já usado em notificar-encerramento/route.ts.
  after(async () => {
    try {
      const destinatarios = await obterDestinatariosCobrancaRS(data.revisado_por ?? null, svc);
      if (destinatarios.length === 0) {
        console.error(`[marcar-paga] Nenhum destinatário resolvido pro e-mail de pagamento (cobranca_id=${id}).`);
        return;
      }

      const template = getEmailTemplate("cobranca_rs_paga", {
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
      });

      await Promise.all(
        destinatarios.map((d) =>
          sendEmail({ to: d.email, subject: template.subject, html: template.html, tipo: "cobranca_rs_paga" })
        )
      ).catch((err) => console.error(`[marcar-paga] Erro ao enviar e-mail de pagamento (cobranca_id=${id}):`, err));
    } catch (err) {
      console.error(`[marcar-paga] Erro ao montar e-mail de pagamento (cobranca_id=${id}):`, err);
    }
  });

  return NextResponse.json({ data });
}
