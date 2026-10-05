import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarGarantiaRS } from "@/lib/avisarGarantiaRS";
import { dataBrasilia, deveCarimbarGarantia, erroColunaCarimboInexistente, janelaAlertaGarantia } from "@/lib/garantiaRS";

export const dynamic = "force-dynamic";

const ETAPAS_COM_GARANTIA = ["aprovado_cliente", "contratado"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Datas no fuso de Brasília. Alerta no último dia da garantia e, se o cron falhou, recupera até 2 dias
    // para trás; garantia_alerta_enviado_em evita repetir (inclusive se o cron rodar duas vezes no mesmo dia).
    const agora = new Date();
    const { inicio, fim: hojeISO } = janelaAlertaGarantia(agora);

    const colunas =
      "id, candidato_id, vaga_id, garantia_data_fim, candidatos(nome_completo, responsavel), vagas!candidatos_vagas_vaga_id_fkey(titulo, unidade_id, clientes(nome))";

    let comCarimbo = true;
    let { data: rows, error } = await supabase
      .from("candidatos_vagas")
      .select(colunas)
      .eq("garantia_acionada", false)
      .not("garantia_data_fim", "is", null)
      .in("etapa", ETAPAS_COM_GARANTIA)
      .gte("garantia_data_fim", inicio)
      .lte("garantia_data_fim", hojeISO)
      .is("garantia_alerta_enviado_em", null);

    if (erroColunaCarimboInexistente(error)) {
      // Rede de segurança SÓ para a coluna do carimbo inexistente (migration pendente): o alerta do dia continua
      // saindo como antes (só o último dia, sem carimbo), em vez de o cron inteiro parar. Qualquer outro erro vai
      // para a checagem abaixo (500): sem carimbo, o fallback reenviaria aviso a quem já foi avisado.
      console.error("[garantia-rs] Coluna garantia_alerta_enviado_em inexistente, usando a consulta antiga (só hoje, sem carimbo):", error?.message);
      comCarimbo = false;
      ({ data: rows, error } = await supabase
        .from("candidatos_vagas")
        .select(colunas)
        .eq("garantia_acionada", false)
        .not("garantia_data_fim", "is", null)
        .in("etapa", ETAPAS_COM_GARANTIA)
        .eq("garantia_data_fim", hojeISO));
    }

    if (error) {
      console.error("[garantia-rs] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let alertasEnviados = 0;
    let carimbados = 0;

    for (const row of (rows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;

      // Nunca lança: sino, popup e e-mail seguem Configurações > Avisos (evento garantia_rs_vencendo).
      const resultado = await avisarGarantiaRS(supabase, {
        evento: "vencendo",
        candidatoId: r.candidato_id,
        vagaId: r.vaga_id,
        candidatoNome: r.candidatos?.nome_completo,
        vagaTitulo: r.vagas?.titulo,
        clienteNome: r.vagas?.clientes?.nome,
        responsavelNome: r.candidatos?.responsavel ?? null,
        unidadeId: r.vagas?.unidade_id ?? null,
        dataFim: r.garantia_data_fim as string,
      });

      if (resultado.sino === "enviado" || resultado.email === "enviado") alertasEnviados++;

      if (!deveCarimbarGarantia([resultado.sino, resultado.email])) {
        // Todos os canais ligados falharam: sem carimbo, a próxima execução tenta de novo (até 2 dias).
        console.error(
          `[cron/garantia-rs] Alerta NÃO entregue para candidato_id=${r.candidato_id} (sino=${resultado.sino}, e-mail=${resultado.email}) — sem carimbo, tenta de novo na próxima execução.`
        );
        continue;
      }
      if (!comCarimbo) continue;

      const { error: erroCarimbo } = await supabase
        .from("candidatos_vagas")
        .update({ garantia_alerta_enviado_em: new Date().toISOString() })
        .eq("id", r.id)
        .is("garantia_alerta_enviado_em", null);
      if (erroCarimbo) {
        console.error(`[cron/garantia-rs] Erro ao gravar o carimbo (candidatos_vagas.id=${r.id}):`, erroCarimbo.message);
      } else {
        carimbados++;
      }
    }

    return NextResponse.json({
      hoje: hojeISO,
      processados: (rows ?? []).length,
      alertas_enviados: alertasEnviados,
      carimbados,
    });
  } catch (err) {
    console.error("[GET /api/cron/garantia-rs]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
