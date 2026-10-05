import { SITE_URL } from "@/lib/siteUrl";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obterDestinatariosSupervisaoAtraso, obterDestinatarioEmailSupervisaoAtraso } from "@/lib/supervisaoAvisos";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { enviarEmailParaLista, gravarSinoConfiguravel, resolverEmailConfiguravel } from "@/lib/avisoConfiguravel";
import {
  EVENTO_SUPERVISAO_ATRASADA,
  TIPO_SUPERVISAO_ATRASADA,
  deveCarimbarAviso,
  textoSupervisaoAtrasada,
  type ResultadoCanalAviso,
} from "@/lib/avisosRestantesRegras";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";


function parseDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const hoje = obterDataHojeBrasil();
    const corte = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: metas, error } = await supabase
      .from("clientes_meta_supervisao")
      .select("id, cliente_id, frequencia_dias, supervisor_responsavel_id, ultimo_aviso_atraso_em, clientes(nome)")
      .or(`ultimo_aviso_atraso_em.is.null,ultimo_aviso_atraso_em.lte.${corte}`);

    if (error) {
      console.error("[cron/lembrete-supervisao-atraso] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metasTyped = (metas ?? []) as any[];
    const clienteIds = metasTyped.map((m) => m.cliente_id);

    const { data: visitasSupervisao } = clienteIds.length > 0
      ? await supabase
          .from("km_visitas")
          .select("cliente_id, km_registros(data)")
          .eq("tipo_visita", "supervisao")
          .in("cliente_id", clienteIds)
      : { data: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visitasTyped = (visitasSupervisao ?? []) as any[];
    const ultimaVisitaPorCliente = new Map<string, string>();
    for (const v of visitasTyped) {
      const data = v.km_registros?.data;
      if (!data || !v.cliente_id) continue;
      const atual = ultimaVisitaPorCliente.get(v.cliente_id);
      if (!atual || data > atual) ultimaVisitaPorCliente.set(v.cliente_id, data);
    }

    let avisosEnviados = 0;
    let processadas = 0;

    for (const m of metasTyped) {
      if (!m.clientes) continue;

      const ultimaData = ultimaVisitaPorCliente.get(m.cliente_id) ?? null;
      const diasDesde = ultimaData ? Math.floor((hoje.getTime() - parseDataLocal(ultimaData).getTime()) / 86400000) : null;
      const atrasado = ultimaData === null || diasDesde! >= m.frequencia_dias;
      if (!atrasado) continue;

      processadas++;
      const clienteNome = (m.clientes as { nome: string }).nome;

      // Dois resolvers separados de propósito (ver comentário em supervisaoAvisos.ts):
      // o sino continua indo pra diretoria/superuser + supervisor responsável, mas o e-mail
      // (decisão de negócio 14/09, alto volume) passa a ir só pro supervisor responsável.
      const destinatariosSino = await obterDestinatariosSupervisaoAtraso(m.supervisor_responsavel_id, supabase);
      const destinatariosEmail = await obterDestinatarioEmailSupervisaoAtraso(m.supervisor_responsavel_id, supabase);

      if (destinatariosEmail.length === 0) {
        console.error(
          `[cron/lembrete-supervisao-atraso] Cliente sem supervisor responsável ativo (meta_id=${m.id}) — e-mail só para a lista configurada, se houver.`
        );
      }

      const template = getEmailTemplate("supervisao_cliente_atrasada", {
        nome: "",
        cargo: "",
        nomeCliente: clienteNome,
        diasSemSupervisao: diasDesde,
        frequenciaDiasSupervisao: m.frequencia_dias,
        supervisaoUrl: `${SITE_URL}/painel/supervisao`,
      });

      // Sino e e-mail seguem Configurações > Avisos (evento supervisao_cliente_atrasada): sino = diretoria/superuser +
      // supervisor + lista; e-mail = o supervisor (ou só a lista, se houver). Cada canal é isolado e nunca lança.
      const [resSino, resEmail] = await Promise.all([
        gravarSinoConfiguravel(supabase, {
          evento: EVENTO_SUPERVISAO_ATRASADA,
          deSempre: destinatariosSino.map((d) => d.user_id),
          linha: {
            tipo: TIPO_SUPERVISAO_ATRASADA,
            ...textoSupervisaoAtrasada({ cliente: clienteNome, dias: diasDesde }),
            extra: { cliente_meta_supervisao_id: m.id },
          },
          geral: "nunca",
        }),
        (async (): Promise<ResultadoCanalAviso> => {
          const destino = await resolverEmailConfiguravel(supabase, EVENTO_SUPERVISAO_ATRASADA);
          if (destino.modo === "desligado") return "desligado";
          const emails = destino.modo === "lista" ? destino.emails : destinatariosEmail.map((d) => d.email);
          return enviarEmailParaLista(emails, { subject: template.subject, html: template.html, tipo: "supervisao_cliente_atrasada" }, `cron/lembrete-supervisao-atraso meta_id=${m.id}`);
        })().catch((): ResultadoCanalAviso => "falhou"),
      ]);

      // Carimba (a cadência de 2 dias) quando algo foi ENTREGUE ou todos os canais estão desligados. Antes o sino era
      // inserido antes do carimbo e se repetia todo dia quando o e-mail falhava; agora um sino entregue já fecha o ciclo.
      if (!deveCarimbarAviso([resSino, resEmail])) {
        console.error(
          `[cron/lembrete-supervisao-atraso] Aviso NÃO entregue (meta_id=${m.id}, sino=${resSino}, e-mail=${resEmail}) — sem carimbo, tenta de novo na próxima execução.`
        );
        continue;
      }

      const { error: updateErr } = await supabase
        .from("clientes_meta_supervisao")
        .update({ ultimo_aviso_atraso_em: new Date().toISOString() })
        .eq("id", m.id);

      if (updateErr) {
        console.error(`[cron/lembrete-supervisao-atraso] Erro ao atualizar ultimo_aviso_atraso_em (meta_id=${m.id}):`, updateErr.message);
      } else {
        avisosEnviados++;
      }
    }

    return NextResponse.json({
      candidatas: metasTyped.length,
      processadas,
      avisos_enviados: avisosEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/lembrete-supervisao-atraso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
