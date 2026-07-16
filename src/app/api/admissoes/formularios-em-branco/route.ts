import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
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
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const pdfDoc = await PDFDocument.create();
  // Sem capa aqui — o primeiro conteúdo real já é desenharFichaCadastral, que abre
  // sua própria página. Sem isso, a página criada automaticamente pelo create()
  // fica órfã e em branco antes da Ficha Cadastral.
  const w = await PdfWriter.create(pdfDoc, false);

  // Duas linhas em branco pra cada seção repetível — dá espaço físico pra preencher
  // à mão sem forçar a pessoa a escrever nas margens.
  desenharFichaCadastral(w, {}, [{}, {}], { emBranco: true });
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
