import { NextRequest, NextResponse, after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { obterDestinatariosCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";

interface Params {
  params: Promise<{ id: string }>;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return iso.split("-").reverse().join("/");
}

// Reenvio manual do e-mail "Cobrança gerada" — restrito a PAPEIS_FULL_ACCESS
// (checarPapelFullAccess), diferente do resto do módulo que também libera analistas com
// acesso configurável via cobranca_rs_analistas_acesso/checarAcessoCobrancaRS. Usado quando o
// envio original falhou silenciosamente ou os destinatários mudaram depois. E-mail (mesmo
// template/tipo de "cobrança gerada") + audit_log rodam em after(), mesmo padrão "melhor
// esforço" de marcar-paga/route.ts — a ação em si (reenviar) não depende de nenhuma escrita
// síncrona no banco, só validação de status.
export async function POST(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const gate = checarPapelFullAccess(user);
  if (gate) return gate;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: cobranca, error: cobrancaErr } = await svc
    .from("cobrancas_rs")
    .select("*, vagas(titulo)")
    .eq("id", id)
    .single();

  if (cobrancaErr || !cobranca) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  if (cobranca.status !== "aprovada_enviada") {
    return NextResponse.json({ error: "Só é possível reenviar a notificação de uma cobrança já enviada." }, { status: 400 });
  }

  const ehCancelamento = cobranca.tipo === "cancelamento";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaTitulo = (cobranca.vagas as any)?.titulo ?? "—";

  after(async () => {
    try {
      // Resolvido uma vez e reaproveitado nos dois registrarAuditoria abaixo (early-return
      // sem destinatário e o caminho normal) — evita 2 consultas a analistas_perfil no mesmo
      // request.
      const nomeUsuario = await resolverNomeUsuario(user.id, user.email ?? null, svc);

      // Revisor da cobrança original (não necessariamente quem está reenviando agora, que
      // pode ser outra pessoa full-access) — cobranca.revisado_por pode ser null se por
      // algum motivo a cobrança nunca teve revisor setado; nesse caso obterDestinatariosCobrancaRS
      // simplesmente não inclui ninguém extra além da base fixa, sem quebrar.
      const destinatarios = await obterDestinatariosCobrancaRS(cobranca.revisado_por ?? null, svc);
      if (destinatarios.length === 0) {
        console.error(`[reenviar] Nenhum destinatário resolvido pro reenvio (cobranca_id=${id}).`);
        registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: nomeUsuario,
          acao: "cobranca_rs_reenviada",
          entidade: "cobrancas_rs",
          entidade_id: id,
          detalhes: { cliente: cobranca.cliente_nome_snapshot, candidato: cobranca.candidato_nome_snapshot, destinatarios: 0, email_falhou: null },
        });
        return;
      }

      const template = getEmailTemplate("cobranca_rs_gerada", {
        nome: "",
        cargo: ehCancelamento ? vagaTitulo : cobranca.cargo,
        nomeCliente: cobranca.cliente_nome_snapshot,
        nomeCandidato: ehCancelamento ? undefined : cobranca.candidato_nome_snapshot,
        clienteCnpj: cobranca.cliente_cnpj_snapshot,
        clienteEndereco: cobranca.cliente_endereco_snapshot,
        clienteTelefone: cobranca.cliente_telefone_snapshot,
        clienteEmail: cobranca.cliente_email_snapshot,
        salario: formatarMoeda(Number(cobranca.salario)),
        dataInicio: ehCancelamento ? undefined : formatarData(cobranca.data_inicio),
        feeRsPercentual: Number(cobranca.fee_percentual),
        feeValor: Number(cobranca.fee_valor),
        tipoCobrancaRS: ehCancelamento ? "cancelamento" : "contratacao",
      });

      const resultados = await Promise.all(
        destinatarios.map((d) =>
          sendEmail({ to: d.email, subject: template.subject, html: template.html, tipo: "cobranca_rs_gerada" })
        )
      );
      const emailFalhou = resultados.some((r) => !r.success);
      if (emailFalhou) console.error(`[reenviar] Falha ao enviar para 1+ destinatário(s) (cobranca_id=${id})`);

      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: nomeUsuario,
        acao: "cobranca_rs_reenviada",
        entidade: "cobrancas_rs",
        entidade_id: id,
        detalhes: {
          cliente: cobranca.cliente_nome_snapshot,
          candidato: cobranca.candidato_nome_snapshot,
          destinatarios: destinatarios.length,
          email_falhou: emailFalhou,
        },
      });
    } catch (err) {
      console.error(`[reenviar] Erro ao reenviar notificação (cobranca_id=${id}):`, err);
    }
  });

  return NextResponse.json({ success: true });
}
