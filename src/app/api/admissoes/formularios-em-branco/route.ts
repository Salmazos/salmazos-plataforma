import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";
import { PdfWriter } from "@/lib/pdfWriter";
import { desenharFichaCadastral, desenharAutorizacaoSindical, desenharSolicitacaoValeTransporte } from "@/lib/admissaoDocumentosPdf";

// Gera os 3 documentos (Ficha Cadastral, Autorização Sindical, Solicitação de Vale
// Transporte) totalmente em branco, sem vínculo com nenhuma admissão — para
// preenchimento manual à caneta quando o candidato não tem acesso digital ao
// formulário. Reaproveita as mesmas funções de desenho usadas no pacote de
// contabilidade (src/lib/admissaoDocumentosPdf.ts), só que sem dados.
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const pdfDoc = await PDFDocument.create();
  const w = await PdfWriter.create(pdfDoc);

  // Duas linhas em branco pra cada seção repetível — dá espaço físico pra preencher
  // à mão sem forçar a pessoa a escrever nas margens.
  desenharFichaCadastral(w, {}, [{}, {}]);
  desenharAutorizacaoSindical(w, {});
  desenharSolicitacaoValeTransporte(w, { linhas: [{}, {}] });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="formularios-admissao-em-branco.pdf"',
      "Content-Length": String(pdfBytes.length),
    },
  });
}
