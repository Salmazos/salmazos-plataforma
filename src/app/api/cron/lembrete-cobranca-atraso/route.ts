import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDestinatariosCobrancaRS, obterDestinatariosValidacaoCobrancaRS } from "@/lib/cobrancaRS";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { avisarCobrancaRSEmail, avisarCobrancaRSSinoAguardandoValidacao, avisarCobrancaRSSinoAtraso } from "@/lib/avisarCobrancaRS";
import { deveCarimbarAviso } from "@/lib/avisosRestantesRegras";
import {
  EVENTO_COBRANCA_RS_AGUARDANDO_VALIDACAO,
  EVENTO_COBRANCA_RS_ATRASADA,
  TIPO_COBRANCA_AGUARDANDO_VALIDACAO,
  TIPO_COBRANCA_ATRASADA,
  corteLembreteAtraso,
  dataBrasilia,
  diasDeAtraso,
  diasParadoDesde,
  ehErroColunaLembreteValidacao,
  inicioDiaBrasilia,
  limiteCooldownValidacao,
  limiteEnvioValidacao,
  textoSinoAguardandoValidacao,
  textoSinoAtrasoCobranca,
} from "@/lib/cobrancaRSRegras";
import { urlSite } from "@/lib/siteUrl";

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

    // Bloco novo e isolado: cobrança parada em "Aguardando validação". Roda depois do atraso, nunca lança e não mexe no que o
    // bloco de atraso já decidiu ou gravou.
    const aguardandoValidacao = await lembretesAguardandoValidacao(supabase);

    return NextResponse.json({
      processadas: (rows ?? []).length,
      lembretes_enviados: lembretesEnviados,
      aguardando_validacao: aguardandoValidacao,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-cobranca-atraso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

interface ResumoAguardandoValidacao {
  processadas: number;
  lembretes_enviados: number;
  // true quando a coluna ultimo_lembrete_validacao_em ainda não existe (migration não aplicada): o bloco foi pulado.
  pulado?: boolean;
}

// Lembrete de cobrança parada em "Aguardando validação" (status aprovada_enviada, sem data de vencimento): enviada há 2 dias ou mais
// (por data, em Brasília) e sem lembrete nos últimos 2 dias. Repete a cada 2 dias, sem limite, até definirem o vencimento (vira
// validada) ou cancelarem. Quem recebe: quem pode definir o vencimento (diretoria/superuser, acesso configurado e o gerador).
// Sino e e-mail seguem Configurações > Avisos (cobranca_rs_aguardando_validacao). O carimbo ultimo_lembrete_validacao_em só grava
// quando algo foi ENTREGUE (sino gravado ou e-mail aceito) ou todos os canais estão desligados. NUNCA lança.
async function lembretesAguardandoValidacao(supabase: ReturnType<typeof createServiceClient>): Promise<ResumoAguardandoValidacao> {
  const resumo: ResumoAguardandoValidacao = { processadas: 0, lembretes_enviados: 0 };
  try {
    const hojeISO = dataBrasilia();
    const { data: rows, error } = await supabase
      .from("cobrancas_rs")
      .select("id, tipo, cliente_nome_snapshot, candidato_nome_snapshot, cargo, enviado_em, gerado_por_user_id, vagas(titulo)")
      .eq("status", "aprovada_enviada")
      .is("data_vencimento", null)
      .lt("enviado_em", limiteEnvioValidacao(hojeISO))
      .or(`ultimo_lembrete_validacao_em.is.null,ultimo_lembrete_validacao_em.lt.${limiteCooldownValidacao(hojeISO)}`);

    if (error) {
      if (ehErroColunaLembreteValidacao(error)) {
        console.warn("[cron/lembrete-cobranca-atraso] Lembrete de validação pulado: coluna ultimo_lembrete_validacao_em ainda não existe (migration não aplicada).");
        return { ...resumo, pulado: true };
      }
      console.error("[cron/lembrete-cobranca-atraso] Lembrete de validação: erro na seleção (ignorado):", error.message);
      return resumo;
    }

    resumo.processadas = (rows ?? []).length;

    for (const row of rows ?? []) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any;
        const clienteNome = r.cliente_nome_snapshot ?? "Cliente";
        const vagaTitulo = r.vagas?.titulo ?? r.cargo ?? "—";
        const tipo: "contratacao" | "cancelamento" = r.tipo === "cancelamento" ? "cancelamento" : "contratacao";
        const dias = diasParadoDesde(r.enviado_em, hojeISO);

        const destinatarios = await obterDestinatariosValidacaoCobrancaRS(r.gerado_por_user_id ?? null, supabase);

        // Guarda contra sino duplicado no mesmo dia de Brasília: se o sino desta cobrança já foi gravado hoje e só faltou o
        // carimbo, não grava de novo, só tenta carimbar (mesmo padrão do bloco de atraso).
        const { data: sinoHoje } = await supabase
          .from("notificacoes_analista")
          .select("id")
          .eq("tipo", TIPO_COBRANCA_AGUARDANDO_VALIDACAO)
          .eq("cobranca_rs_id", r.id)
          .gte("created_at", inicioDiaBrasilia())
          .limit(1);
        const jaAvisadoHoje = (sinoHoje ?? []).length > 0;

        let resultados: ("enviado" | "desligado" | "falhou" | "sem_destinatario")[];
        if (jaAvisadoHoje) {
          resultados = ["enviado"];
        } else {
          const textoSino = textoSinoAguardandoValidacao({ dias, tipo, cliente: clienteNome, vaga: vagaTitulo, candidato: r.candidato_nome_snapshot });
          const [resSino, resEmail] = await Promise.all([
            avisarCobrancaRSSinoAguardandoValidacao(supabase, {
              cobrancaId: r.id,
              userIdsDeSempre: destinatarios.map((d) => d.user_id),
              titulo: textoSino.titulo,
              mensagem: textoSino.mensagem,
            }),
            avisarCobrancaRSEmail(supabase, {
              evento: EVENTO_COBRANCA_RS_AGUARDANDO_VALIDACAO,
              tipo: TIPO_COBRANCA_AGUARDANDO_VALIDACAO,
              cobrancaId: r.id,
              contexto: "cron/lembrete-cobranca-atraso (aguardando validação)",
              legado: async () => destinatarios,
              montar: () =>
                getEmailTemplate("cobranca_rs_aguardando_validacao", {
                  nome: "",
                  cargo: vagaTitulo,
                  nomeCliente: clienteNome,
                  nomeCandidato: r.candidato_nome_snapshot ?? undefined,
                  tipoCobrancaRS: tipo,
                  diasParado: dias,
                  cobrancaUrl: urlSite(`/painel/cobrancas-rs?abrir=${r.id}`),
                }),
            }),
          ]);
          resultados = [resSino, resEmail.resultado];
        }

        // Carimba quando algo foi ENTREGUE ou todos os canais estão desligados; com canal ligado e nada entregue, NÃO carimba e
        // tenta de novo na próxima execução.
        if (!deveCarimbarAviso(resultados)) {
          console.error(
            `[cron/lembrete-cobranca-atraso] Lembrete de validação NÃO entregue (cobranca_id=${r.id}; sino/e-mail=${resultados.join("/")}) — sem carimbo, tenta de novo na próxima execução.`
          );
          continue;
        }

        const { error: updateErr } = await supabase
          .from("cobrancas_rs")
          .update({ ultimo_lembrete_validacao_em: new Date().toISOString() })
          .eq("id", r.id);

        if (updateErr) {
          if (ehErroColunaLembreteValidacao(updateErr)) {
            console.warn("[cron/lembrete-cobranca-atraso] Lembrete de validação: coluna ultimo_lembrete_validacao_em ausente ao carimbar — bloco interrompido.");
            return { ...resumo, pulado: true };
          }
          console.error(`[cron/lembrete-cobranca-atraso] Erro ao gravar ultimo_lembrete_validacao_em (cobranca_id=${r.id}):`, updateErr.message);
        } else if (!jaAvisadoHoje) {
          resumo.lembretes_enviados++;
        }
      } catch (err) {
        console.error("[cron/lembrete-cobranca-atraso] Lembrete de validação: erro numa cobrança (ignorado):", err);
      }
    }
  } catch (err) {
    console.error("[cron/lembrete-cobranca-atraso] Lembrete de validação: erro inesperado (ignorado):", err);
  }
  return resumo;
}
