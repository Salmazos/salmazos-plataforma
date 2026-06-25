import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import type { EmailTemplateName } from "@/lib/emailTemplates";
import { parseBody, candidatoEmailSchema } from "@/lib/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(candidatoEmailSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { template } = parsed.data;

  const svc = createServiceClient();
  const { data: candidato, error } = await svc
    .from("candidatos")
    .select("nome_completo, email, cargo_pretendido")
    .eq("id", id)
    .single();

  if (error || !candidato) {
    return NextResponse.json({ error: "Candidato não encontrado." }, { status: 404 });
  }

  if (!candidato.email) {
    return NextResponse.json({ error: "Candidato não possui e-mail cadastrado." }, { status: 400 });
  }

  const { subject, html } = getEmailTemplate(template, {
    nome: candidato.nome_completo,
    cargo: candidato.cargo_pretendido,
  });

  await sendEmail({ to: candidato.email, subject, html, tipo: "notificacao_analista", candidato_id: id });

  return NextResponse.json({ ok: true });
}
