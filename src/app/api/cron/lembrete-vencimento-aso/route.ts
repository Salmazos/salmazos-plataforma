import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularStatusAso, calcularDataVencimentoAso } from "@/lib/asoStatus";
import { dispararAvisoAsoPeriodico } from "@/lib/dispararAvisoAsoPeriodico";

export const dynamic = "force-dynamic";

interface AsoRowMaisRecente {
  id: string;
  data_exame: string;
  ultimo_aviso_vencendo_enviado_em: string | null;
  ultimo_aviso_vencido_enviado_em: string | null;
}

// ASO PERIÓDICO (funcionario_asos, funcionários ativos, renovação a cada 12 meses) — nunca
// lê/escreve `rescisoes` nem `aso_documento_path` (ASO demissional, sistema separado).
//
// Idempotência: mesmo critério "tudo ou nada" e "marca só depois de confirmar sucesso" já
// usado em cron/rescisao-avisos — o risco real não é duplicar aviso, é deixar de avisar por
// causa de uma falha parcial já marcada como enviada.
//
// "vencendo" e "atrasado" guardam o controle na PRÓPRIA linha mais recente de
// funcionario_asos (ultimo_aviso_vencendo_enviado_em / ultimo_aviso_vencido_enviado_em) —
// exatamente como valor_rescisao/valor_guia guardam o deles na própria linha de rescisoes.
// Um novo exame registrado é uma linha NOVA, sem esses campos preenchidos ainda, então a
// necessidade de aviso "zera" naturalmente.
//
// "sem_registro" (funcionário ativo que nunca teve nenhuma linha em funcionario_asos) não
// tem onde guardar esse controle — não existe linha nenhuma pra ele. Por isso a tabela
// funcionario_aso_avisos_sem_registro (ver migração) existe só pra este caso: um ledger
// dedicado, fora do fluxo de "linha do funcionario_asos", que só é preenchido nesse cenário
// e nunca mais é consultado assim que o funcionário ganha o 1º exame de verdade (deixa de
// aparecer na consulta de "sem_registro").
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const svc = createServiceClient();

    const { data: funcionariosAtivos, error: errFuncionarios } = await svc
      .from("funcionarios")
      .select("id")
      .eq("status", "ativo");

    if (errFuncionarios) {
      console.error("[cron/lembrete-vencimento-aso] Erro ao buscar funcionários ativos:", errFuncionarios.message);
      return NextResponse.json({ error: errFuncionarios.message }, { status: 500 });
    }

    const idsAtivos = (funcionariosAtivos ?? []).map((f) => f.id);

    let semRegistroEnviados = 0;
    let semRegistroFalhados = 0;
    let vencendoEnviados = 0;
    let vencendoFalhados = 0;
    let atrasadoEnviados = 0;
    let atrasadoFalhados = 0;

    if (idsAtivos.length > 0) {
      const { data: asos, error: errAsos } = await svc
        .from("funcionario_asos")
        .select("id, funcionario_id, data_exame, ultimo_aviso_vencendo_enviado_em, ultimo_aviso_vencido_enviado_em")
        .in("funcionario_id", idsAtivos)
        .is("excluido_em", null)
        .order("data_exame", { ascending: false });

      if (errAsos) {
        console.error("[cron/lembrete-vencimento-aso] Erro ao buscar funcionario_asos:", errAsos.message);
        return NextResponse.json({ error: errAsos.message }, { status: 500 });
      }

      // Já ordenado por data_exame desc — o primeiro encontro de cada funcionario_id é a
      // linha mais recente (mesma técnica já usada na lista de funcionários).
      const asoMaisRecentePorFuncionario = new Map<string, AsoRowMaisRecente>();
      for (const a of asos ?? []) {
        if (!asoMaisRecentePorFuncionario.has(a.funcionario_id)) {
          asoMaisRecentePorFuncionario.set(a.funcionario_id, a);
        }
      }

      // ── "Sem registro" ───────────────────────────────────────────────────────
      const idsSemRegistro = idsAtivos.filter((id) => !asoMaisRecentePorFuncionario.has(id));

      if (idsSemRegistro.length > 0) {
        const { data: jaAvisados, error: errLedger } = await svc
          .from("funcionario_aso_avisos_sem_registro")
          .select("funcionario_id")
          .in("funcionario_id", idsSemRegistro);

        if (errLedger) {
          console.error("[cron/lembrete-vencimento-aso] Erro ao buscar ledger de sem_registro:", errLedger.message);
        } else {
          const jaAvisadosSet = new Set((jaAvisados ?? []).map((r) => r.funcionario_id));
          for (const funcionarioId of idsSemRegistro) {
            if (jaAvisadosSet.has(funcionarioId)) continue;

            const resultado = await dispararAvisoAsoPeriodico(funcionarioId, "sem_registro", null);
            if (!resultado.sucesso) {
              semRegistroFalhados++;
              console.error(`[cron/lembrete-vencimento-aso] Disparo de sem_registro não confirmado (funcionario_id=${funcionarioId}) — tenta de novo amanhã.`);
              continue;
            }
            const { error: upsertErr } = await svc
              .from("funcionario_aso_avisos_sem_registro")
              .upsert({ funcionario_id: funcionarioId, ultimo_aviso_enviado_em: new Date().toISOString() });
            if (upsertErr) {
              console.error(`[cron/lembrete-vencimento-aso] Disparo confirmado mas falha ao marcar ledger (funcionario_id=${funcionarioId}):`, upsertErr.message);
            } else {
              semRegistroEnviados++;
            }
          }
        }
      }

      // ── "Vencendo" e "atrasado" ──────────────────────────────────────────────
      for (const [funcionarioId, aso] of asoMaisRecentePorFuncionario) {
        const status = calcularStatusAso(aso.data_exame);
        if (status !== "vencendo" && status !== "atrasado") continue;

        const colunaControle: "ultimo_aviso_vencendo_enviado_em" | "ultimo_aviso_vencido_enviado_em" =
          status === "vencendo" ? "ultimo_aviso_vencendo_enviado_em" : "ultimo_aviso_vencido_enviado_em";
        if (aso[colunaControle] !== null) continue;

        const dataVencimento = calcularDataVencimentoAso(aso.data_exame);
        const resultado = await dispararAvisoAsoPeriodico(funcionarioId, status, dataVencimento);

        if (!resultado.sucesso) {
          if (status === "vencendo") vencendoFalhados++; else atrasadoFalhados++;
          console.error(`[cron/lembrete-vencimento-aso] Disparo de ${status} não confirmado (funcionario_id=${funcionarioId}) — tenta de novo amanhã.`);
          continue;
        }

        const { error: updateErr } = await svc
          .from("funcionario_asos")
          .update({ [colunaControle]: new Date().toISOString() })
          .eq("id", aso.id);

        if (updateErr) {
          console.error(`[cron/lembrete-vencimento-aso] Disparo confirmado mas falha ao marcar dedup (funcionario_asos.id=${aso.id}):`, updateErr.message);
        } else if (status === "vencendo") {
          vencendoEnviados++;
        } else {
          atrasadoEnviados++;
        }
      }
    }

    return NextResponse.json({
      sem_registro_enviados: semRegistroEnviados,
      sem_registro_falhados: semRegistroFalhados,
      vencendo_enviados: vencendoEnviados,
      vencendo_falhados: vencendoFalhados,
      atrasado_enviados: atrasadoEnviados,
      atrasado_falhados: atrasadoFalhados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-vencimento-aso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
