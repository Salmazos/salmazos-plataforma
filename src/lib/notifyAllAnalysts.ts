import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";

interface NotifyOpts {
  subject: string;
  html: string;
  tipo: string;
  candidato_id?: string;
  vaga_id?: string;
}

interface NotifyResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

// Precisa ser aguardada pelo chamador até o fim: se o handler retornar a resposta HTTP
// antes disso, a função serverless pode congelar com os envios ainda pendentes — e nem
// sucesso nem erro chegam a ser gravados em email_logs.
export async function notifyAllAnalysts({ subject, html, tipo, candidato_id, vaga_id }: NotifyOpts): Promise<NotifyResult> {
  const supabase = createServiceClient();

  const { data: analistas, error } = await supabase
    .from("analistas_perfil")
    .select("email")
    .eq("ativo", true)
    .not("email", "is", null);

  if (error) {
    console.error(`[notifyAllAnalysts] Erro ao buscar destinatários (tipo="${tipo}"):`, error.message);
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  const destinatarios = (analistas ?? []).map((a) => a.email).filter((email): email is string => !!email);
  if (destinatarios.length === 0) {
    console.error(`[notifyAllAnalysts] Nenhum analista ativo com e-mail cadastrado — notificação (tipo="${tipo}") não foi enviada a ninguém.`);
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  const resultados = await Promise.all(
    destinatarios.map((email) => sendEmail({ to: email, subject, html, tipo, candidato_id, vaga_id }))
  );

  const succeeded = resultados.filter((r) => r.success).length;
  const failed = resultados.length - succeeded;
  if (failed > 0) {
    console.error(`[notifyAllAnalysts] ${failed}/${resultados.length} e-mail(s) falharam para tipo="${tipo}".`);
  }

  return { attempted: resultados.length, succeeded, failed };
}
