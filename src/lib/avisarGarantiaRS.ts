import { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { buscarPerfilResponsavel } from "@/lib/perfilResponsavel";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { sendEmail } from "@/lib/sendEmail";
import { escaparHtml } from "@/lib/emailPacoteContabilidade";
import { userIdsDestinoDecisao } from "@/lib/decisaoClienteCandidato";
import {
  EVENTO_POR_GARANTIA,
  TIPO_NOTIFICACAO_POR_GARANTIA,
  dataBrasilia,
  formatarDataBR,
  textoAvisoGarantiaAcionada,
  textoAvisoGarantiaVencendo,
  textosEmailGarantiaVencendo,
  type EventoGarantia,
  type ResultadoCanalGarantia,
} from "@/lib/garantiaRS";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Domínio de produção fixo nos links dos e-mails.
const SITE_URL = "https://vagas.salmazos.com.br";

export interface DadosAvisoGarantia {
  evento: EventoGarantia;
  candidatoId: string;
  // Vaga da candidatura (a ORIGINAL, também na garantia acionada): vai só para o log de e-mail.
  vagaId?: string | null;
  candidatoNome?: string | null;
  vagaTitulo?: string | null;
  clienteNome?: string | null;
  // candidatos.responsavel (nome completo): recebe o sino e o popup, sempre que o sino está ligado.
  responsavelNome?: string | null;
  unidadeId?: string | null;
  // vencendo: data de vencimento da garantia (AAAA-MM-DD).
  dataFim?: string | null;
  // acionada: vaga de reposição criada (link do e-mail).
  novaVagaId?: string | null;
}

export interface ResultadoAvisoGarantia {
  sino: ResultadoCanalGarantia;
  email: ResultadoCanalGarantia;
}

// Avisos internos da garantia R&S (Configurações > Avisos > Vagas). Roda DEPOIS da ação principal (o cron já
// escolheu o candidato; a rota já acionou a garantia) e NUNCA lança: cada canal é isolado e a falha de um não
// impede o outro. Devolve o resultado de cada canal ("enviado", "desligado" ou "falhou") para o cron decidir
// o carimbo de dedup. O popup não é "enviado": é lido por quem entra no painel, a partir das linhas nominais do sino.
//
//   SINO : o responsável do candidato MAIS a lista do canal sino do evento, uma linha por user_id e sem repetir;
//          sem os dois, a linha geral da unidade (user_id nulo), como sempre foi. Sem linha de canal ou erro de
//          leitura = ligado; só ativo = false desliga tudo.
//   E-MAIL: sem lista (ou com falha ao ler a configuração) = comportamento de sempre (notifyAllAnalysts; o
//          vencimento exclui diretoria e superuser). Com lista no canal e-mail do evento = só a lista. Desligado
//          = ninguém.
export async function avisarGarantiaRS(svc: ServiceClient, o: DadosAvisoGarantia): Promise<ResultadoAvisoGarantia> {
  const [sino, email] = await Promise.all([
    gravarSino(svc, o).catch((err): ResultadoCanalGarantia => {
      console.error(`[avisarGarantiaRS] Falha no sino (evento="${EVENTO_POR_GARANTIA[o.evento]}", candidato_id=${o.candidatoId}):`, err);
      return "falhou";
    }),
    enviarEmail(svc, o).catch((err): ResultadoCanalGarantia => {
      console.error(`[avisarGarantiaRS] Falha no e-mail (evento="${EVENTO_POR_GARANTIA[o.evento]}", candidato_id=${o.candidatoId}):`, err);
      return "falhou";
    }),
  ]);
  return { sino, email };
}

function textoSino(o: DadosAvisoGarantia): { titulo: string; mensagem: string } {
  return o.evento === "vencendo"
    ? textoAvisoGarantiaVencendo({ candidato: o.candidatoNome, vagaTitulo: o.vagaTitulo, cliente: o.clienteNome, dataFim: o.dataFim ?? "" })
    : textoAvisoGarantiaAcionada({ candidato: o.candidatoNome, vagaTitulo: o.vagaTitulo, cliente: o.clienteNome });
}

async function gravarSino(svc: ServiceClient, o: DadosAvisoGarantia): Promise<ResultadoCanalGarantia> {
  const evento = EVENTO_POR_GARANTIA[o.evento];
  const lista = await resolverDestinatarios(evento, "sino", undefined, svc);
  if (lista.modo === "desligado") return "desligado";
  const userIdsLista = lista.modo === "configurado" && !lista.falhou ? lista.userIds : [];

  let responsavelUserId: string | null = null;
  if (o.responsavelNome) {
    try {
      responsavelUserId = (await buscarPerfilResponsavel(svc, o.responsavelNome))?.user_id ?? null;
    } catch (err) {
      console.error("[avisarGarantiaRS] Erro ao resolver o responsável (segue sem ele):", err);
    }
  }

  const userIds = userIdsDestinoDecisao(responsavelUserId, userIdsLista);
  const { titulo, mensagem } = textoSino(o);
  const base = {
    tipo: TIPO_NOTIFICACAO_POR_GARANTIA[o.evento],
    titulo,
    mensagem,
    candidato_id: o.candidatoId,
    // Só pesa na linha geral: vai para a equipe da unidade da vaga.
    unidade_id: o.unidadeId ?? null,
  };
  const rows = userIds.length > 0 ? userIds.map((user_id) => ({ ...base, user_id })) : [{ ...base, user_id: null as string | null }];
  const { error } = await svc.from("notificacoes_analista").insert(rows);
  if (error) throw new Error(error.message);
  return "enviado";
}

function montarEmail(o: DadosAvisoGarantia): { subject: string; html: string } {
  const candidato = o.candidatoNome?.trim() || "Candidato";
  const vaga = o.vagaTitulo?.trim() || "Vaga";
  const cliente = o.clienteNome?.trim() || "Cliente";

  if (o.evento === "vencendo") {
    const dataFim = o.dataFim ?? "";
    const garantiaFmt = formatarDataBR(dataFim);
    const t = textosEmailGarantiaVencendo({ candidato, cliente, dataFim, hojeISO: dataBrasilia() });
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">${t.titulo}</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:#FEE2E2;border:1px solid #DC262640;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0;color:#DC2626;font-size:14px;font-weight:700">${t.destaque}</p>
      <p style="margin:4px 0 0;color:#DC2626;font-size:13px">Vencimento: <strong>${garantiaFmt}</strong></p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${escaparHtml(candidato)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga</td><td style="padding:6px 0;color:#111827">${escaparHtml(vaga)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${escaparHtml(cliente)}</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/painel/candidato/${o.candidatoId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil do candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Alerta automático de garantia</p>
  </div>
</div>
</body></html>`;
    return { subject: t.assunto, html };
  }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">🔄 Garantia R&S Acionada</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0;color:#C2410C;font-size:14px;font-weight:700">Reposição gratuita iniciada</p>
      <p style="margin:4px 0 0;color:#C2410C;font-size:13px">Uma nova vaga foi criada automaticamente.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato anterior</td><td style="padding:6px 0;color:#111827">${escaparHtml(candidato)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga original</td><td style="padding:6px 0;color:#111827">${escaparHtml(vaga)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${escaparHtml(cliente)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Data acionamento</td><td style="padding:6px 0;color:#111827">${new Date().toLocaleDateString("pt-BR")}</td></tr>
    </table>
    ${o.novaVagaId ? `<div style="text-align:center"><a href="${SITE_URL}/painel/vagas/${o.novaVagaId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver nova vaga</a></div>` : ""}
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Notificação automática</p>
  </div>
</div>
</body></html>`;
  return { subject: `🔄 Garantia R&S Acionada — ${candidato} — ${cliente}`, html };
}

async function enviarEmail(svc: ServiceClient, o: DadosAvisoGarantia): Promise<ResultadoCanalGarantia> {
  const evento = EVENTO_POR_GARANTIA[o.evento];
  const tipo = TIPO_NOTIFICACAO_POR_GARANTIA[o.evento];
  // Com unidade (mesmo nula): só analistas ativos que atendem a unidade, como os demais avisos de vagas.
  const r = await resolverDestinatarios(evento, "email", o.unidadeId ?? null, svc);
  if (r.modo === "desligado") return "desligado";

  const { subject, html } = montarEmail(o);

  if (r.modo === "configurado" && !r.falhou) {
    const destinos = r.emails.map((d) => d.email).filter(Boolean);
    // Lista configurada, mas ninguém dela passou no filtro de unidade/ativo: não há a quem enviar.
    if (destinos.length === 0) return "desligado";
    const resultados = await Promise.all(
      destinos.map((to) => sendEmail({ to, subject, html, tipo, candidato_id: o.candidatoId, vaga_id: o.vagaId ?? undefined }))
    );
    const falhas = resultados.filter((x) => !x.success).length;
    if (falhas > 0) console.error(`[avisarGarantiaRS] ${falhas}/${resultados.length} e-mail(s) falharam (evento="${evento}").`);
    return resultados.some((x) => x.success) ? "enviado" : "falhou";
  }

  // Sem lista, ou sem conseguir ler a configuração: o comportamento de sempre.
  const res = await notifyAllAnalysts({
    subject,
    html,
    tipo,
    candidato_id: o.candidatoId,
    vaga_id: o.vagaId ?? undefined,
    unidadeId: o.unidadeId ?? null,
    // E-mail do vencimento não vai para diretoria/superuser (pedido do Ölver, 14/09). A garantia acionada vai para todos.
    ...(o.evento === "vencendo" ? { excluirNiveisAcesso: ["diretoria", "superuser"] } : {}),
  });
  return res.succeeded > 0 ? "enviado" : "falhou";
}
