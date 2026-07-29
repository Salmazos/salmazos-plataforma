import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { formatarDataSemFuso } from "@/lib/utils";

// ASO PERIÓDICO (admissional/renovação a cada 12 meses, funcionário ativo) — nada aqui
// lê, escreve ou referencia `rescisoes`/`aso_documento_path` (ASO demissional), que é um
// sistema completamente separado.
export type MomentoAvisoAso = "sem_registro" | "vencendo" | "atrasado";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vagas.salmazos.com.br";

function conteudo(momento: MomentoAvisoAso, nome: string, empresa: string, dataVencimento: string | null) {
  const vencimentoFormatado = dataVencimento ? formatarDataSemFuso(dataVencimento) : null;
  switch (momento) {
    case "sem_registro":
      return {
        titulo: "ASO periódico sem registro",
        mensagem: `${nome} (${empresa}) está ativo mas nunca teve um ASO periódico registrado.`,
        assuntoEmail: `⚠️ ASO periódico sem registro — ${nome}`,
        corDestaque: "#5B21B6",
        tituloEmail: "⚠️ ASO periódico sem registro",
      };
    case "vencendo":
      return {
        titulo: "ASO periódico vencendo",
        mensagem: `O ASO periódico de ${nome} (${empresa}) vence em ${vencimentoFormatado}.`,
        assuntoEmail: `⏰ ASO periódico vencendo em breve — ${nome}`,
        corDestaque: "#B45309",
        tituloEmail: "⏰ ASO periódico vencendo em breve",
      };
    case "atrasado":
      return {
        titulo: "ASO periódico em atraso",
        mensagem: `O ASO periódico de ${nome} (${empresa}) venceu em ${vencimentoFormatado} e ainda não foi renovado.`,
        assuntoEmail: `🚨 ASO periódico em atraso — ${nome}`,
        corDestaque: "#991B1B",
        tituloEmail: "🚨 ASO periódico em atraso",
      };
  }
}

function montarHtmlEmail(
  tituloEmail: string,
  corDestaque: string,
  nome: string,
  empresa: string,
  dataVencimento: string | null,
  funcionarioId: string
): string {
  const vencimentoFormatado = dataVencimento ? formatarDataSemFuso(dataVencimento) : "—";
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
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vencimento do ASO periódico</td><td style="padding:6px 0;color:${corDestaque};font-weight:700">${vencimentoFormatado}</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/painel/funcionarios/${funcionarioId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver funcionário</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Aviso automático de ASO periódico</p>
  </div>
</div>
</body></html>`;
}

export interface ResultadoAvisoAso {
  // Mesmo critério "tudo ou nada" de dispararAvisosRescisao — o cron marca a idempotência
  // só se sucesso === true.
  sucesso: boolean;
}

export async function dispararAvisoAsoPeriodico(
  funcionarioId: string,
  momento: MomentoAvisoAso,
  dataVencimento: string | null
): Promise<ResultadoAvisoAso> {
  try {
    const svc = createServiceClient();

    const { data: funcionario, error: funcionarioError } = await svc
      .from("funcionarios")
      .select("nome_completo, empresa, clientes(nome)")
      .eq("id", funcionarioId)
      .single();

    if (funcionarioError || !funcionario) {
      console.error(`[dispararAvisoAsoPeriodico] Funcionário não encontrado (id=${funcionarioId}):`, funcionarioError?.message);
      return { sucesso: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empresaNome = (funcionario.clientes as any)?.nome ?? funcionario.empresa ?? "—";
    const { titulo, mensagem, assuntoEmail, corDestaque, tituloEmail } = conteudo(
      momento,
      funcionario.nome_completo,
      empresaNome,
      dataVencimento
    );

    const [{ data: emailDestinatarios, error: emailDestError }, { data: plataformaDestinatarios, error: plataformaDestError }] =
      await Promise.all([
        svc.from("funcionario_aso_avisos_email_destinatarios").select("id, nome, email").eq("ativo", true),
        svc.from("funcionario_aso_avisos_plataforma_destinatarios").select("usuario_id"),
      ]);

    if (emailDestError || plataformaDestError) {
      console.error(
        `[dispararAvisoAsoPeriodico] Erro ao buscar configuração global de destinatários (funcionario_id=${funcionarioId}):`,
        emailDestError?.message ?? plataformaDestError?.message
      );
      return { sucesso: false };
    }

    let algumEmailFalhou = false;

    // ── Canal 1: e-mail ──────────────────────────────────────────────────────
    if (emailDestinatarios && emailDestinatarios.length > 0) {
      const html = montarHtmlEmail(tituloEmail, corDestaque, funcionario.nome_completo, empresaNome, dataVencimento, funcionarioId);

      const resultados = await Promise.all(
        emailDestinatarios.map((d) =>
          sendEmail({ to: d.email, subject: assuntoEmail, html, tipo: `aso_periodico_${momento}` }).then((r) => ({ email: d.email, ...r }))
        )
      );
      for (const r of resultados) {
        if (!r.success) {
          console.error(`[dispararAvisoAsoPeriodico] E-mail não enviado (funcionario_id=${funcionarioId}, destinatario=${r.email}):`, r.error);
          algumEmailFalhou = true;
        }
      }
    }

    let plataformaFalhou = false;

    // ── Canal 2 e 3: sino + popup (mesma linha em notificacoes_analista alimenta os dois) ──
    if (plataformaDestinatarios && plataformaDestinatarios.length > 0) {
      const rows = plataformaDestinatarios.map((d) => ({
        tipo: `aso_periodico_${momento}`,
        titulo,
        mensagem,
        user_id: d.usuario_id,
        candidato_id: null,
        funcionario_id: funcionarioId,
      }));
      const { error: insertError } = await svc.from("notificacoes_analista").insert(rows);
      if (insertError) {
        console.error(`[dispararAvisoAsoPeriodico] Erro ao criar notificações de plataforma (funcionario_id=${funcionarioId}):`, insertError.message);
        plataformaFalhou = true;
      }
    }

    return { sucesso: !algumEmailFalhou && !plataformaFalhou };
  } catch (err) {
    console.error(`[dispararAvisoAsoPeriodico] Falha inesperada (funcionario_id=${funcionarioId}, momento=${momento}):`, err);
    return { sucesso: false };
  }
}
