import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import { obterDestinatariosFaturamentoHortolandiaAtraso } from "@/lib/faturamentoHortolandiaAvisos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const hojeISO = formatarDataISO(obterDataHojeBrasil());

    // Sem janela de cooldown de propósito (diferente de lembrete-cobranca-atraso): o
    // usuário pediu 1 aviso só por lançamento, nunca repetido — por isso o filtro é
    // só "ainda não avisado" (IS NULL), não "não avisado nos últimos N dias".
    const { data: rows, error } = await supabase
      .from("contas_receber_hortolandia")
      .select("id, numero_nf, valor, data_vencimento, clientes(nome)")
      .eq("status", "pendente")
      .lt("data_vencimento", hojeISO)
      .is("ultimo_lembrete_atraso_em", null);

    if (error) {
      console.error("[cron/lembrete-hortolandia-atraso] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const destinatarios = await obterDestinatariosFaturamentoHortolandiaAtraso(supabase);
    let lembretesEnviados = 0;

    for (const row of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      if (destinatarios.length === 0) {
        console.error(
          `[cron/lembrete-hortolandia-atraso] Nenhum destinatário resolvido (conta_id=${r.id}) — lembrete não enviado.`
        );
        continue;
      }

      const clienteNome = (Array.isArray(r.clientes) ? r.clientes[0]?.nome : r.clientes?.nome) ?? "Cliente";
      const diasAtraso = Math.floor(
        (Date.now() - new Date(r.data_vencimento + "T00:00:00").getTime()) / 86_400_000
      );

      const notificacoesSino = destinatarios.map((d) => ({
        tipo: "conta_receber_hortolandia_atrasada",
        titulo: `🔴 Faturamento Hortolândia atrasado há ${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}`,
        mensagem: `${clienteNome}${r.numero_nf ? ` — NF ${r.numero_nf}` : ""} — vencida em ${r.data_vencimento
          .split("-")
          .reverse()
          .join("/")}, ainda não paga.`,
        user_id: d.user_id,
        conta_receber_hortolandia_id: r.id,
      }));
      const { error: errNotif } = await supabase.from("notificacoes_analista").insert(notificacoesSino);
      if (errNotif) {
        console.error(
          `[cron/lembrete-hortolandia-atraso] Erro ao gravar notificações de sino (conta_id=${r.id}):`,
          errNotif.message
        );
        continue;
      }

      const { error: updateErr } = await supabase
        .from("contas_receber_hortolandia")
        .update({ ultimo_lembrete_atraso_em: new Date().toISOString() })
        .eq("id", r.id);

      if (updateErr) {
        console.error(
          `[cron/lembrete-hortolandia-atraso] Erro ao atualizar ultimo_lembrete_atraso_em (conta_id=${r.id}):`,
          updateErr.message
        );
      } else {
        lembretesEnviados++;
      }
    }

    return NextResponse.json({
      processadas: (rows ?? []).length,
      lembretes_enviados: lembretesEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-hortolandia-atraso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
