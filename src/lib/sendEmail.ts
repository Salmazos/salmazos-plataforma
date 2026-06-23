import nodemailer from "nodemailer";
import { registrarLogEmail } from "@/lib/emailLogger";

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  tipo?: string;
  candidato_id?: string;
  vaga_id?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  tipo = "outro",
  candidato_id,
  vaga_id,
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

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Salmazos RH" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "enviado", candidato_id, vaga_id });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sendEmail] Falha ao enviar e-mail:", err);
    await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "erro", erro_mensagem: msg, candidato_id, vaga_id });
    return { success: false, error: msg };
  }
}
