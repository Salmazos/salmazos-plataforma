import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoFecharSchema } from "@/lib/schemas";
import { exigirDiretoria } from "@/lib/comissaoAuth";
import { fecharMes, listarFechamentos } from "@/lib/comissaoFechamento";

// Fechamentos já feitos (mais recentes primeiro), com total e situação (aguardando pagamento / pago em).
export async function GET() {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  try {
    return NextResponse.json({ fechamentos: await listarFechamentos(createServiceClient(), { unidadeId: acesso.unidadeId }) });
  } catch (e) {
    console.error("[GET /api/comissoes/fechamentos]", e);
    return NextResponse.json({ error: "Não foi possível carregar os fechamentos." }, { status: 500 });
  }
}

// Fechar o mês de competência de UMA unidade (irreversível). Transação única e idempotente no banco: clicar duas vezes devolve o mesmo
// fechamento; se o conjunto mudou desde a prévia, nada é gravado.
export async function POST(request: NextRequest) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const parsed = parseBody(comissaoFecharSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (acesso.unidadeId !== null && acesso.unidadeId !== parsed.data.unidade_id) return NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 });
  const r = await fecharMes(createServiceClient(), {
    competencia: `${parsed.data.competencia}-01`,
    unidadeId: parsed.data.unidade_id,
    ator: acesso.ator,
    esperadoQtd: parsed.data.esperado_qtd,
    esperadoTotal: parsed.data.esperado_total,
  });
  if (!r.ok) {
    const { ok: _ok, status, ...resto } = r as typeof r & Record<string, unknown>;
    return NextResponse.json(resto, { status });
  }
  return NextResponse.json({ fechamento_id: r.fechamento_id, total: r.total, qtd: r.qtd, ja_existia: r.ja_existia }, { status: r.ja_existia ? 200 : 201 });
}
