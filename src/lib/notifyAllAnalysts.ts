import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";

interface NotifyOpts {
  subject: string;
  html: string;
  tipo: string;
  candidato_id?: string;
  vaga_id?: string;
}

export async function notifyAllAnalysts({ subject, html, tipo, candidato_id, vaga_id }: NotifyOpts) {
  const supabase = createServiceClient();

  const { data: analistas } = await supabase
    .from("analistas_perfil")
    .select("email")
    .eq("ativo", true)
    .not("email", "is", null);

  for (const a of analistas ?? []) {
    if (a.email) {
      void sendEmail({ to: a.email, subject, html, tipo, candidato_id, vaga_id });
    }
  }
}
