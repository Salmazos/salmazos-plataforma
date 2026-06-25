import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { parseBody, emailSendSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(emailSendSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await sendEmail({
    to: parsed.data.to,
    subject: parsed.data.subject,
    html: parsed.data.html,
    tipo: parsed.data.tipo || "geral",
    candidato_id: parsed.data.candidato_id || undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
