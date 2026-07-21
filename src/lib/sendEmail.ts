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
}: SendEmailOpts): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Salmazos RH" <${process.env.SMTP_USER}>`,
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
