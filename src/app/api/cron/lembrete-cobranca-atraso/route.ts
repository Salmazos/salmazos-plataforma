import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDestinatariosCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const hojeISO = new Date().toISOString().split("T")[0];
    const corte = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from("cobrancas_rs")
      .select(
        "id, tipo, cliente_nome_snapshot, candidato_nome_snapshot, cargo, fee_valor, data_vencimento, vagas(titulo), clientes(responsavel_comercial)"
      )
      .eq("status", "aprovada_enviada")
      .lt("data_vencimento", hojeISO)
      .or(`ultimo_lembrete_atraso_em.is.null,ultimo_lembrete_atraso_em.lte.${corte}`);

    if (error) {
      console.error("[cron/lembrete-cobranca-atraso] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let lembretesEnviados = 0;

    for (const row of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const clienteNome = r.cliente_nome_snapshot ?? "Cliente";
      const vagaTitulo = r.vagas?.titulo ?? r.cargo ?? "—";
      const responsavelComercial = r.clientes?.responsavel_comercial ?? null;
      const diasAtraso = Math.floor((Date.now() - new Date(r.data_vencimento + "T00:00:00").getTime()) / 86400000);

      const destinatarios = await obterDestinatariosCobrancaRS(responsavelComercial, supabase);
      if (destinatarios.length === 0) {
        console.error(
          `[cron/lembrete-cobranca-atraso] Nenhum destinatário resolvido (cobranca_id=${r.id}) — lembrete não enviado.`
        );
        continue;
      }

      const template = getEmailTemplate("cobranca_rs_atrasada", {
        nome: "",
        cargo: vagaTitulo,
        nomeCliente: clienteNome,
        nomeCandidato: r.candidato_nome_snapshot ?? undefined,
        feeValor: r.fee_valor,
        dataVencimento: r.data_vencimento,
        diasAtraso,
        tipoCobrancaRS: r.tipo,
      });

      const resultados = await Promise.all(
        destinatarios.map((d) =>
          sendEmail({ to: d.email, subject: template.subject, html: template.html, tipo: "cobranca_rs_atrasada" })
        )
      );
      const algumEnviado = resultados.some((res) => res.success);
      if (!algumEnviado) {
        console.error(`[cron/lembrete-cobranca-atraso] Todos os e-mails falharam (cobranca_id=${r.id}).`);
      }

      const notificacoesSino = destinatarios.map((d) => ({
        tipo: "cobranca_rs_atrasada",
        titulo: `🔴 Cobrança R&S atrasada há ${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}`,
        mensagem: `${clienteNome} — ${vagaTitulo} — vencida em ${r.data_vencimento.split("-").reverse().join("/")}, ainda não paga.`,
        user_id: d.user_id,
        cobranca_rs_id: r.id,
      }));
      const { error: errNotif } = await supabase.from("notificacoes_analista").insert(notificacoesSino);
      if (errNotif) {
        console.error(`[cron/lembrete-cobranca-atraso] Erro ao gravar notificações de sino (cobranca_id=${r.id}):`, errNotif.message);
      }

      // Só marca como lembrado depois de confirmar que pelo menos um e-mail saiu de
      // verdade — mesmo cuidado do cron de referência (lembrete-agendamento): nunca
      // gravar dedup sem confirmar a tentativa real.
      if (algumEnviado) {
        const { error: updateErr } = await supabase
          .from("cobrancas_rs")
          .update({ ultimo_lembrete_atraso_em: new Date().toISOString() })
          .eq("id", r.id);

        if (updateErr) {
          console.error(`[cron/lembrete-cobranca-atraso] Erro ao atualizar ultimo_lembrete_atraso_em (cobranca_id=${r.id}):`, updateErr.message);
        } else {
          lembretesEnviados++;
        }
      }
    }

    return NextResponse.json({
      processadas: (rows ?? []).length,
      lembretes_enviados: lembretesEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-cobranca-atraso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
