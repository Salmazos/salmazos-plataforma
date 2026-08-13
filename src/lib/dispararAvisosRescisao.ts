import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { RESCISAO_MODALIDADE_LABEL } from "@/lib/rescisaoModalidade";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type MomentoAvisoRescisao = "lancamento" | "vencimento_rescisao" | "vencimento_guia";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vagas.salmazos.com.br";

function moeda(v: number | null | undefined): string {
  return v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function conteudo(momento: MomentoAvisoRescisao, nome: string, empresa: string, valor: number | null) {
  switch (momento) {
    case "lancamento":
      return {
        titulo: "Rescisão lançada",
        mensagem: `Rescisão lançada para ${nome} (${empresa}).`,
        assuntoEmail: `Rescisão lançada — ${nome}`,
        corDestaque: "#1D4ED8",
        tituloEmail: "📋 Rescisão lançada",
      };
    case "vencimento_rescisao":
      return {
        titulo: "Pagamento de rescisão vence hoje",
        mensagem: `O pagamento da rescisão de ${nome} (${empresa}) vence hoje — valor ${moeda(valor)}.`,
        assuntoEmail: `⏰ Pagamento de rescisão vence hoje — ${nome}`,
        corDestaque: "#B45309",
        tituloEmail: "⏰ Pagamento de rescisão vence hoje",
      };
    case "vencimento_guia":
      return {
        titulo: "Pagamento de guia vence hoje",
        mensagem: `O pagamento da guia da rescisão de ${nome} (${empresa}) vence hoje.`,
        assuntoEmail: `⏰ Pagamento de guia vence hoje — ${nome}`,
        corDestaque: "#B45309",
        tituloEmail: "⏰ Pagamento de guia vence hoje",
      };
  }
}

function formatarData(iso: string | null | undefined): string {
  return iso ? iso.split("-").reverse().join("/") : "—";
}

interface DadosFinanceirosRescisao {
  valorRescisao: number | null;
  dataPagamentoRescisao: string | null;
  valorGuia: number | null;
  dataPagamentoGuia: string | null;
}

function montarHtmlEmail(
  tituloEmail: string,
  corDestaque: string,
  nome: string,
  empresa: string,
  modalidadeLabel: string,
  financeiro: DadosFinanceirosRescisao,
  rescisaoId: string
): string {
  const { valorRescisao, dataPagamentoRescisao, valorGuia, dataPagamentoGuia } = financeiro;
  const temGuia = valorGuia != null;
  const linhaTotal =
    valorRescisao != null && temGuia
      ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Total</td><td style="padding:6px 0;color:#111827;font-weight:700">${moeda(valorRescisao + (valorGuia ?? 0))}</td></tr>`
      : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">${tituloEmail}</h1>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Funcionário</td><td style="padding:6px 0;color:#111827">${nome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Empresa</td><td style="padding:6px 0;color:#111827">${empresa}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Modalidade</td><td style="padding:6px 0;color:#111827">${modalidadeLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Valor da rescisão</td><td style="padding:6px 0;color:${corDestaque};font-weight:700">${moeda(valorRescisao)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Data de pagamento</td><td style="padding:6px 0;color:#111827">${formatarData(dataPagamentoRescisao)}</td></tr>
      ${temGuia ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Valor da guia</td><td style="padding:6px 0;color:${corDestaque};font-weight:700">${moeda(valorGuia)}</td></tr>` : ""}
      ${temGuia ? `<tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Data de pagamento da guia</td><td style="padding:6px 0;color:#111827">${formatarData(dataPagamentoGuia)}</td></tr>` : ""}
      ${linhaTotal}
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/painel/rescisoes?rescisao=${rescisaoId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver rescisão</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Aviso automático de rescisão</p>
  </div>
</div>
</body></html>`;
}

export interface ResultadoAvisoRescisao {
  // true somente se TODO envio tentado (cada e-mail individual + o insert de notificações
  // de plataforma) teve sucesso confirmado — ou se não havia nenhum destinatário
  // configurado (nada foi tentado, então não há o que falhar). Critério "tudo ou nada":
  // um único destinatário de e-mail que falhe já marca o disparo inteiro como não-sucesso,
  // mesmo que os outros 9 tenham recebido — é proposital (ver chamador no cron).
  sucesso: boolean;
}

interface RescisaoParaAviso {
  id: string;
  empresa: string;
  modalidade: string;
  valor_rescisao: number | null;
  data_pagamento_rescisao: string | null;
  valor_guia: number | null;
  data_pagamento_guia: string | null;
  nomeFuncionario: string;
}

async function buscarRescisaoParaAviso(svc: ServiceClient, rescisaoId: string): Promise<RescisaoParaAviso | null> {
  const { data, error } = await svc
    .from("rescisoes")
    .select("id, empresa, modalidade, valor_rescisao, data_pagamento_rescisao, valor_guia, data_pagamento_guia, funcionarios(nome_completo)")
    .eq("id", rescisaoId)
    .single();

  if (error || !data) {
    console.error(`[dispararAvisosRescisao] Rescisão não encontrada (id=${rescisaoId}):`, error?.message);
    return null;
  }

  return {
    id: data.id,
    empresa: data.empresa,
    modalidade: data.modalidade,
    valor_rescisao: data.valor_rescisao,
    data_pagamento_rescisao: data.data_pagamento_rescisao,
    valor_guia: data.valor_guia,
    data_pagamento_guia: data.data_pagamento_guia,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nomeFuncionario: (data.funcionarios as any)?.nome_completo ?? "Funcionário",
  };
}

export interface ResultadoEnvioEmailRescisao {
  sucesso: boolean;
  destinatariosCount: number;
  funcionario: string;
  empresa: string;
  valorRescisao: number | null;
}

// Canal de e-mail isolado (extraído de dispararAvisosRescisao) — usado tanto pelo disparo
// automático abaixo (que depois cuida do sino/popup separadamente) quanto pelo reenvio
// manual (POST /api/rescisoes/[id]/reenviar). O reenvio NUNCA deve chamar
// dispararAvisosRescisao inteiro: isso reinseriria em notificacoes_analista e duplicaria
// sino/popup pra quem já recebeu no disparo original — só esta função é segura de repetir.
export async function enviarEmailRescisao(
  rescisaoId: string,
  momento: MomentoAvisoRescisao,
  supabase?: ServiceClient
): Promise<ResultadoEnvioEmailRescisao | null> {
  const svc = supabase ?? createServiceClient();

  const rescisao = await buscarRescisaoParaAviso(svc, rescisaoId);
  if (!rescisao) return null;

  const { assuntoEmail, corDestaque, tituloEmail } = conteudo(momento, rescisao.nomeFuncionario, rescisao.empresa, rescisao.valor_rescisao);

  const { data: emailDestinatarios, error: emailDestError } = await svc
    .from("rescisao_avisos_email_destinatarios")
    .select("id, nome, email")
    .eq("ativo", true);

  const base = { funcionario: rescisao.nomeFuncionario, empresa: rescisao.empresa, valorRescisao: rescisao.valor_rescisao };

  if (emailDestError) {
    console.error(`[enviarEmailRescisao] Erro ao buscar destinatários de e-mail (rescisao_id=${rescisaoId}):`, emailDestError.message);
    return { ...base, sucesso: false, destinatariosCount: 0 };
  }

  if (!emailDestinatarios || emailDestinatarios.length === 0) {
    return { ...base, sucesso: true, destinatariosCount: 0 };
  }

  const html = montarHtmlEmail(
    tituloEmail,
    corDestaque,
    rescisao.nomeFuncionario,
    rescisao.empresa,
    RESCISAO_MODALIDADE_LABEL[rescisao.modalidade] ?? rescisao.modalidade,
    {
      valorRescisao: rescisao.valor_rescisao,
      dataPagamentoRescisao: rescisao.data_pagamento_rescisao,
      valorGuia: rescisao.valor_guia,
      dataPagamentoGuia: rescisao.data_pagamento_guia,
    },
    rescisaoId
  );

  const resultados = await Promise.all(
    emailDestinatarios.map((d) =>
      sendEmail({ to: d.email, subject: assuntoEmail, html, tipo: `rescisao_${momento}` }).then((r) => ({ email: d.email, ...r }))
    )
  );

  let algumEmailFalhou = false;
  for (const r of resultados) {
    if (!r.success) {
      console.error(`[enviarEmailRescisao] E-mail não enviado (rescisao_id=${rescisaoId}, destinatario=${r.email}):`, r.error);
      algumEmailFalhou = true;
    }
  }

  return { ...base, sucesso: !algumEmailFalhou, destinatariosCount: emailDestinatarios.length };
}

// Função central chamada nos 3 momentos possíveis de uma rescisão (lançamento, vencimento
// da rescisão, vencimento da guia) — sempre os mesmos 3 canais (e-mail, sino, popup de
// login), para as mesmas 2 listas de destinatários escolhidas no lançamento. O popup não
// tem lógica própria aqui: ele deriva do que foi inserido em notificacoes_analista (ver
// /api/rescisoes/avisos-hoje), então só precisamos gerar o e-mail e o sino.
//
// Nunca lança exceção — cada falha (busca de destinatário, envio de e-mail, insert de
// notificação) é isolada e logada, sem interromper as demais. O chamador de lançamento
// (POST /api/rescisoes) ignora o retorno (síncrono, anti-void, nunca bloqueia a resposta
// da criação da rescisão). O chamador de vencimento (cron) usa `sucesso` pra decidir se
// marca a idempotência — ver comentário em cron/rescisao-avisos/route.ts sobre por que essa
// ordem (disparar primeiro, marcar depois) é a certa aqui.
export async function dispararAvisosRescisao(rescisaoId: string, momento: MomentoAvisoRescisao): Promise<ResultadoAvisoRescisao> {
  try {
    const svc = createServiceClient();

    // ── Canal 1: e-mail ──────────────────────────────────────────────────────
    const resultadoEmail = await enviarEmailRescisao(rescisaoId, momento, svc);
    if (!resultadoEmail) return { sucesso: false };

    const { titulo, mensagem } = conteudo(momento, resultadoEmail.funcionario, resultadoEmail.empresa, resultadoEmail.valorRescisao);

    // ── Canal 2 e 3: sino + popup (mesma linha em notificacoes_analista alimenta os dois — ver /api/rescisoes/avisos-hoje) ──
    // Fase 3.1 — destinatários deixaram de ser por-rescisão: agora é configuração global
    // (ver /painel/rescisoes-avisos-config), a mesma lista pros 3 momentos de toda rescisão.
    const { data: plataformaDestinatarios, error: plataformaDestError } = await svc
      .from("rescisao_avisos_plataforma_destinatarios")
      .select("usuario_id");

    if (plataformaDestError) {
      console.error(
        `[dispararAvisosRescisao] Erro ao buscar destinatários de plataforma (rescisao_id=${rescisaoId}):`,
        plataformaDestError.message
      );
      return { sucesso: false };
    }

    let plataformaFalhou = false;
    if (plataformaDestinatarios && plataformaDestinatarios.length > 0) {
      const rows = plataformaDestinatarios.map((d) => ({
        tipo: `rescisao_${momento}`,
        titulo,
        mensagem,
        user_id: d.usuario_id,
        candidato_id: null,
        rescisao_id: rescisaoId,
      }));
      const { error: insertError } = await svc.from("notificacoes_analista").insert(rows);
      if (insertError) {
        console.error(`[dispararAvisosRescisao] Erro ao criar notificações de plataforma (rescisao_id=${rescisaoId}):`, insertError.message);
        plataformaFalhou = true;
      }
    }

    return { sucesso: resultadoEmail.sucesso && !plataformaFalhou };
  } catch (err) {
    console.error(`[dispararAvisosRescisao] Falha inesperada (rescisao_id=${rescisaoId}, momento=${momento}):`, err);
    return { sucesso: false };
  }
}
