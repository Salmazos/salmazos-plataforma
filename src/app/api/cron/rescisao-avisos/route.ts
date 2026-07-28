import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { dispararAvisosRescisao } from "@/lib/dispararAvisosRescisao";

export const dynamic = "force-dynamic";

// Duas passadas independentes no mesmo cron diário — uma rescisão pode ter as duas datas
// diferentes, ou só uma delas (valor_guia/data_pagamento_guia nulos não geram nenhuma
// linha na segunda passada).
//
// Idempotência: marca ultimo_aviso_..._enviado_em SÓ DEPOIS de confirmar que o disparo teve
// sucesso (mesmo padrão do cron de lembrete-agendamento) — não antes. O cron roda 1x/dia sem
// concorrência, então o risco de duplicar um envio no mesmo dia é baixo; o risco real é o
// oposto — se o disparo falhar (parcial ou totalmente) e a gente já tiver marcado como
// enviado, ninguém é avisado e ninguém tenta de novo amanhã. É exatamente o problema que
// este módulo existe pra evitar (pagamento perdido só notado dias depois), então marcar
// cedo demais é o erro mais caro possível aqui.
//
// Critério de "sucesso" (ver dispararAvisosRescisao.sucesso): tudo ou nada — todo e-mail
// individual tentado precisa ter sido aceito pelo SMTP, e o insert de notificações de
// plataforma precisa ter dado certo. Se qualquer destinatário falhar, o disparo inteiro
// conta como não-sucesso e a rescisão continua elegível pro cron de amanhã tentar de novo —
// mesmo que isso signifique reenviar pra quem já recebeu. Preferimos notificar duas vezes a
// arriscar não notificar nenhuma.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Brasil não observa horário de verão desde 2019, então -03:00 é um offset estável —
    // evita puxar biblioteca de timezone só pra achar o dia de hoje (mesmo raciocínio do
    // cron de lembrete-entrevista-hoje). data_pagamento_rescisao/data_pagamento_guia são
    // colunas `date` puras (sem hora/fuso), então comparar direto com a string YYYY-MM-DD
    // é exato — sem o risco de shift de um dia que já corrigimos em funcionarios.data_admissao.
    const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    let vencimentoRescisaoEnviados = 0;
    let vencimentoRescisaoFalhados = 0;
    let vencimentoGuiaEnviados = 0;
    let vencimentoGuiaFalhados = 0;

    // ── Vencimento da rescisão ───────────────────────────────────────────────
    const { data: vencendoRescisao, error: errRescisao } = await supabase
      .from("rescisoes")
      .select("id")
      .eq("data_pagamento_rescisao", hojeSP)
      .is("ultimo_aviso_vencimento_rescisao_enviado_em", null);

    if (errRescisao) {
      console.error("[cron/rescisao-avisos] Erro ao buscar vencimento de rescisão:", errRescisao.message);
    } else {
      for (const r of vencendoRescisao ?? []) {
        const resultado = await dispararAvisosRescisao(r.id, "vencimento_rescisao");
        if (!resultado.sucesso) {
          vencimentoRescisaoFalhados++;
          console.error(`[cron/rescisao-avisos] Disparo de vencimento não confirmado (rescisao_id=${r.id}) — elegível pro cron de amanhã tentar de novo.`);
          continue;
        }
        const { error: updateErr } = await supabase
          .from("rescisoes")
          .update({ ultimo_aviso_vencimento_rescisao_enviado_em: new Date().toISOString() })
          .eq("id", r.id);
        if (updateErr) {
          console.error(`[cron/rescisao-avisos] Disparo confirmado mas falha ao marcar dedup (rescisao_id=${r.id}):`, updateErr.message);
        } else {
          vencimentoRescisaoEnviados++;
        }
      }
    }

    // ── Vencimento da guia ───────────────────────────────────────────────────
    const { data: vencendoGuia, error: errGuia } = await supabase
      .from("rescisoes")
      .select("id")
      .eq("data_pagamento_guia", hojeSP)
      .is("ultimo_aviso_vencimento_guia_enviado_em", null);

    if (errGuia) {
      console.error("[cron/rescisao-avisos] Erro ao buscar vencimento de guia:", errGuia.message);
    } else {
      for (const r of vencendoGuia ?? []) {
        const resultado = await dispararAvisosRescisao(r.id, "vencimento_guia");
        if (!resultado.sucesso) {
          vencimentoGuiaFalhados++;
          console.error(`[cron/rescisao-avisos] Disparo de guia não confirmado (rescisao_id=${r.id}) — elegível pro cron de amanhã tentar de novo.`);
          continue;
        }
        const { error: updateErr } = await supabase
          .from("rescisoes")
          .update({ ultimo_aviso_vencimento_guia_enviado_em: new Date().toISOString() })
          .eq("id", r.id);
        if (updateErr) {
          console.error(`[cron/rescisao-avisos] Disparo confirmado mas falha ao marcar dedup de guia (rescisao_id=${r.id}):`, updateErr.message);
        } else {
          vencimentoGuiaEnviados++;
        }
      }
    }

    return NextResponse.json({
      vencimento_rescisao_enviados: vencimentoRescisaoEnviados,
      vencimento_rescisao_falhados: vencimentoRescisaoFalhados,
      vencimento_guia_enviados: vencimentoGuiaEnviados,
      vencimento_guia_falhados: vencimentoGuiaFalhados,
    });
  } catch (err) {
    console.error("[GET /api/cron/rescisao-avisos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
