import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import { envolucroAniversario } from "@/lib/emailAniversarioTemplate";

export const dynamic = "force-dynamic";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface Contato {
  id: string;
  nome_contato: string;
  cargo: string | null;
  data_nascimento: string;
  email: string | null;
  telefone: string | null;
  empresa_nome: string | null;
  clientes: { id: string; nome: string } | null;
}

function empresaDe(c: Contato) {
  return c.clientes?.nome ?? c.empresa_nome ?? "—";
}

// data_nascimento vem como "YYYY-MM-DD" (coluna date) — parse por string pra não
// sofrer o shift de timezone que `new Date(iso)` causaria.
function parseMesDia(iso: string) {
  const [, mesStr, diaStr] = iso.split("-");
  return { mes: Number(mesStr), dia: Number(diaStr) }; // mes: 1-12
}

function diasEntre(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Override de data só pra teste manual — exige NODE_ENV !== "production" (fica
    // automaticamente inerte em prod, mesmo que alguém descubra a URL) E o mesmo
    // Bearer CRON_SECRET checado acima (não abre nenhuma brecha nova).
    let hoje: Date;
    if (process.env.NODE_ENV !== "production") {
      const { searchParams } = new URL(request.url);
      const dataTeste = searchParams.get("data_teste");
      if (dataTeste && /^\d{4}-\d{2}-\d{2}$/.test(dataTeste)) {
        const [ano, mes, dia] = dataTeste.split("-").map(Number);
        hoje = new Date(ano, mes - 1, dia);
      } else {
        hoje = obterDataHojeBrasil();
      }
    } else {
      hoje = obterDataHojeBrasil();
    }
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth(); // 0-11
    const diaAtual = hoje.getDate();

    const { data: contatosRaw, error: errContatos } = await supabase
      .from("aniversariantes_contatos")
      .select("id, nome_contato, cargo, data_nascimento, email, telefone, empresa_nome, clientes(id, nome)")
      .eq("ativo", true);

    if (errContatos) {
      console.error("[cron/aniversarios] Query error:", errContatos.message);
      return NextResponse.json({ error: errContatos.message }, { status: 500 });
    }

    const contatos = (contatosRaw ?? []) as unknown as Contato[];

    let mesSeguinteEnviado = false;
    let tresDiasEnviados = 0;
    let noDiaEnviados = 0;

    // Pré-busca os envios já registrados este ano — permite checar "já enviado?" ANTES de
    // disparar o e-mail (preservando a proteção contra reprocessamento em execuções
    // concorrentes do cron), sem precisar gravar o dedup antes de confirmar a tentativa
    // de envio (que é a causa raiz do bug: dedup gravado mesmo com e-mail nunca enviado).
    const { data: enviosExistentes, error: errEnvios } = await supabase
      .from("aniversario_notificacoes_enviadas")
      .select("tipo, mes_referencia, contato_id")
      .eq("ano", anoAtual);

    if (errEnvios) {
      console.error("[cron/aniversarios] Erro ao buscar notificações já enviadas:", errEnvios.message);
    }

    const jaEnviouMesSeguinte = (mesReferencia: number) =>
      (enviosExistentes ?? []).some((e) => e.tipo === "mes_seguinte" && e.mes_referencia === mesReferencia);

    const jaEnviouIndividual = (contatoId: string, tipo: "tres_dias_antes" | "no_dia") =>
      (enviosExistentes ?? []).some((e) => e.tipo === tipo && e.contato_id === contatoId);

    // --- Tipo 1: mes_seguinte (lembrete em lote, 3 dias antes do fim do mês) ---
    const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    if (diaAtual === ultimoDiaMes - 3) {
      const mesReferencia = ((mesAtual + 1) % 12) + 1;
      const aniversariantesDoMes = contatos
        .filter((c) => parseMesDia(c.data_nascimento).mes === mesReferencia)
        .sort((a, b) => parseMesDia(a.data_nascimento).dia - parseMesDia(b.data_nascimento).dia);

      if (aniversariantesDoMes.length > 0 && !jaEnviouMesSeguinte(mesReferencia)) {
        const nomeMes = MESES[mesReferencia - 1];
        const linhas = aniversariantesDoMes
          .map((c) => {
            const { dia } = parseMesDia(c.data_nascimento);
            return `<tr><td style="padding:6px 0;color:#111827;font-weight:600">${dia.toString().padStart(2, "0")}</td><td style="padding:6px 0;color:#111827">${c.nome_contato}</td><td style="padding:6px 0;color:#6B7280">${empresaDe(c)}</td></tr>`;
          })
          .join("");

        const html = envolucroAniversario(
          `🎂 Aniversariantes de ${nomeMes}`,
          `<p style="margin:0 0 16px;color:#374151;font-size:14px">Confira quem faz aniversário em <strong>${nomeMes}</strong>:</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr>
              <th style="text-align:left;padding:6px 0;color:#6B7280;font-size:11px;text-transform:uppercase">Dia</th>
              <th style="text-align:left;padding:6px 0;color:#6B7280;font-size:11px;text-transform:uppercase">Nome</th>
              <th style="text-align:left;padding:6px 0;color:#6B7280;font-size:11px;text-transform:uppercase">Empresa</th>
            </tr>
            ${linhas}
          </table>`
        );

        const resultado = await notifyAllAnalysts({
          subject: `🎂 Aniversariantes de ${nomeMes}`,
          html,
          tipo: "aniversario_mes_seguinte",
        });

        if (resultado.attempted > 0) {
          const { error: errInsert } = await supabase
            .from("aniversario_notificacoes_enviadas")
            .insert({ tipo: "mes_seguinte", ano: anoAtual, mes_referencia: mesReferencia });

          if (!errInsert) {
            mesSeguinteEnviado = true;
          } else if (errInsert.code !== "23505") {
            console.error("[cron/aniversarios] Erro ao registrar dedup mes_seguinte:", errInsert.message);
          }
        } else {
          console.error(
            `[cron/aniversarios] mes_seguinte (${nomeMes}) NÃO enviado — nenhuma tentativa de e-mail foi registrada; dedup não gravado.`
          );
        }
      }
    }

    // --- Tipos 2 e 3: por contato individual ---
    for (const c of contatos) {
      const { mes, dia } = parseMesDia(c.data_nascimento);
      const dataFmt = `${dia.toString().padStart(2, "0")}/${mes.toString().padStart(2, "0")}`;
      const empresa = empresaDe(c);

      const candidatoEsteAno = new Date(anoAtual, mes - 1, dia);
      const candidatoProxAno = new Date(anoAtual + 1, mes - 1, dia);
      const faltam3Dias =
        diasEntre(hoje, candidatoEsteAno) === 3 || diasEntre(hoje, candidatoProxAno) === 3;
      const ehHoje = mes === mesAtual + 1 && dia === diaAtual;

      if (faltam3Dias && !jaEnviouIndividual(c.id, "tres_dias_antes")) {
        const html = envolucroAniversario(
          `🎂 Faltam 3 dias!`,
          `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Nome</td><td style="padding:6px 0;color:#111827">${c.nome_contato}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Empresa</td><td style="padding:6px 0;color:#111827">${empresa}</td></tr>
            ${c.cargo ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cargo</td><td style="padding:6px 0;color:#111827">${c.cargo}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Data</td><td style="padding:6px 0;color:#111827">${dataFmt}</td></tr>
          </table>`
        );

        await supabase.from("notificacoes_analista").insert({
          tipo: "aniversario_tres_dias",
          titulo: `🎂 Faltam 3 dias — aniversário de ${c.nome_contato}`,
          mensagem: `${c.nome_contato} (${empresa}) faz aniversário em 3 dias, dia ${dataFmt}.`,
        });

        const resultado = await notifyAllAnalysts({
          subject: `🎂 Faltam 3 dias — aniversário de ${c.nome_contato} (${empresa})`,
          html,
          tipo: "aniversario_tres_dias",
        });

        if (resultado.attempted > 0) {
          const { error: errInsert } = await supabase
            .from("aniversario_notificacoes_enviadas")
            .insert({ contato_id: c.id, tipo: "tres_dias_antes", ano: anoAtual });

          if (!errInsert) {
            tresDiasEnviados++;
          } else if (errInsert.code !== "23505") {
            console.error("[cron/aniversarios] Erro ao registrar dedup tres_dias_antes:", errInsert.message);
          }
        } else {
          console.error(
            `[cron/aniversarios] tres_dias_antes NÃO enviado para ${c.nome_contato} (contato_id=${c.id}) — nenhuma tentativa de e-mail foi registrada; dedup não gravado.`
          );
        }
      }

      if (ehHoje && !jaEnviouIndividual(c.id, "no_dia")) {
        const contatoLinhas = [
          c.email
            ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">E-mail</td><td style="padding:6px 0;color:#111827">${c.email}</td></tr>`
            : "",
          c.telefone
            ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Telefone</td><td style="padding:6px 0;color:#111827">${c.telefone}</td></tr>`
            : "",
        ].join("");

        const html = envolucroAniversario(
          `🎂 Hoje é aniversário de ${c.nome_contato}!`,
          `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Nome</td><td style="padding:6px 0;color:#111827">${c.nome_contato}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Empresa</td><td style="padding:6px 0;color:#111827">${empresa}</td></tr>
            ${c.cargo ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cargo</td><td style="padding:6px 0;color:#111827">${c.cargo}</td></tr>` : ""}
            ${contatoLinhas}
          </table>`
        );

        await supabase.from("notificacoes_analista").insert({
          tipo: "aniversario_no_dia",
          titulo: `🎂 Hoje é aniversário de ${c.nome_contato}!`,
          mensagem: `Hoje é o aniversário de ${c.nome_contato} (${empresa}).`,
        });

        const resultado = await notifyAllAnalysts({
          subject: `🎂 Hoje é aniversário de ${c.nome_contato} (${empresa})!`,
          html,
          tipo: "aniversario_no_dia",
        });

        if (resultado.attempted > 0) {
          const { error: errInsert } = await supabase
            .from("aniversario_notificacoes_enviadas")
            .insert({ contato_id: c.id, tipo: "no_dia", ano: anoAtual });

          if (!errInsert) {
            noDiaEnviados++;
          } else if (errInsert.code !== "23505") {
            console.error("[cron/aniversarios] Erro ao registrar dedup no_dia:", errInsert.message);
          }
        } else {
          console.error(
            `[cron/aniversarios] no_dia NÃO enviado para ${c.nome_contato} (contato_id=${c.id}) — nenhuma tentativa de e-mail foi registrada; dedup não gravado.`
          );
        }
      }
    }

    return NextResponse.json({
      mes_seguinte_enviado: mesSeguinteEnviado,
      tres_dias_enviados: tresDiasEnviados,
      no_dia_enviados: noDiaEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/aniversarios]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
