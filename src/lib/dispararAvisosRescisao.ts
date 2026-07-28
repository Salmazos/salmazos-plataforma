import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";

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

function montarHtmlEmail(tituloEmail: string, corDestaque: string, nome: string, empresa: string, valor: number | null, rescisaoId: string): string {
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
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Valor da rescisão</td><td style="padding:6px 0;color:${corDestaque};font-weight:700">${moeda(valor)}</td></tr>
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

    const { data: rescisao, error: rescisaoError } = await svc
      .from("rescisoes")
      .select("id, empresa, valor_rescisao, funcionarios(nome_completo)")
      .eq("id", rescisaoId)
      .single();

    if (rescisaoError || !rescisao) {
      console.error(`[dispararAvisosRescisao] Rescisão não encontrada (id=${rescisaoId}):`, rescisaoError?.message);
      return { sucesso: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nomeFuncionario = (rescisao.funcionarios as any)?.nome_completo ?? "Funcionário";
    const { titulo, mensagem, assuntoEmail, corDestaque, tituloEmail } = conteudo(
      momento,
      nomeFuncionario,
      rescisao.empresa,
      rescisao.valor_rescisao
    );

    // Fase 3.1 — destinatários deixaram de ser por-rescisão: agora é configuração global
    // (ver /painel/rescisoes-avisos-config), a mesma lista pros 3 momentos de toda rescisão.
    const [{ data: emailDestinatarios, error: emailDestError }, { data: plataformaDestinatarios, error: plataformaDestError }] =
      await Promise.all([
        svc.from("rescisao_avisos_email_destinatarios").select("id, nome, email").eq("ativo", true),
        svc.from("rescisao_avisos_plataforma_destinatarios").select("usuario_id"),
      ]);

    if (emailDestError || plataformaDestError) {
      console.error(
        `[dispararAvisosRescisao] Erro ao buscar configuração global de destinatários (rescisao_id=${rescisaoId}):`,
        emailDestError?.message ?? plataformaDestError?.message
      );
      return { sucesso: false };
    }

    let algumEmailFalhou = false;

    // ── Canal 1: e-mail ──────────────────────────────────────────────────────
    // Endereço já vem direto da configuração global (livre, não depende mais de
    // analistas_perfil) — sem a indireção por usuario_id que existia na Fase 3 original.
    if (emailDestinatarios && emailDestinatarios.length > 0) {
      const html = montarHtmlEmail(tituloEmail, corDestaque, nomeFuncionario, rescisao.empresa, rescisao.valor_rescisao, rescisaoId);

      const resultados = await Promise.all(
        emailDestinatarios.map((d) =>
          sendEmail({ to: d.email, subject: assuntoEmail, html, tipo: `rescisao_${momento}` }).then((r) => ({ email: d.email, ...r }))
        )
      );
      for (const r of resultados) {
        if (!r.success) {
          console.error(`[dispararAvisosRescisao] E-mail não enviado (rescisao_id=${rescisaoId}, destinatario=${r.email}):`, r.error);
          algumEmailFalhou = true;
        }
      }
    }

    let plataformaFalhou = false;

    // ── Canal 2 e 3: sino + popup (mesma linha em notificacoes_analista alimenta os dois — ver /api/rescisoes/avisos-hoje) ──
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

    return { sucesso: !algumEmailFalhou && !plataformaFalhou };
  } catch (err) {
    console.error(`[dispararAvisosRescisao] Falha inesperada (rescisao_id=${rescisaoId}, momento=${momento}):`, err);
    return { sucesso: false };
  }
}
