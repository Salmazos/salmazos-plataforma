import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { executarAvisosFerias } from "@/lib/feriasAvisos";
import { hojeBrasiliaISO } from "@/lib/rescisaoProgramada";

export const dynamic = "force-dynamic";

// Avisos de vencimento de férias (90, 60 e 30 dias antes da data-limite, e o "vencido"), uma vez por dia. Mesma proteção de segredo dos demais crons.
// A regra, a idempotência e as garantias (só marca depois de enviar; sem destinatário nada é enviado nem marcado) estão em src/lib/feriasAvisos.ts.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resumo = await executarAvisosFerias(createServiceClient(), hojeBrasiliaISO());
    // Migração pendente ou erro ao ler: 503 com o motivo (nada foi enviado nem marcado), para o cron aparecer como falha nos registros da Vercel.
    return NextResponse.json(resumo, { status: resumo.erro ? 503 : 200 });
  } catch (err) {
    console.error("[GET /api/cron/ferias-avisos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
