import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { carregarProposta, podeVerProposta, snapshotParaPdf } from "@/lib/propostaServico";
import { gerarPdfProposta } from "@/lib/propostaPdf";
import { gerarPdfPropostaMot } from "@/lib/propostaPdfMot";
import { snapshotMotSchema } from "@/lib/propostaMot";
import { MSG_PDF_TS_INDISPONIVEL } from "@/lib/propostaTs";

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

  // TS: o PDF chega na etapa 2E. Recusa ANTES de montar qualquer snapshot (nada é calculado nem lido do banco além da própria proposta).
  if (proposta.modelo === "TS") return NextResponse.json({ error: MSG_PDF_TS_INDISPONIVEL }, { status: 409 });

  const revParam = request.nextUrl.searchParams.get("rev");
  let revisao: number | null = null;
  if (revParam !== null) {
    revisao = Number(revParam);
    if (!Number.isInteger(revisao) || revisao < 0) return NextResponse.json({ error: "Revisão inválida." }, { status: 400 });
  }

  const snap = await snapshotParaPdf(svc, proposta, revisao);
  if (!snap.ok) return NextResponse.json({ error: snap.error }, { status: snap.status });

  // R&S e MOT geram PDF (cada um do seu snapshot); TS ainda não. Nunca um PDF de um modelo com dados de outro.
  if (snap.data.modelo !== "RS" && snap.data.modelo !== "MOT") return NextResponse.json({ error: "O PDF deste modelo de proposta ainda não está disponível." }, { status: 409 });
  // A marca TESTE vem da LINHA da proposta (flag fixada na criação), nunca do snapshot: o snapshot das revisões é imutável.
  const opcoes = { teste: proposta.teste === true };
  let bytes: Uint8Array;
  let revisaoDoArquivo: number;
  if (snap.data.modelo === "MOT") {
    // O snapshot gravado é conferido antes de virar PDF (uma revisão corrompida não gera documento errado).
    const valido = snapshotMotSchema.safeParse(snap.data);
    if (!valido.success) return NextResponse.json({ error: "Não foi possível ler os dados desta revisão." }, { status: 500 });
    bytes = await gerarPdfPropostaMot(valido.data, opcoes);
    revisaoDoArquivo = valido.data.revisao;
  } else {
    bytes = await gerarPdfProposta(snap.data, opcoes);
    revisaoDoArquivo = snap.data.revisao;
  }
  const nomeArquivo = `proposta-${String(proposta.numero).replace("/", "-")}${revisaoDoArquivo > 0 ? `-rev${revisaoDoArquivo}` : ""}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nomeArquivo}"`, "Cache-Control": "private, no-store" },
  });
}
