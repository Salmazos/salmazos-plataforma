import { NextRequest, NextResponse, after } from "next/server";
import { parseBody, vagaNotificarEncerramentoSchema } from "@/lib/schemas";
import { notificarVagaEncerrada } from "@/lib/notificarVagaEncerrada";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(vagaNotificarEncerramentoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { status } = parsed.data;

  after(async () => {
    await notificarVagaEncerrada(id, status);
  });

  return NextResponse.json({ ok: true });
}
