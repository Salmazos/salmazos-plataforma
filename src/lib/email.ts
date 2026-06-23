import nodemailer from "nodemailer";

interface EmailOpts {
  to: string;
  nomeCandidato: string;
  cargoPretendido: string;
}

interface NotificacaoEquipeOpts {
  nomeCandidato: string;
  cargoPretendido: string;
  vagaTitulo?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
}

function criarTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
}

export async function enviarNotificacaoEquipe({
  nomeCandidato,
  cargoPretendido,
  email,
  telefone,
  cidade,
  estado,
}: NotificacaoEquipeOpts) {
  const destino = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  if (!destino) return;

  const transporter = criarTransporter();
  const localInfo = [cidade, estado].filter(Boolean).join(" – ");

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#111827,#1F2937);padding:28px 32px;text-align:center;">
      <h1 style="color:#FFD700;margin:0;font-size:20px;font-weight:700;">Nova Candidatura Recebida</h1>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
        <tr><td style="padding:8px 0;font-weight:700;width:140px;">Candidato</td><td style="padding:8px 0;">${nomeCandidato}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Vaga / Cargo</td><td style="padding:8px 0;">${cargoPretendido}</td></tr>
        ${email ? `<tr><td style="padding:8px 0;font-weight:700;">E-mail</td><td style="padding:8px 0;">${email}</td></tr>` : ""}
        ${telefone ? `<tr><td style="padding:8px 0;font-weight:700;">Telefone</td><td style="padding:8px 0;">${telefone}</td></tr>` : ""}
        ${localInfo ? `<tr><td style="padding:8px 0;font-weight:700;">Localização</td><td style="padding:8px 0;">${localInfo}</td></tr>` : ""}
      </table>
      <p style="font-size:13px;color:#9CA3AF;margin:20px 0 0;text-align:center;">Acesse o painel para visualizar o perfil completo.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Salmazos RH" <${process.env.SMTP_USER}>`,
    to: destino,
    subject: `📋 Nova candidatura: ${nomeCandidato} → ${cargoPretendido}`,
    html,
  });
}

export async function enviarEmailConfirmacao({
  to,
  nomeCandidato,
  cargoPretendido,
}: EmailOpts) {
  const transporter = criarTransporter();

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#534AB7,#6B62D4);padding:36px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Salmazos RH &amp; Serviços</h1>
      <p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:15px;">Candidatura recebida com sucesso!</p>
    </div>
    <div style="padding:36px 32px;">
      <p style="font-size:16px;color:#111;margin:0 0 12px;">Olá, <strong>${nomeCandidato}</strong>!</p>
      <p style="font-size:15px;color:#555;line-height:1.7;margin:0 0 20px;">
        Recebemos sua candidatura para a vaga de <strong style="color:#534AB7;">${cargoPretendido}</strong>.
        Nossa equipe analisará seu perfil e entrará em contato em breve.
      </p>
      <div style="background:#f5f4ff;border-left:4px solid #534AB7;border-radius:4px;padding:18px 20px;margin:0 0 24px;">
        <p style="margin:0 0 8px;color:#534AB7;font-weight:700;">Próximos passos:</p>
        <ul style="margin:0;padding-left:18px;color:#555;line-height:1.9;font-size:14px;">
          <li>Aguarde nosso contato por e-mail ou telefone</li>
          <li>Verifique sua caixa de spam se não receber notícias em alguns dias</li>
          <li>Mantenha seus dados de contato atualizados</li>
        </ul>
      </div>
      <p style="font-size:13px;color:#999;border-top:1px solid #eee;padding-top:20px;margin:0;">
        Atenciosamente,<br>
        <strong style="color:#534AB7;">Equipe Salmazos RH &amp; Serviços</strong>
      </p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Salmazos RH" <${process.env.SMTP_USER}>`,
    to,
    subject: `✅ Candidatura recebida – ${cargoPretendido} | Salmazos RH`,
    html,
  });
}
