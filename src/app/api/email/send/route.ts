import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { to, subject, html, tipo, candidato_id } = await request.json();

  if (!to || !subject || !html) {
    return NextResponse.json({ error: "Campos obrigatórios: to, subject, html" }, { status: 400 });
  }

  const result = await sendEmail({
    to,
    subject,
    html,
    tipo: tipo || "geral",
    candidato_id: candidato_id || undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
