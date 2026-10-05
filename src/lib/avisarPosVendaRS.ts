import { SITE_URL } from "@/lib/siteUrl";
import { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { resolverDestinatariosPosVenda, type DestinatarioPosVenda } from "@/lib/posVendaRS";
import { sendEmail } from "@/lib/sendEmail";
import { escaparHtml } from "@/lib/emailPacoteContabilidade";
import {
  EVENTO_POS_VENDA_RS,
  TIPO_NOTIFICACAO_POS_VENDA_RS,
  textoAvisoPosVendaRS,
  userIdsSinoPosVenda,
  type ResultadoCanalPosVenda,
} from "@/lib/posVendaRSRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;


export interface DadosAvisoPosVenda {
  candidatoId: string;
  vagaId: string;
  candidatoNome?: string | null;
  vagaTitulo?: string | null;
  clienteNome?: string | null;
  // clientes.responsavel_comercial e clientes.unidade_id: definem os destinatários de sempre.
  responsavelComercial?: string | null;
  unidadeId?: string | null;
  // AAAA-MM-DD
  dataInicio: string;
}

export interface ResultadoAvisoPosVenda {
  sino: ResultadoCanalPosVenda;
  email: ResultadoCanalPosVenda;
}

// Avisos internos do pós-venda R&S (Configurações > Avisos > Vagas). Roda DEPOIS de o cron escolher o candidato e NUNCA
// lança: cada canal é isolado e a falha de um não impede o outro. Devolve o resultado de cada canal para o cron decidir
// o carimbo. O popup não é "enviado": é lido por quem entra no painel, a partir das linhas nominais do sino.
//
//   DESTINATÁRIOS DE SEMPRE: o responsável comercial do cliente, ou, sem ele, o time comercial da unidade.
//   SINO  : os de sempre MAIS a lista do canal sino do evento, uma linha por user_id e sem repetir. Sem linha de canal ou
//           erro de leitura = ligado; só ativo = false desliga tudo.
//   E-MAIL: sem lista (ou sem conseguir ler a configuração) = os de sempre, como era. Com lista no canal e-mail = só a
//           lista. Desligado = ninguém.
export async function avisarPosVendaRS(svc: ServiceClient, o: DadosAvisoPosVenda): Promise<ResultadoAvisoPosVenda> {
  const deSempre = lerDeSempre(svc, o);
  deSempre.catch(() => {}); // cada canal trata a falha ao aguardar; isto só evita rejeição "não tratada" enquanto ele não chega lá
  const [sino, email] = await Promise.all([
    gravarSino(svc, o, deSempre).catch((err): ResultadoCanalPosVenda => {
      console.error(`[avisarPosVendaRS] Falha no sino (candidato_id=${o.candidatoId}):`, err);
      return "falhou";
    }),
    enviarEmail(svc, o, deSempre).catch((err): ResultadoCanalPosVenda => {
      console.error(`[avisarPosVendaRS] Falha no e-mail (candidato_id=${o.candidatoId}):`, err);
      return "falhou";
    }),
  ]);
  return { sino, email };
}

// Resolve uma vez só, para os dois canais; um erro aqui derruba os canais que dependem dele (o que cada um trata).
function lerDeSempre(svc: ServiceClient, o: DadosAvisoPosVenda): Promise<DestinatarioPosVenda[]> {
  return resolverDestinatariosPosVenda(o.responsavelComercial, svc, o.unidadeId ?? null);
}

async function gravarSino(svc: ServiceClient, o: DadosAvisoPosVenda, deSempre: Promise<DestinatarioPosVenda[]>): Promise<ResultadoCanalPosVenda> {
  const lista = await resolverDestinatarios(EVENTO_POS_VENDA_RS, "sino", undefined, svc);
  if (lista.modo === "desligado") return "desligado";
  const userIdsLista = lista.modo === "configurado" && !lista.falhou ? lista.userIds : [];

  const userIds = userIdsSinoPosVenda((await deSempre).map((d) => d.user_id), userIdsLista);
  if (userIds.length === 0) return "sem_destinatario";

  const { titulo, mensagem } = textoAvisoPosVendaRS({ candidato: o.candidatoNome, vagaTitulo: o.vagaTitulo, cliente: o.clienteNome, dataInicio: o.dataInicio });
  const rows = userIds.map((user_id) => ({
    tipo: TIPO_NOTIFICACAO_POS_VENDA_RS,
    titulo,
    mensagem,
    user_id,
    candidato_id: o.candidatoId,
    vaga_id: o.vagaId,
  }));
  const { error } = await svc.from("notificacoes_analista").insert(rows);
  if (error) throw new Error(error.message);
  return "enviado";
}

function montarEmail(o: DadosAvisoPosVenda): { subject: string; html: string } {
  const { titulo } = textoAvisoPosVendaRS({ candidato: o.candidatoNome, vagaTitulo: o.vagaTitulo, cliente: o.clienteNome, dataInicio: o.dataInicio });
  const candidato = escaparHtml(o.candidatoNome?.trim() || "Candidato");
  const vaga = escaparHtml(o.vagaTitulo?.trim() || "Vaga");
  const cliente = escaparHtml(o.clienteNome?.trim() || "Cliente");
  const inicio = o.dataInicio.split("-").reverse().join("/");
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">🤝 Hora do pós-venda</h1>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0 0 16px;color:#374151;font-size:14px">${candidato} completou <strong>7 dias</strong> de contratação. É um bom momento pra fazer o contato de pós-venda com o cliente.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${cliente}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga</td><td style="padding:6px 0;color:#111827">${vaga}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${candidato}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Início</td><td style="padding:6px 0;color:#111827">${inicio}</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/painel/candidato/${o.candidatoId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil do candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Alerta automático de pós-venda</p>
  </div>
</div>
</body></html>`;
  return { subject: titulo, html };
}

async function enviarEmail(svc: ServiceClient, o: DadosAvisoPosVenda, deSempre: Promise<DestinatarioPosVenda[]>): Promise<ResultadoCanalPosVenda> {
  const r = await resolverDestinatarios(EVENTO_POS_VENDA_RS, "email", o.unidadeId ?? null, svc);
  if (r.modo === "desligado") return "desligado";

  // Com lista no canal e-mail: só a lista. Sem lista, ou sem conseguir ler a configuração: os destinatários de sempre.
  const destinos: string[] =
    r.modo === "configurado" && !r.falhou
      ? r.emails.map((d) => d.email).filter(Boolean)
      : (await deSempre).map((d) => d.email).filter(Boolean);
  const unicos = [...new Map(destinos.map((e) => [e.toLowerCase(), e])).values()];
  if (unicos.length === 0) return "sem_destinatario";

  const { subject, html } = montarEmail(o);
  const resultados = await Promise.all(
    unicos.map((to) => sendEmail({ to, subject, html, tipo: TIPO_NOTIFICACAO_POS_VENDA_RS, candidato_id: o.candidatoId, vaga_id: o.vagaId }))
  );
  const falhas = resultados.filter((x) => !x.success).length;
  if (falhas > 0) console.error(`[avisarPosVendaRS] ${falhas}/${resultados.length} e-mail(s) falharam (candidato_id=${o.candidatoId}).`);
  return resultados.some((x) => x.success) ? "enviado" : "falhou";
}
