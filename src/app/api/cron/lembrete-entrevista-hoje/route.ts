import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { emailClienteLigado } from "@/lib/avisoCliente";
import { destinatariosEmailCliente } from "@/lib/destinatariosEmailCliente";
import { enviarEmailAoCliente } from "@/lib/enviarEmailAoCliente";
import { horaEntrevistaReal } from "@/lib/horaEntrevista";

export const dynamic = "force-dynamic";

interface EntrevistaHoje {
  encaminhamento_id: string;
  candidato_id: string;
  vaga_id: string | null;
  candidato_nome: string;
  cargo: string | null;
  hora: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Interruptor "E-mail" (Configurações > Avisos). Desligado: nem consulta as entrevistas. Sem linha ou erro de
    // leitura = ligado (comportamento de sempre).
    if (!(await emailClienteLigado("email_cliente_lembrete_entrevista_hoje", supabase))) {
      return NextResponse.json({ desligado: true, clientes_processados: 0, clientes_notificados: 0, encaminhamentos_marcados: 0 });
    }

    // Brasil não observa horário de verão desde 2019, então -03:00 é um offset
    // estável — evita puxar biblioteca de timezone só pra achar o dia de hoje.
    const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const inicioDia = new Date(`${hojeSP}T00:00:00-03:00`).toISOString();
    const fimDia = new Date(`${hojeSP}T23:59:59.999-03:00`).toISOString();

    const { data: rows, error } = await supabase
      .from("encaminhamentos")
      .select(
        "id, candidato_id, cliente_id, vaga_id, data_entrevista, candidatos(nome_completo, cargo_pretendido), clientes(nome, contato_email)"
      )
      .eq("status", "aguardando")
      .gte("data_entrevista", inicioDia)
      .lte("data_entrevista", fimDia)
      .is("lembrete_entrevista_hoje_enviado_em", null);

    if (error) {
      console.error("[cron/lembrete-entrevista-hoje] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const porCliente = new Map<
      string,
      { clienteNome: string; clienteEmail: string | null; itens: EntrevistaHoje[] }
    >();

    for (const row of (rows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const clienteId = r.cliente_id as string;
      const clienteNome = r.clientes?.nome ?? "Cliente";
      const clienteEmail = (r.clientes?.contato_email as string | null) ?? null;
      const hora = horaEntrevistaReal(r.data_entrevista);

      const entry = porCliente.get(clienteId) ?? { clienteNome, clienteEmail, itens: [] as EntrevistaHoje[] };
      entry.itens.push({
        encaminhamento_id: r.id,
        candidato_id: r.candidato_id,
        vaga_id: r.vaga_id ?? null,
        candidato_nome: r.candidatos?.nome_completo ?? "Candidato",
        cargo: r.candidatos?.cargo_pretendido ?? null,
        hora,
      });
      porCliente.set(clienteId, entry);
    }

    let clientesNotificados = 0;
    let encaminhamentosMarcados = 0;

    for (const [clienteId, { clienteNome, clienteEmail, itens }] of porCliente) {
      // Destinatários = login de cada usuário do portal (sem usuário, contato_email). clienteId vem da linha do banco.
      const destinatarios = await destinatariosEmailCliente(clienteId, supabase, { contatoEmail: clienteEmail });
      if (destinatarios.length === 0) {
        console.error(
          `[cron/lembrete-entrevista-hoje] Cliente ${clienteNome} (${clienteId}) sem usuário no portal e sem contato_email cadastrado — lembrete não enviado.`
        );
        continue;
      }

      const linhas = itens
        .map(
          (it) => `<tr>
            <td style="padding:8px 14px;font-weight:600;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${it.candidato_nome}</td>
            <td style="padding:8px 14px;color:#374151;font-size:13px;border-bottom:1px solid #f3f4f6">${it.cargo ?? "—"}</td>
            <td style="padding:8px 14px;color:#1D4ED8;font-weight:700;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${it.hora ?? "—"}</td>
          </tr>`
        )
        .join("");

      const plural = itens.length > 1;
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.15em">SALMAZOS RH &amp; SERVIÇOS</p>
    <h1 style="color:#FFD700;margin:0;font-size:20px">📅 Entrevista${plural ? "s" : ""} hoje</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Bom dia! Só passando pra confirmar que ${plural ? "estas entrevistas estão" : "esta entrevista está"} agendada${plural ? "s" : ""} para hoje:</p>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:8px 14px;font-weight:700;color:#6B7280;font-size:11px;text-transform:uppercase">Candidato</td>
        <td style="padding:8px 14px;font-weight:700;color:#6B7280;font-size:11px;text-transform:uppercase">Cargo</td>
        <td style="padding:8px 14px;font-weight:700;color:#6B7280;font-size:11px;text-transform:uppercase">Horário</td>
      </tr>
      ${linhas}
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#6B7280">Qualquer imprevisto, é só nos avisar.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© 2026 Salmazos RH &amp; Serviços — Lembrete automático</p>
  </div>
</div>
</body></html>`;

      // Um e-mail por pessoa. O carimbo de dedup vale se PELO MENOS UM envio foi aceito: uma falha em um
      // endereço não repete o lembrete para os outros no dia seguinte.
      const resultado = await enviarEmailAoCliente(
        destinatarios,
        {
          subject: plural
            ? `📅 Você tem ${itens.length} entrevistas hoje`
            : `📅 Você tem entrevista hoje: ${itens[0].candidato_nome}${itens[0].hora ? ` às ${itens[0].hora}` : ""}`,
          html,
          tipo: "lembrete_entrevista_hoje",
        },
        `cron/lembrete-entrevista-hoje cliente=${clienteId}`
      );

      if (resultado.aceitos === 0) {
        console.error(
          `[cron/lembrete-entrevista-hoje] E-mail NÃO enviado para cliente ${clienteNome} (${clienteId}): nenhum dos ${destinatarios.length} destinatário(s) foi aceito.`
        );
        continue;
      }

      clientesNotificados++;

      // Só marca dedup depois de confirmar que o e-mail saiu — mesmo padrão já
      // usado no cron de lembrete-agendamento.
      const ids = itens.map((it) => it.encaminhamento_id);
      const { error: updateErr } = await supabase
        .from("encaminhamentos")
        .update({ lembrete_entrevista_hoje_enviado_em: new Date().toISOString() })
        .in("id", ids);

      if (updateErr) {
        console.error(
          `[cron/lembrete-entrevista-hoje] Erro ao marcar dedup para cliente ${clienteId}:`,
          updateErr.message
        );
      } else {
        encaminhamentosMarcados += ids.length;
      }
    }

    return NextResponse.json({
      clientes_processados: porCliente.size,
      clientes_notificados: clientesNotificados,
      encaminhamentos_marcados: encaminhamentosMarcados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-entrevista-hoje]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
