import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoBeneficiarioSchema } from "@/lib/schemas";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { atorDoUsuario } from "@/lib/comissaoAuth";
import { salvarBeneficiario } from "@/lib/comissao";

// Cria/atualiza o beneficiário (percentual e ativo). Só diretoria/superuser (a exceção de aba "Comissões" NÃO basta aqui: mexer no
// percentual é decisão de sócio). O percentual novo vale para marcações novas; lançamentos existentes guardam o que aplicaram.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!PAPEIS_FULL_ACCESS.includes(user.app_metadata?.role ?? "analista")) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = parseBody(comissaoBeneficiarioSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await salvarBeneficiario(createServiceClient(), {
    analistaPerfilId: parsed.data.analista_perfil_id,
    percentual: parsed.data.percentual,
    ativo: parsed.data.ativo,
    ator: await atorDoUsuario(user),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ beneficiario: r.beneficiario });
}
