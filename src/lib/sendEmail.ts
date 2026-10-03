import nodemailer from "nodemailer";
import { registrarLogEmail } from "@/lib/emailLogger";
import { interpretarSecureSmtp, mensagemErroCurta } from "@/lib/emailPacoteContabilidade";

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

// Caixa dedicada só é usada quando host, porta, usuário e senha existem (SECURE é opcional: sem ele,
// vale true na porta 465 e false nas demais). Valores levam trim (só espaços das pontas).
function configContabilidade() {
  const env = process.env;
  const host = env.SMTP_CONTABILIDADE_HOST?.trim();
  const portaTxt = env.SMTP_CONTABILIDADE_PORT?.trim();
  const user = env.SMTP_CONTABILIDADE_USER?.trim();
  const pass = env.SMTP_CONTABILIDADE_PASS?.trim();
  if (!host || !portaTxt || !user || !pass) return null;
  const port = Number(portaTxt) || 587;
  return { host, port, secure: interpretarSecureSmtp(env.SMTP_CONTABILIDADE_SECURE, port), user, pass };
}

// Remetente efetivo (só o "From", nunca credencial) — usado também para mostrar na tela.
export function obterRemetente(transporte?: "contabilidade"): string {
  if (transporte === "contabilidade") {
    const c = configContabilidade();
    if (c) return process.env.SMTP_CONTABILIDADE_FROM?.trim() || `"Salmazos RH" <${c.user}>`;
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
}: SendEmailOpts): Promise<{ success: boolean; error?: string; errorCode?: string }> {
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
      // Só a caixa da contabilidade: falha rápido, com erro claro, em vez de esperar os 30s da Vercel.
      ...(dedicada ? { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 } : {}),
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
    const codigo = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : undefined;
    if (transporte === "contabilidade") {
      // Caixa da contabilidade: só código + mensagem curta (com usuário/senha mascarados); nunca o objeto
      // de erro inteiro nem variáveis de ambiente. Este é o único registro da falha em email_logs.
      const curta = mensagemErroCurta(codigo, msg, [process.env.SMTP_CONTABILIDADE_USER, process.env.SMTP_CONTABILIDADE_PASS]);
      console.error("[sendEmail] Falha ao enviar e-mail (contabilidade):", curta);
      await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "erro", erro_mensagem: curta, candidato_id, vaga_id });
      return { success: false, error: curta, errorCode: codigo };
    }
    console.error("[sendEmail] Falha ao enviar e-mail:", err);
    await registrarLogEmail({ destinatario: to, assunto: subject, tipo, status: "erro", erro_mensagem: msg, candidato_id, vaga_id });
    return { success: false, error: msg, errorCode: codigo };
  }
}
