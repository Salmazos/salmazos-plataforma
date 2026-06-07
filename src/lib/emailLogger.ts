import { createServiceClient } from "@/lib/supabase/server";

interface LogEmailParams {
  destinatario: string;
  assunto?: string;
  tipo: string;
  status: "enviado" | "erro";
  erro_mensagem?: string;
  candidato_id?: string;
  vaga_id?: string;
}

export async function registrarLogEmail({
  destinatario,
  assunto,
  tipo,
  status,
  erro_mensagem,
  candidato_id,
  vaga_id,
}: LogEmailParams) {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("email_logs").insert({
      destinatario,
      assunto: assunto ?? null,
      tipo,
      status,
      erro_mensagem: erro_mensagem ?? null,
      candidato_id: candidato_id ?? null,
      vaga_id: vaga_id ?? null,
    });
    if (error) {
      console.error("[emailLogger] Falha ao registrar log:", error);
    }
  } catch (err) {
    console.error("[emailLogger] Erro inesperado ao registrar log:", err);
  }
}
