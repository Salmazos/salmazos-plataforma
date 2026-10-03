import nodemailer from "nodemailer";
import { registrarLogEmail } from "@/lib/emailLogger";

interface SendEmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  tipo?: string;
  candidato_id?: string;
  vaga_id?: string;
  cc?: string;
  attachments?: SendEmailAttachment[];
  // "contabilidade" usa a caixa SMTP própria do envio para a contabilidade, se configurada
  // (SMTP_CONTABILIDADE_*); sem ela, cai no SMTP padrão. Omitido = comportamento de sempre.
  transporte?: "contabilidade";
}

// Caixa dedicada só é usada quando TODAS as variáveis de conexão existem; senão, SMTP padrão.
function configContabilidade() {
  const { SMTP_CONTABILIDADE_HOST: host, SMTP_CONTABILIDADE_PORT: port, SMTP_CONTABILIDADE_SECURE: secure, SMTP_CONTABILIDADE_USER: user, SMTP_CONTABILIDADE_PASS: pass } = process.env;
  if (!host || !port || secure === undefined || !user || !pass) return null;
  return { host, port: Number(port) || 587, secure: secure === "true", user, pass };
}

// Remetente efetivo (só o "From", nunca credencial) — usado também para mostrar na tela.
export function obterRemetente(transporte?: "contabilidade"): string {
  if (transporte === "contabilidade") {
    const c = configContabilidade();
    if (c) return process.env.SMTP_CONTABILIDADE_FROM || `"Salmazos RH" <${c.user}>`;
  }
  return process.env.SMTP_FROM || `"Salmazos RH" <${process.env.SMTP_USER}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
  tipo = "outro",
  candidato_id,
  vaga_id,
  cc,
  attachments,
  transporte,
}: SendEmailOpts): Promise<{ success: boolean; error?: string }> {
  try {
    // Transporter criado sob demanda a cada envio (como já era); o da contabilidade só quando configurado.
    const dedicada = transporte === "contabilidade" ? configContabilidade() : null;
    const transporter = nodemailer.createTransport({
      host: dedicada ? dedicada.host : process.env.SMTP_HOST,
      port: dedicada ? dedicada.port : Number(process.env.SMTP_PORT) || 587,
      secure: dedicada ? dedicada.secure : process.env.SMTP_SECURE === "true",
      auth: {
        user: dedicada ? dedicada.user : process.env.SMTP_USER,
        pass: dedicada ? dedicada.pass : process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const info = await transporter.sendMail({
      from: obterRemetente(transporte),
      to,
      cc,
      subject,
      html,
      attachments,
    });

    // O SMTP pode resolver a promise sem lançar exceção mesmo quando nenhum
    // destinatário foi de fato aceito (ex: "to" aceito mas "cc" rejeitado, ou
    // um relay que só reporta a rejeição na resposta em vez de um erro) — sem
    // checar accepted/rejected aqui, isso vira "enviado" mesmo sem entrega real.
    if (!info.accepted || info.accepted.length === 0) {
      const rejeitados = (info.rejected ?? []).map((r) => (typeof r === "string" ? r : r.address)).join(", ");
      const msg = `SMTP não aceitou nenhum destinatário (rejeitados: ${rejeitados || "desconhecido"}) — resposta: ${info.response ?? "sem resposta"}`;
      console.error("[sendEmail] E-mail rejeitado pelo servidor SMTP:", msg);
      await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "erro", erro_mensagem: msg, candidato_id, vaga_id });
      return { success: false, error: msg };
    }

    await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "enviado", candidato_id, vaga_id });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sendEmail] Falha ao enviar e-mail:", err);
    await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "erro", erro_mensagem: msg, candidato_id, vaga_id });
    return { success: false, error: msg };
  }
}
