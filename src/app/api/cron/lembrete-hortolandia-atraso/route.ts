import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import { obterDestinatariosFaturamentoHortolandiaAtraso } from "@/lib/faturamentoHortolandiaAvisos";
import { nomeUnidadeFaturamento } from "@/lib/faturamentoUnidades";
import { gravarSinoConfiguravel } from "@/lib/avisoConfiguravel";
import {
  EVENTO_CONTA_HORTOLANDIA_ATRASADA,
  TIPO_CONTA_HORTOLANDIA_ATRASADA,
  deveCarimbarAviso,
  textoContaReceberAtrasada,
} from "@/lib/avisosRestantesRegras";

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
      .select("id, numero_nf, valor, data_vencimento, unidade_id, clientes(nome)")
      .eq("status", "pendente")
      .lt("data_vencimento", hojeISO)
      .is("ultimo_lembrete_atraso_em", null);

    if (error) {
      console.error("[cron/lembrete-hortolandia-atraso] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const destinatarios = await obterDestinatariosFaturamentoHortolandiaAtraso(supabase);
    // Faturamento Unidades: o aviso diz de qual unidade é o lançamento atrasado.
    const { data: unidades } = await supabase.from("unidades").select("id, slug, nome");
    const unidadePorId = new Map((unidades ?? []).map((u) => [u.id, u]));
    let lembretesEnviados = 0;

    for (const row of rows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const clienteNome = (Array.isArray(r.clientes) ? r.clientes[0]?.nome : r.clientes?.nome) ?? "Cliente";
      const diasAtraso = Math.floor(
        (Date.now() - new Date(r.data_vencimento + "T00:00:00").getTime()) / 86_400_000
      );

      // Sino (Configurações > Avisos > conta_receber_hortolandia_atrasada): diretoria/superuser + lista. Nunca lança.
      const resSino = await gravarSinoConfiguravel(supabase, {
        evento: EVENTO_CONTA_HORTOLANDIA_ATRASADA,
        deSempre: destinatarios.map((d) => d.user_id),
        linha: {
          tipo: TIPO_CONTA_HORTOLANDIA_ATRASADA,
          ...textoContaReceberAtrasada({
            unidade: nomeUnidadeFaturamento(unidadePorId.get(r.unidade_id)),
            diasAtraso,
            cliente: clienteNome,
            numeroNf: r.numero_nf,
            vencimentoISO: r.data_vencimento,
          }),
          extra: { conta_receber_hortolandia_id: r.id },
        },
        geral: "nunca",
      });

      // Um aviso só por lançamento: carimba quando foi ENTREGUE (ou o sino está desligado). Falha ou ninguém a quem
      // avisar: não carimba, tenta de novo na próxima execução. A única escrita na conta é este carimbo.
      if (!deveCarimbarAviso([resSino])) {
        console.error(`[cron/lembrete-hortolandia-atraso] Aviso NÃO entregue (conta_id=${r.id}, sino=${resSino}) — sem carimbo, tenta de novo na próxima execução.`);
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
