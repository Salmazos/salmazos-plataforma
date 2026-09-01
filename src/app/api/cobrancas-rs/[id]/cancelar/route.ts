import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeRevisarCobranca } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { parseBody, cobrancaRsCancelarSchema } from "@/lib/schemas";
import { obterDestinatariosCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";

interface Params {
  params: Promise<{ id: string }>;
}

// Cancelamento por justificativa — caso em que a cobrança é negociada com a diretoria e
// deixa de ser cobrada do cliente. Disponível a partir da tela de revisão (mesmo gate de
// acesso do "Aprovar", podeRevisarCobranca), em 'pendente_revisao' ou 'aprovada_enviada'.
// Nunca a partir de 'paga' (já recebida, cancelar retroativamente é um estorno, não isso) nem
// de 'cancelada' (já está no estado final). Critério de notificação idêntico ao de
// "cobrança revisada"/aprovada (POST /aprovar): mesma obterDestinatariosCobrancaRS.
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(cobrancaRsCancelarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { justificativa } = parsed.data;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: cobranca, error: cobrancaErr } = await svc
    .from("cobrancas_rs")
    .select("*, vagas(titulo)")
    .eq("id", id)
    .single();

  if (cobrancaErr || !cobranca) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  const pode = await podeRevisarCobranca(user, cobranca);
  if (!pode) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  if (cobranca.status !== "pendente_revisao" && cobranca.status !== "aprovada_enviada") {
    return NextResponse.json(
      { error: "Só é possível cancelar uma cobrança pendente de revisão ou aguardando validação." },
      { status: 400 }
    );
  }

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({
      status: "cancelada",
      cancelado_por: user.id,
      cancelado_em: new Date().toISOString(),
      justificativa_cancelamento: justificativa,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Mesmo motivo do revalidatePath em aprovar/route.ts e marcar-paga/route.ts: sem isso o
  // Router Cache do cliente reaproveita a lista antiga ao navegar de volta pra tela.
  revalidatePath("/painel/cobrancas-rs");

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "cobranca_rs_cancelada",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: {
      cliente: cobranca.cliente_nome_snapshot,
      candidato: cobranca.candidato_nome_snapshot,
      status_anterior: cobranca.status,
      justificativa,
    },
  });

  // E-mail best-effort pros mesmos destinatários de "cobrança revisada" (aprovar) — nunca
  // bloqueia a resposta, o cancelamento já foi confirmado no banco antes disso. Passa
  // user.id como revisadoPor pelo mesmo motivo do aprovar/route.ts: é quem está tomando a
  // ação agora, não necessariamente quem revisou/aprovou antes.
  after(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vagaTitulo = (cobranca.vagas as any)?.titulo ?? "—";
      const ehCancelamento = cobranca.tipo === "cancelamento";
      const destinatarios = await obterDestinatariosCobrancaRS(user.id, svc);
      if (destinatarios.length === 0) {
        console.error(`[cobrancas-rs/cancelar] Nenhum destinatário resolvido pro e-mail de cancelamento (cobranca_id=${id}).`);
        return;
      }

      const template = getEmailTemplate("cobranca_rs_cancelada", {
        nome: "",
        cargo: ehCancelamento ? vagaTitulo : cobranca.cargo ?? vagaTitulo,
        nomeCliente: cobranca.cliente_nome_snapshot,
        nomeCandidato: ehCancelamento ? undefined : cobranca.candidato_nome_snapshot ?? undefined,
        feeValor: cobranca.fee_valor,
        tipoCobrancaRS: cobranca.tipo,
        justificativaCancelamento: justificativa,
      });

      await Promise.all(
        destinatarios.map((d) =>
          sendEmail({ to: d.email, subject: template.subject, html: template.html, tipo: "cobranca_rs_cancelada" })
        )
      ).catch((err) => console.error(`[cobrancas-rs/cancelar] Erro ao enviar e-mail de cancelamento (cobranca_id=${id}):`, err));
    } catch (err) {
      console.error(`[cobrancas-rs/cancelar] Erro ao montar e-mail de cancelamento (cobranca_id=${id}):`, err);
    }
  });

  return NextResponse.json({ data });
}
