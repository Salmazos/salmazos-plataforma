import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDestinatariosCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { avisarCobrancaRSEmail, avisarCobrancaRSSinoAtraso } from "@/lib/avisarCobrancaRS";
import { deveCarimbarAviso } from "@/lib/avisosRestantesRegras";
import {
  EVENTO_COBRANCA_RS_ATRASADA,
  TIPO_COBRANCA_ATRASADA,
  corteLembreteAtraso,
  dataBrasilia,
  diasDeAtraso,
  inicioDiaBrasilia,
  textoSinoAtrasoCobranca,
} from "@/lib/cobrancaRSRegras";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    // Datas em horário de Brasília (antes: UTC). Às 06:00 de Brasília, hora do cron, dá o mesmo dia de sempre.
    const hojeISO = dataBrasilia();
    const corte = corteLembreteAtraso();

    const { data: rows, error } = await supabase
      .from("cobrancas_rs")
      .select(
        "id, tipo, cliente_nome_snapshot, candidato_nome_snapshot, cargo, fee_valor, data_vencimento, revisado_por, vagas(titulo)"
      )
      .eq("status", "validada")
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
      const diasAtraso = diasDeAtraso(r.data_vencimento, hojeISO);

      const destinatarios = await obterDestinatariosCobrancaRS(r.revisado_por ?? null, supabase);

      // Guarda contra sino duplicado: se o sino desta cobrança já foi gravado hoje e só faltou o carimbo (falha ao gravá-lo
      // numa execução anterior), não grava de novo — só tenta carimbar. Em caso de erro na consulta, segue como se não houvesse.
      const { data: sinoHoje } = await supabase
        .from("notificacoes_analista")
        .select("id")
        .eq("tipo", TIPO_COBRANCA_ATRASADA)
        .eq("cobranca_rs_id", r.id)
        .gte("created_at", inicioDiaBrasilia())
        .limit(1);
      const jaAvisadoHoje = (sinoHoje ?? []).length > 0;

      let resultados: ("enviado" | "desligado" | "falhou" | "sem_destinatario")[];
      if (jaAvisadoHoje) {
        resultados = ["enviado"];
      } else {
        const textoSino = textoSinoAtrasoCobranca({ diasAtraso, cliente: clienteNome, vaga: vagaTitulo, vencimentoISO: r.data_vencimento });
        // Sino e e-mail (Configurações > Avisos > cobranca_rs_atrasada): cada canal isolado, nunca lançam. Sino: os de
        // sempre + a lista. E-mail: sem lista, os mesmos de sempre; com lista, só a lista; desligado, ninguém.
        const [resSino, resEmail] = await Promise.all([
          avisarCobrancaRSSinoAtraso(supabase, {
            cobrancaId: r.id,
            userIdsDeSempre: destinatarios.map((d) => d.user_id),
            titulo: textoSino.titulo,
            mensagem: textoSino.mensagem,
          }),
          avisarCobrancaRSEmail(supabase, {
            evento: EVENTO_COBRANCA_RS_ATRASADA,
            tipo: TIPO_COBRANCA_ATRASADA,
            cobrancaId: r.id,
            contexto: "cron/lembrete-cobranca-atraso",
            legado: async () => destinatarios,
            montar: () =>
              getEmailTemplate("cobranca_rs_atrasada", {
                nome: "",
                cargo: vagaTitulo,
                nomeCliente: clienteNome,
                nomeCandidato: r.candidato_nome_snapshot ?? undefined,
                feeValor: r.fee_valor,
                dataVencimento: r.data_vencimento,
                diasAtraso,
                tipoCobrancaRS: r.tipo,
              }),
          }),
        ]);
        resultados = [resSino, resEmail.resultado];
      }

      // Carimba (cooldown de 2 dias) quando algo foi ENTREGUE (sino gravado ou e-mail aceito) ou quando todos os canais estão
      // desligados. Com canal ligado e nada entregue (falha ou ninguém a quem avisar) NÃO carimba: a próxima execução tenta
      // de novo. Antes só o e-mail contava, e o sino se repetia todo dia quando o e-mail falhava.
      if (!deveCarimbarAviso(resultados)) {
        console.error(
          `[cron/lembrete-cobranca-atraso] Aviso NÃO entregue (cobranca_id=${r.id}; sino/e-mail=${resultados.join("/")}) — sem carimbo, tenta de novo na próxima execução.`
        );
        continue;
      }

      const { error: updateErr } = await supabase
        .from("cobrancas_rs")
        .update({ ultimo_lembrete_atraso_em: new Date().toISOString() })
        .eq("id", r.id);

      if (updateErr) {
        console.error(`[cron/lembrete-cobranca-atraso] Erro ao atualizar ultimo_lembrete_atraso_em (cobranca_id=${r.id}):`, updateErr.message);
      } else if (!jaAvisadoHoje) {
        lembretesEnviados++;
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
