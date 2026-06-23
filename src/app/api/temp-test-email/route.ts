import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export async function GET() {
  try {
    await sendEmail({
      to: "olver@salmazos.com.br",
      subject: "🧪 Teste SMTP — Salmazos Plataforma",
      html: "<h1>Teste de email funcionando!</h1><p>SMTP configurado corretamente.</p>",
      tipo: "teste_smtp",
    });
    return NextResponse.json({ success: true, message: "Email enviado!" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
