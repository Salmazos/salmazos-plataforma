import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDestinatariosSupervisaoAtraso } from "@/lib/supervisaoAvisos";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vagas.salmazos.com.br";

function parseDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const hoje = obterDataHojeBrasil();
    const corte = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: metas, error } = await supabase
      .from("clientes_meta_supervisao")
      .select("id, cliente_id, frequencia_dias, supervisor_responsavel_id, ultimo_aviso_atraso_em, clientes(nome)")
      .or(`ultimo_aviso_atraso_em.is.null,ultimo_aviso_atraso_em.lte.${corte}`);

    if (error) {
      console.error("[cron/lembrete-supervisao-atraso] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metasTyped = (metas ?? []) as any[];
    const clienteIds = metasTyped.map((m) => m.cliente_id);

    const { data: visitasSupervisao } = clienteIds.length > 0
      ? await supabase
          .from("km_visitas")
          .select("cliente_id, km_registros(data)")
          .eq("tipo_visita", "supervisao")
          .in("cliente_id", clienteIds)
      : { data: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visitasTyped = (visitasSupervisao ?? []) as any[];
    const ultimaVisitaPorCliente = new Map<string, string>();
    for (const v of visitasTyped) {
      const data = v.km_registros?.data;
      if (!data || !v.cliente_id) continue;
      const atual = ultimaVisitaPorCliente.get(v.cliente_id);
      if (!atual || data > atual) ultimaVisitaPorCliente.set(v.cliente_id, data);
    }

    let avisosEnviados = 0;
    let processadas = 0;

    for (const m of metasTyped) {
      if (!m.clientes) continue;

      const ultimaData = ultimaVisitaPorCliente.get(m.cliente_id) ?? null;
      const diasDesde = ultimaData ? Math.floor((hoje.getTime() - parseDataLocal(ultimaData).getTime()) / 86400000) : null;
      const atrasado = ultimaData === null || diasDesde! >= m.frequencia_dias;
      if (!atrasado) continue;

      processadas++;
      const clienteNome = (m.clientes as { nome: string }).nome;

      const destinatarios = await obterDestinatariosSupervisaoAtraso(m.supervisor_responsavel_id, supabase);
      if (destinatarios.length === 0) {
        console.error(
          `[cron/lembrete-supervisao-atraso] Nenhum destinatário resolvido (meta_id=${m.id}) — aviso não enviado.`
        );
        continue;
      }

      const template = getEmailTemplate("supervisao_cliente_atrasada", {
        nome: "",
        cargo: "",
        nomeCliente: clienteNome,
        diasSemSupervisao: diasDesde,
        frequenciaDiasSupervisao: m.frequencia_dias,
        supervisaoUrl: `${SITE_URL}/painel/supervisao`,
      });

      const resultados = await Promise.all(
        destinatarios.map((d) =>
          sendEmail({ to: d.email, subject: template.subject, html: template.html, tipo: "supervisao_cliente_atrasada" })
        )
      );
      const algumEnviado = resultados.some((res) => res.success);
      if (!algumEnviado) {
        console.error(`[cron/lembrete-supervisao-atraso] Todos os e-mails falharam (meta_id=${m.id}).`);
      }

      const diasLabel = diasDesde == null ? "sem registro" : `atrasado há ${diasDesde} dia${diasDesde !== 1 ? "s" : ""}`;
      const notificacoesSino = destinatarios.map((d) => ({
        tipo: "supervisao_cliente_atrasada",
        titulo: `🔴 Supervisão pendente — ${clienteNome}`,
        mensagem: `${clienteNome} — ${diasLabel}.`,
        user_id: d.user_id,
        cliente_meta_supervisao_id: m.id,
      }));
      const { error: errNotif } = await supabase.from("notificacoes_analista").insert(notificacoesSino);
      if (errNotif) {
        console.error(`[cron/lembrete-supervisao-atraso] Erro ao gravar notificações de sino (meta_id=${m.id}):`, errNotif.message);
      }

      // Só marca como avisado depois de confirmar que pelo menos um e-mail saiu de verdade —
      // mesmo cuidado do cron de referência (lembrete-cobranca-atraso): nunca gravar dedup
      // sem confirmar a tentativa real.
      if (algumEnviado) {
        const { error: updateErr } = await supabase
          .from("clientes_meta_supervisao")
          .update({ ultimo_aviso_atraso_em: new Date().toISOString() })
          .eq("id", m.id);

        if (updateErr) {
          console.error(`[cron/lembrete-supervisao-atraso] Erro ao atualizar ultimo_aviso_atraso_em (meta_id=${m.id}):`, updateErr.message);
        } else {
          avisosEnviados++;
        }
      }
    }

    return NextResponse.json({
      candidatas: metasTyped.length,
      processadas,
      avisos_enviados: avisosEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-supervisao-atraso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
