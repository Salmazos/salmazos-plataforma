import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const { to, subject, html, tipo, candidato_id } = await request.json();

  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Campos obrigatórios: to, subject, html" }, { status: 400 });
  }

  try {
    await transporter.sendMail({
      from: '"Salmazos RH" <' + process.env.SMTP_FROM + '>',
      to,
      subject,
      html,
    });

    await svc.from("email_logs").insert({
      destinatario: to,
      assunto: subject,
      tipo: tipo || "geral",
      status: "enviado",
      candidato_id: candidato_id || null,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    await svc.from("email_logs").insert({
      destinatario: to,
      assunto: subject,
      tipo: tipo || "geral",
      status: "erro",
      erro_mensagem: error.message,
      candidato_id: candidato_id || null,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
