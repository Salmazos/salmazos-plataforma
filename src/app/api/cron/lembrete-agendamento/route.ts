import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyResponsibleOrAll } from "@/lib/notifyAllAnalysts";
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
    const corte = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from("encaminhamentos")
      .select(
        "id, candidato_id, cliente_id, vaga_id, created_at, candidatos(nome_completo, responsavel), clientes(nome, contato_email)"
      )
      .eq("status", "aguardando_agendamento_cliente")
      .or(`and(ultimo_lembrete_agendamento_em.is.null,created_at.lte.${corte}),ultimo_lembrete_agendamento_em.lte.${corte}`);

    if (error) {
      console.error("[cron/lembrete-agendamento] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let lembretesEnviados = 0;

    for (const row of (rows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const candidatoNome = r.candidatos?.nome_completo ?? "Candidato";
      const responsavel = r.candidatos?.responsavel ?? null;
      const clienteNome = r.clientes?.nome ?? "Cliente";
      const clienteEmail = r.clientes?.contato_email as string | null;
      const diasAguardando = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
      const diasLabel = `${diasAguardando} dia${diasAguardando !== 1 ? "s" : ""}`;

      // a) Lembrete pro analista responsável (com fallback pra todos, mesmo padrão
      //    já usado na confirmação de agendamento — ver notifyResponsibleOrAll).
      const htmlAnalista = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">⏰ Cliente ainda não marcou a entrevista</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0;color:#92400E;font-size:14px;font-weight:700">Aguardando agendamento há ${diasLabel}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${candidatoNome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${clienteNome}</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/candidato/${r.candidato_id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil do candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Lembrete automático de agendamento pendente</p>
  </div>
</div>
</body></html>`;

      const resultadoAnalista = await notifyResponsibleOrAll({
        responsavelNome: responsavel,
        subject: `⏰ ${clienteNome} ainda não marcou a entrevista de ${candidatoNome}`,
        html: htmlAnalista,
        tipo: "lembrete_agendamento_pendente_analista",
        titulo: `⏰ Aguardando agendamento há ${diasLabel}`,
        mensagem: `${clienteNome} ainda não marcou a entrevista de ${candidatoNome} — aguardando há ${diasLabel}.`,
        candidato_id: r.candidato_id,
        vaga_id: r.vaga_id ?? undefined,
      });

      if (resultadoAnalista.attempted === 0) {
        console.error(
          `[cron/lembrete-agendamento] Lembrete pro analista NÃO enviado (encaminhamento_id=${r.id}) — nenhuma tentativa de e-mail foi registrada.`
        );
      }

      // b) E-mail cordial pro cliente, lembrando de marcar a entrevista.
      let clienteEnviado = false;
      if (clienteEmail) {
        const htmlCliente = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">📅 Falta pouco para a entrevista!</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Olá! Passando pra lembrar que temos um candidato aguardando você definir a data e o horário da entrevista:</p>
    <div style="margin-bottom:20px;padding:14px 16px;background:#DBEAFE;border-radius:10px;border:1px solid #93C5FD">
      <p style="margin:0;font-size:16px;font-weight:700;color:#1D4ED8">${candidatoNome}</p>
    </div>
    <p style="margin:0 0 20px;font-size:14px;color:#374151">Assim que você confirmar, avisamos o candidato e seguimos com o processo. Leva menos de um minuto:</p>
    <div style="text-align:center">
      <a href="https://salmazos-plataforma.vercel.app/portal/candidato/${r.id}" style="display:inline-block;padding:12px 28px;background:#000;color:#FFD700;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">Confirmar data da entrevista</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Lembrete automático</p>
  </div>
</div>
</body></html>`;

        const resultadoCliente = await sendEmail({
          to: clienteEmail,
          subject: `📅 Falta pouco! Confirme a entrevista de ${candidatoNome}`,
          html: htmlCliente,
          tipo: "lembrete_agendamento_pendente",
          candidato_id: r.candidato_id,
          vaga_id: r.vaga_id ?? undefined,
        });

        clienteEnviado = resultadoCliente.success;
        if (!resultadoCliente.success) {
          console.error(
            `[cron/lembrete-agendamento] E-mail pro cliente NÃO enviado (encaminhamento_id=${r.id}): ${resultadoCliente.error}`
          );
        }
      } else {
        console.error(
          `[cron/lembrete-agendamento] Cliente ${clienteNome} sem contato_email cadastrado (encaminhamento_id=${r.id}) — lembrete não enviado.`
        );
      }

      // Só marca como enviado depois de confirmar que o e-mail pro cliente saiu de
      // verdade — mesmo raciocínio do fix de 2026-07-20 (nunca gravar dedup sem
      // confirmar a tentativa real). Se o SMTP falhar, o cron tenta de novo na
      // próxima execução em vez de ficar quieto pra sempre sobre esse encaminhamento.
      if (clienteEnviado) {
        const { error: updateErr } = await supabase
          .from("encaminhamentos")
          .update({ ultimo_lembrete_agendamento_em: new Date().toISOString() })
          .eq("id", r.id);

        if (updateErr) {
          console.error(
            `[cron/lembrete-agendamento] Erro ao atualizar ultimo_lembrete_agendamento_em (encaminhamento_id=${r.id}):`,
            updateErr.message
          );
        } else {
          lembretesEnviados++;
        }
      }
    }

    return NextResponse.json({
      processados: (rows ?? []).length,
      lembretes_enviados: lembretesEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-agendamento]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
