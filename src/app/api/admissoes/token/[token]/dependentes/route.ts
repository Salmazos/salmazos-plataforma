import { NextRequest, NextResponse } from "next/server";
import { parseBody, admissaoDependenteCreateSchema } from "@/lib/schemas";
import { resolveAdmissaoByToken } from "@/lib/admissaoToken";

interface Params {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;

  const resolved = await resolveAdmissaoByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  const { admissaoId, svc } = resolved;

  const body = await request.json();
  const parsed = parseBody(admissaoDependenteCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await svc
    .from("admissao_dependentes")
    .insert({ admissao_id: admissaoId, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
