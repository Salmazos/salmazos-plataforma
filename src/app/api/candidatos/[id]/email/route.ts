import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import type { EmailTemplateName } from "@/lib/emailTemplates";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { template } = body as { template: EmailTemplateName };

  const TEMPLATES_VALIDOS: EmailTemplateName[] = [
    "entrevista_salmazos",
    "entrevista_cliente",
    "aprovado_cliente",
    "reprovado",
    "solicitar_documentos",
  ];

  if (!TEMPLATES_VALIDOS.includes(template)) {
    return NextResponse.json({ error: "Template inválido." }, { status: 400 });
  }

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

  await sendEmail({ to: candidato.email, subject, html });

  return NextResponse.json({ ok: true });
}
