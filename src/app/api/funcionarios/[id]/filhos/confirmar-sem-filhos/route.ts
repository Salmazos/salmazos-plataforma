import { NextRequest, NextResponse } from "next/server";
import { erroDeTabelaAusente } from "@/lib/funcionarioPerfil";
import { auditarPerfil, prepararEdicaoPerfil, respostaErroBanco, respostaTabelaAusente } from "@/lib/funcionarioPerfilRota";

interface Params { params: Promise<{ id: string }> }

// Confirmação explícita "este funcionário não tem filhos": sem ela, legado sem filho cadastrado é "Não informado" (nunca "sem filhos"). Só vale se não há filho cadastrado.
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const p = await prepararEdicaoPerfil(id);
    if (p instanceof Response) return p;

    const { data: filhos, error: erroFilhos } = await p.svc.from("funcionario_filhos").select("id").eq("funcionario_id", id);
    if (erroDeTabelaAusente(erroFilhos)) return respostaTabelaAusente();
    if ((filhos ?? []).length > 0) return NextResponse.json({ error: "Este funcionário tem filhos cadastrados. Remova-os antes de confirmar que não tem filhos." }, { status: 409 });

    const { data: perfil } = await p.svc.from("funcionario_perfil").select("filhos_informado_em").eq("funcionario_id", id).maybeSingle();
    if (perfil?.filhos_informado_em) return NextResponse.json({ data: { filhos_informado_em: perfil.filhos_informado_em } }); // já confirmado: nada a gravar nem auditar

    const informadoEm = new Date().toISOString();
    const { error } = await p.svc.from("funcionario_perfil").upsert({ funcionario_id: id, filhos_informado_em: informadoEm, filhos_informado_por: p.user.id, atualizado_por: p.user.id }, { onConflict: "funcionario_id" });
    if (error) return respostaErroBanco(error);
    const data = { filhos_informado_em: informadoEm };

    await auditarPerfil(p.user, id, "filhos_confirmado_sem_filhos", { antes: { filhos_informado_em: null }, depois: { filhos_informado_em: informadoEm } });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[POST /api/funcionarios/[id]/filhos/confirmar-sem-filhos]", e);
    return NextResponse.json({ error: "Não foi possível confirmar." }, { status: 500 });
  }
}
