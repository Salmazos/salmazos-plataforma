import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import { escaparHtml } from "@/lib/emailPacoteContabilidade";
import { enviarEmailAniversario, avisarAniversarioIndividual } from "@/lib/avisarAniversario";
import {
  EVENTO_ANIVERSARIO_MES_SEGUINTE,
  EVENTO_ANIVERSARIO_NO_DIA,
  EVENTO_ANIVERSARIO_TRES_DIAS,
  TIPO_ANIVERSARIO_MES_SEGUINTE,
  TIPO_ANIVERSARIO_NO_DIA,
  TIPO_ANIVERSARIO_TRES_DIAS,
  deveCarimbarAviso,
  situacaoAniversario,
  textoAniversarioNoDia,
  textoAniversarioTresDias,
} from "@/lib/avisosRestantesRegras";
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
  // Do cliente vinculado, ou de quem cadastrou quando é só empresa em texto livre (ver
  // api/aniversariantes e migration_sbc_aniversariantes_contatos_unidade.sql).
  unidade_id: string;
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
    const hojeISO = formatarDataISO(hoje);

    const { data: contatosRaw, error: errContatos } = await supabase
      .from("aniversariantes_contatos")
      .select("id, nome_contato, cargo, data_nascimento, email, telefone, empresa_nome, unidade_id, clientes(id, nome)")
      .eq("ativo", true);

    if (errContatos) {
      console.error("[cron/aniversarios] Query error:", errContatos.message);
      return NextResponse.json({ error: errContatos.message }, { status: 500 });
    }

    const contatos = (contatosRaw ?? []) as unknown as Contato[];

    let mesSeguinteEnviado = false;
    let tresDiasEnviados = 0;
    let noDiaEnviados = 0;

    // Pré-busca os envios já registrados (ano passado, atual e próximo: a recuperação de 2 dias e o "faltam 3 dias" podem
    // cruzar a virada do ano) — permite checar "já enviado?" ANTES de avisar, preservando a proteção contra
    // reprocessamento, sem gravar o dedup antes de confirmar a entrega.
    const { data: enviosExistentes, error: errEnvios } = await supabase
      .from("aniversario_notificacoes_enviadas")
      .select("tipo, ano, mes_referencia, contato_id, unidade_id")
      .in("ano", [anoAtual - 1, anoAtual, anoAtual + 1]);

    if (errEnvios) {
      console.error("[cron/aniversarios] Erro ao buscar notificações já enviadas:", errEnvios.message);
    }

    // Lote mensal é um por unidade (antiduplicação por unidade — ver
    // migration_sbc_notificacoes_por_unidade.sql).
    const jaEnviouMesSeguinte = (mesReferencia: number, unidadeId: string) =>
      (enviosExistentes ?? []).some(
        (e) => e.tipo === "mes_seguinte" && e.ano === anoAtual && e.mes_referencia === mesReferencia && e.unidade_id === unidadeId
      );

    // O dedup individual é por contato, tipo e ano da OCORRÊNCIA do aniversário.
    const jaEnviouIndividual = (contatoId: string, tipo: "tres_dias_antes" | "no_dia", anoOcorrencia: number) =>
      (enviosExistentes ?? []).some((e) => e.tipo === tipo && e.contato_id === contatoId && e.ano === anoOcorrencia);

    const registrarDedupIndividual = async (contatoId: string, tipo: "tres_dias_antes" | "no_dia", anoOcorrencia: number) => {
      const { error: errInsert } = await supabase
        .from("aniversario_notificacoes_enviadas")
        .insert({ contato_id: contatoId, tipo, ano: anoOcorrencia });
      if (errInsert && errInsert.code !== "23505") {
        console.error(`[cron/aniversarios] Erro ao registrar dedup ${tipo}:`, errInsert.message);
        return false;
      }
      return !errInsert;
    };

    // --- Tipo 1: mes_seguinte (lembrete em lote, 3 dias antes do fim do mês) ---
    const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    if (diaAtual === ultimoDiaMes - 3) {
      const mesReferencia = ((mesAtual + 1) % 12) + 1;
      const aniversariantesDoMes = contatos
        .filter((c) => parseMesDia(c.data_nascimento).mes === mesReferencia)
        .sort((a, b) => parseMesDia(a.data_nascimento).dia - parseMesDia(b.data_nascimento).dia);

      // Um lote por unidade que tem aniversariante no mês, cada um só com os contatos dela.
      const { data: unidadesRows } = await supabase.from("unidades").select("id, nome");
      const unidades = unidadesRows ?? [];
      const unidadesDoLote = [...new Set(aniversariantesDoMes.map((c) => c.unidade_id))];

      for (const unidadeLoteId of unidadesDoLote) {
        if (jaEnviouMesSeguinte(mesReferencia, unidadeLoteId)) continue;
        const doLote = aniversariantesDoMes.filter((c) => c.unidade_id === unidadeLoteId);
        const sufixoUnidade =
          unidadesDoLote.length > 1 ? ` — ${unidades.find((u) => u.id === unidadeLoteId)?.nome ?? ""}` : "";

        const nomeMes = MESES[mesReferencia - 1];
        const linhas = doLote
          .map((c) => {
            const { dia } = parseMesDia(c.data_nascimento);
            return `<tr><td style="padding:6px 0;color:#111827;font-weight:600">${dia.toString().padStart(2, "0")}</td><td style="padding:6px 0;color:#111827">${escaparHtml(c.nome_contato)}</td><td style="padding:6px 0;color:#6B7280">${escaparHtml(empresaDe(c))}</td></tr>`;
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

        // E-mail (Configurações > Avisos > aniversario_mes_seguinte): sem lista = o de sempre; nunca lança.
        const resultado = await enviarEmailAniversario(supabase, {
          evento: EVENTO_ANIVERSARIO_MES_SEGUINTE,
          tipo: TIPO_ANIVERSARIO_MES_SEGUINTE,
          subject: `🎂 Aniversariantes de ${nomeMes}${sufixoUnidade}`,
          html,
          unidadeId: unidadeLoteId,
          contexto: "cron/aniversarios mes_seguinte",
        });

        if (deveCarimbarAviso([resultado])) {
          const { error: errInsert } = await supabase
            .from("aniversario_notificacoes_enviadas")
            .insert({ tipo: "mes_seguinte", ano: anoAtual, mes_referencia: mesReferencia, unidade_id: unidadeLoteId });

          if (!errInsert) {
            mesSeguinteEnviado = true;
          } else if (errInsert.code !== "23505") {
            console.error("[cron/aniversarios] Erro ao registrar dedup mes_seguinte:", errInsert.message);
          }
        } else {
          console.error(
            `[cron/aniversarios] mes_seguinte (${nomeMes}) NÃO entregue (e-mail=${resultado}) — dedup não gravado, tenta de novo na próxima execução.`
          );
        }
      }
    }

    // --- Tipos 2 e 3: por contato individual (dia exato + recuperação de até 2 dias) ---
    for (const c of contatos) {
      const { mes, dia } = parseMesDia(c.data_nascimento);
      const dataFmt = `${dia.toString().padStart(2, "0")}/${mes.toString().padStart(2, "0")}`;
      const empresa = empresaDe(c);
      const nomeHtml = escaparHtml(c.nome_contato);
      const empresaHtml = escaparHtml(empresa);
      const cargoHtml = c.cargo ? escaparHtml(c.cargo) : null;
      const situacao = situacaoAniversario(c.data_nascimento, hojeISO);

      if (situacao.tresDias && !jaEnviouIndividual(c.id, "tres_dias_antes", situacao.tresDias.ano)) {
        const t = textoAniversarioTresDias({ nome: c.nome_contato, empresa, dataFmt, dias: situacao.tresDias.dias });
        const html = envolucroAniversario(
          t.tituloEmail,
          `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Nome</td><td style="padding:6px 0;color:#111827">${nomeHtml}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Empresa</td><td style="padding:6px 0;color:#111827">${empresaHtml}</td></tr>
            ${cargoHtml ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cargo</td><td style="padding:6px 0;color:#111827">${cargoHtml}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Data</td><td style="padding:6px 0;color:#111827">${dataFmt}</td></tr>
          </table>`
        );

        // Sino + e-mail (Configurações > Avisos > aniversario_tres_dias): o sino só é gravado aqui, depois de
        // confirmado que o dedup ainda não existe, e o dedup grava quando algo foi ENTREGUE. Nunca lança.
        const res = await avisarAniversarioIndividual(supabase, {
          evento: EVENTO_ANIVERSARIO_TRES_DIAS,
          tipo: TIPO_ANIVERSARIO_TRES_DIAS,
          unidadeId: c.unidade_id,
          titulo: t.titulo,
          mensagem: t.mensagem,
          assunto: t.assunto,
          html,
          contexto: "cron/aniversarios tres_dias",
        });

        if (deveCarimbarAviso([res.sino, res.email])) {
          if (await registrarDedupIndividual(c.id, "tres_dias_antes", situacao.tresDias.ano)) tresDiasEnviados++;
        } else {
          console.error(
            `[cron/aniversarios] tres_dias_antes NÃO entregue para ${c.nome_contato} (contato_id=${c.id}; sino=${res.sino}, e-mail=${res.email}) — dedup não gravado, tenta de novo na próxima execução.`
          );
        }
      }

      if (situacao.noDia && !jaEnviouIndividual(c.id, "no_dia", situacao.noDia.ano)) {
        const contatoLinhas = [
          c.email
            ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">E-mail</td><td style="padding:6px 0;color:#111827">${escaparHtml(c.email)}</td></tr>`
            : "",
          c.telefone
            ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Telefone</td><td style="padding:6px 0;color:#111827">${escaparHtml(c.telefone)}</td></tr>`
            : "",
        ].join("");

        const t = textoAniversarioNoDia({ nome: c.nome_contato, empresa, dataFmt, atraso: situacao.noDia.atraso });
        const html = envolucroAniversario(
          t.tituloEmail,
          `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Nome</td><td style="padding:6px 0;color:#111827">${nomeHtml}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Empresa</td><td style="padding:6px 0;color:#111827">${empresaHtml}</td></tr>
            ${cargoHtml ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cargo</td><td style="padding:6px 0;color:#111827">${cargoHtml}</td></tr>` : ""}
            ${contatoLinhas}
          </table>`
        );

        const res = await avisarAniversarioIndividual(supabase, {
          evento: EVENTO_ANIVERSARIO_NO_DIA,
          tipo: TIPO_ANIVERSARIO_NO_DIA,
          unidadeId: c.unidade_id,
          titulo: t.titulo,
          mensagem: t.mensagem,
          assunto: t.assunto,
          html,
          contexto: "cron/aniversarios no_dia",
        });

        if (deveCarimbarAviso([res.sino, res.email])) {
          if (await registrarDedupIndividual(c.id, "no_dia", situacao.noDia.ano)) noDiaEnviados++;
        } else {
          console.error(
            `[cron/aniversarios] no_dia NÃO entregue para ${c.nome_contato} (contato_id=${c.id}; sino=${res.sino}, e-mail=${res.email}) — dedup não gravado, tenta de novo na próxima execução.`
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
