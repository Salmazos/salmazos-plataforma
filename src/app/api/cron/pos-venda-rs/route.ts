import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarPosVendaRS } from "@/lib/avisarPosVendaRS";
import { deveCarimbarPosVenda, janelaInicioPosVenda, posVendaNaJanela } from "@/lib/posVendaRSRegras";

export const dynamic = "force-dynamic";

// ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O OLVER (14/09): pós-venda só dispara pra contratações
// de R&S, e só enquanto a vaga contratada estiver entre as 3 primeiras vagas de R&S já
// abertas por aquele cliente (histórico de "cliente novo" — a partir da 4ª vaga de R&S do
// mesmo cliente, não dispara mais). Ranking calculado por vagas.created_at, não por data de
// contratação — é "a N-ésima vaga que o cliente abriu", não "a N-ésima contratação".
const RANK_MAXIMO_CLIENTE_NOVO = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Datas no fuso de Brasília. O aviso é 7 dias corridos depois do início (mesmo cálculo já usado pra
    // garantia_data_fim) e, se o cron falhou, recupera até 2 dias para trás: data_inicio entre (hoje - 9) e (hoje - 7).
    // pos_venda_notificado_em evita repetir (inclusive se o cron rodar duas vezes no mesmo dia).
    const agora = new Date();
    const { inicioMin, inicioMax, hoje } = janelaInicioPosVenda(agora);

    // candidatos_vagas!vagas: usar sempre o hint de FK explícito
    // (candidatos_vagas_vaga_id_fkey) — a outra FK (reposição de garantia) causa erro de
    // embed ambíguo em runtime (ver CLAUDE.md).
    const { data: rows, error } = await supabase
      .from("candidatos_vagas")
      .select(
        "id, candidato_id, vaga_id, data_inicio, candidatos(nome_completo), " +
          "vagas!candidatos_vagas_vaga_id_fkey(id, titulo, tipo_servico, created_at, cliente_id, clientes(id, nome, responsavel_comercial, unidade_id))"
      )
      .is("pos_venda_notificado_em", null)
      .not("data_inicio", "is", null)
      .gte("data_inicio", inicioMin)
      .lte("data_inicio", inicioMax)
      .in("etapa", ["aprovado_cliente", "contratado"]);

    if (error) {
      console.error("[cron/pos-venda-rs] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let processados = 0;
    let elegiveis = 0;
    let avisados = 0;
    let carimbados = 0;

    for (const row of (rows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const vaga = r.vagas;
      if (!vaga || vaga.tipo_servico !== "recrutamento_selecao") continue;
      if (!posVendaNaJanela(r.data_inicio, agora)) continue;

      processados++;

      const cliente = vaga.clientes;
      if (!cliente?.id) {
        console.error(
          `[cron/pos-venda-rs] candidatos_vagas.id=${r.id} sem cliente vinculado à vaga — marcado sem notificar.`
        );
        await supabase.from("candidatos_vagas").update({ pos_venda_notificado_em: new Date().toISOString() }).eq("id", r.id);
        continue;
      }

      // Rank da vaga entre as vagas de R&S já abertas por esse cliente, por ordem de
      // criação — só as 3 primeiras contam como "cliente novo" pra esse aviso.
      const { data: vagasRSCliente } = await supabase
        .from("vagas")
        .select("id, created_at")
        .eq("cliente_id", cliente.id)
        .eq("tipo_servico", "recrutamento_selecao")
        .order("created_at", { ascending: true });

      const rank = (vagasRSCliente ?? []).findIndex((v) => v.id === vaga.id) + 1;
      if (rank < 1 || rank > RANK_MAXIMO_CLIENTE_NOVO) {
        await supabase.from("candidatos_vagas").update({ pos_venda_notificado_em: new Date().toISOString() }).eq("id", r.id);
        continue;
      }

      elegiveis++;

      // Nunca lança: sino, popup e e-mail seguem Configurações > Avisos (evento pos_venda_rs_7dias).
      const resultado = await avisarPosVendaRS(supabase, {
        candidatoId: r.candidato_id,
        vagaId: r.vaga_id,
        candidatoNome: r.candidatos?.nome_completo,
        vagaTitulo: vaga.titulo,
        clienteNome: cliente.nome,
        responsavelComercial: cliente.responsavel_comercial,
        unidadeId: cliente.unidade_id ?? null,
        dataInicio: r.data_inicio as string,
      });

      if (resultado.sino === "enviado" || resultado.email === "enviado") avisados++;

      if (!deveCarimbarPosVenda([resultado.sino, resultado.email])) {
        // Havia canal ligado e nada foi entregue (falha ou sem destinatário): sem carimbo, a próxima execução tenta de novo (até 2 dias).
        console.error(
          `[cron/pos-venda-rs] Aviso NÃO entregue para candidato_vaga_id=${r.id} (sino=${resultado.sino}, e-mail=${resultado.email}) — sem carimbo, tenta de novo na próxima execução.`
        );
        continue;
      }

      const { error: erroCarimbo } = await supabase
        .from("candidatos_vagas")
        .update({ pos_venda_notificado_em: new Date().toISOString() })
        .eq("id", r.id)
        .is("pos_venda_notificado_em", null);
      if (erroCarimbo) {
        console.error(`[cron/pos-venda-rs] Erro ao gravar o carimbo (candidatos_vagas.id=${r.id}):`, erroCarimbo.message);
      } else {
        carimbados++;
      }
    }

    return NextResponse.json({ hoje, processados, elegiveis, avisados, carimbados });
  } catch (err) {
    console.error("[GET /api/cron/pos-venda-rs]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
