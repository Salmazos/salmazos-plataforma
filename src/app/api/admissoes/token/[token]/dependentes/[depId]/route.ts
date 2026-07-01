import { NextRequest, NextResponse } from "next/server";
import { resolveAdmissaoByToken } from "@/lib/admissaoToken";

interface Params {
  params: Promise<{ token: string; depId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { token, depId } = await params;

  const resolved = await resolveAdmissaoByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  const { admissaoId, svc } = resolved;

  const { error } = await svc
    .from("admissao_dependentes")
    .delete()
    .eq("id", depId)
    .eq("admissao_id", admissaoId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
