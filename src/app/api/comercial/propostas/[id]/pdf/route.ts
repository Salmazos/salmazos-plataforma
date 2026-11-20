import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { carregarProposta, podeVerProposta, snapshotParaPdf } from "@/lib/propostaServico";
import { gerarPdfProposta } from "@/lib/propostaPdf";

// sharp e fs só existem no runtime Node.
export const runtime = "nodejs";

// ?rev=N devolve o PDF daquela revisão (a partir do snapshot gravado); sem rev, a revisão atual — ou, em rascunho, o conteúdo atual.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const proposta = await carregarProposta(svc, id);
  if (!proposta || !podeVerProposta(ctx, proposta)) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  const revParam = request.nextUrl.searchParams.get("rev");
  let revisao: number | null = null;
  if (revParam !== null) {
    revisao = Number(revParam);
    if (!Number.isInteger(revisao) || revisao < 0) return NextResponse.json({ error: "Revisão inválida." }, { status: 400 });
  }

  const snap = await snapshotParaPdf(svc, proposta, revisao);
  if (!snap.ok) return NextResponse.json({ error: snap.error }, { status: snap.status });

  // O PDF do MOT é a etapa 2E: até lá só o R&S gera PDF (nunca um PDF de R&S com dados de MOT).
  if (snap.data.modelo !== "RS") return NextResponse.json({ error: "O PDF deste modelo de proposta ainda não está disponível." }, { status: 409 });
  // A marca TESTE vem da LINHA da proposta (flag fixada na criação), nunca do snapshot: o snapshot das revisões é imutável.
  const bytes = await gerarPdfProposta(snap.data, { teste: proposta.teste === true });
  const nomeArquivo = `proposta-${String(proposta.numero).replace("/", "-")}${snap.data.revisao > 0 ? `-rev${snap.data.revisao}` : ""}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nomeArquivo}"`, "Cache-Control": "private, no-store" },
  });
}
