import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: cv, error } = await supabase
    .from("candidatos_vagas")
    .select("admissao_fee_percentual, admissao_fee_valor, admissao_fee_prazo, admissao_fee_origem, vagas!candidatos_vagas_vaga_id_fkey(fee_rs_percentual, fee_rs_prazo_cobranca)")
    .eq("id", id)
    .single();

  if (error || !cv) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vaga = (cv as any).vagas as { fee_rs_percentual: number | null; fee_rs_prazo_cobranca: string | null } | null;

  return NextResponse.json({
    feeRsPercentual: vaga?.fee_rs_percentual ?? null,
    admissaoFeeValor: cv.admissao_fee_valor ?? null,
    admissaoFeePercentual: cv.admissao_fee_percentual ?? null,
    admissaoFeeOrigem: cv.admissao_fee_origem ?? null,
  });
}
