import { NextRequest, NextResponse } from "next/server";
import { parseBody, funcionarioFilhoUpdateSchema } from "@/lib/schemas";
import { diffCampos } from "@/lib/audit";
import { avisoFilho14OuMais, AVISO_ULTIMO_FILHO } from "@/lib/funcionarioPerfil";
import { auditarPerfil, prepararEdicaoPerfil, respostaAviso, respostaErroBanco } from "@/lib/funcionarioPerfilRota";

interface Params { params: Promise<{ id: string; filhoId: string }> }

// Edita um filho (só nome e nascimento). O filho precisa ser DESTE funcionário.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, filhoId } = await params;
    const p = await prepararEdicaoPerfil(id);
    if (p instanceof Response) return p;

    const corpo = parseBody(funcionarioFilhoUpdateSchema, await request.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ error: corpo.error }, { status: 400 });
    const campos: Record<string, unknown> = {};
    if (corpo.data.nome !== undefined) campos.nome = corpo.data.nome;
    if (corpo.data.data_nascimento !== undefined) campos.data_nascimento = corpo.data.data_nascimento;
    if (Object.keys(campos).length === 0) return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });

    const { data: antes } = await p.svc.from("funcionario_filhos").select("id, nome, data_nascimento").eq("id", filhoId).eq("funcionario_id", id).maybeSingle();
    if (!antes) return NextResponse.json({ error: "Filho não encontrado." }, { status: 404 });

    const { data, error } = await p.svc.from("funcionario_filhos").update({ ...campos, atualizado_por: p.user.id }).eq("id", filhoId).eq("funcionario_id", id).select("id, nome, data_nascimento").single();
    if (error) return respostaErroBanco(error);

    await auditarPerfil(p.user, id, "funcionario_filho_editado", { filho_id: filhoId, diff: diffCampos(antes, campos) });
    return NextResponse.json({ data, aviso: avisoFilho14OuMais(data.data_nascimento, p.hojeISO)?.mensagem ?? null });
  } catch (e) {
    console.error("[PATCH /api/funcionarios/[id]/filhos/[filhoId]]", e);
    return NextResponse.json({ error: "Não foi possível salvar o filho." }, { status: 500 });
  }
}

// Remove um filho. Remover o ÚLTIMO pede confirmação (?confirmado=1; sem ela: 422 de aviso): a pessoa passa a constar como "Sem filhos declarados".
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id, filhoId } = await params;
    const p = await prepararEdicaoPerfil(id);
    if (p instanceof Response) return p;

    const { data: filhos } = await p.svc.from("funcionario_filhos").select("id, nome, data_nascimento").eq("funcionario_id", id);
    const alvo = (filhos ?? []).find((f: { id: string }) => f.id === filhoId);
    if (!alvo) return NextResponse.json({ error: "Filho não encontrado." }, { status: 404 });
    if ((filhos ?? []).length === 1 && new URL(request.url).searchParams.get("confirmado") !== "1") return respostaAviso(AVISO_ULTIMO_FILHO);

    const { error } = await p.svc.from("funcionario_filhos").delete().eq("id", filhoId).eq("funcionario_id", id);
    if (error) return respostaErroBanco(error);

    await auditarPerfil(p.user, id, "funcionario_filho_removido", { filho_id: filhoId, antes: { nome: alvo.nome, data_nascimento: alvo.data_nascimento }, ultimo_filho: (filhos ?? []).length === 1 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/funcionarios/[id]/filhos/[filhoId]]", e);
    return NextResponse.json({ error: "Não foi possível remover o filho." }, { status: 500 });
  }
}
