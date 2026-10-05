import { sendEmail } from "@/lib/sendEmail";

// Envia o MESMO e-mail a cada destinatário, um envio por pessoa (nunca vários endereços no mesmo "to"),
// cada um com a sua linha em email_logs (feita pelo sendEmail). Uma falha não impede os outros e nada aqui
// lança: o e-mail é um efeito extra da ação principal. `aceitos` conta os que o SMTP aceitou (os crons só
// gravam o carimbo de "enviado" quando é pelo menos 1).
export async function enviarEmailAoCliente(
  destinatarios: readonly string[],
  email: { subject: string; html: string; tipo: string; candidato_id?: string; vaga_id?: string },
  contexto: string
): Promise<{ aceitos: number; falhas: number }> {
  const resultados = await Promise.all(
    destinatarios.map(async (to) => {
      try {
        return await sendEmail({ ...email, to });
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
  const aceitos = resultados.filter((r) => r.success).length;
  const falhas = resultados.length - aceitos;
  if (falhas > 0) console.error(`[${contexto}] ${falhas}/${resultados.length} e-mail(s) ao cliente não enviado(s) (tipo=${email.tipo}).`);
  return { aceitos, falhas };
}
