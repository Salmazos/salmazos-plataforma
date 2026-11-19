import { NextRequest, NextResponse } from "next/server";
import { parseBody, funcionarioPerfilSchema } from "@/lib/schemas";
import { diffCampos } from "@/lib/audit";
import { avisoIdadeFuncionario, erroDeTabelaAusente } from "@/lib/funcionarioPerfil";
import { auditarPerfil, prepararEdicaoPerfil, respostaAviso, respostaErroBanco, respostaTabelaAusente } from "@/lib/funcionarioPerfilRota";

interface Params { params: Promise<{ id: string }> }

// Sexo, nascimento e grau de instrução de funcionário SEM admissão digital (seção "Dados pessoais" do cartão). Só os campos enviados mudam.
// Nascimento futuro/inexistente: 400 (o schema). Idade fora de 14 a 90: 422 de aviso; só salva com confirmado:true.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const p = await prepararEdicaoPerfil(id);
    if (p instanceof Response) return p;

    const corpo = parseBody(funcionarioPerfilSchema, await request.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ error: corpo.error }, { status: 400 });
    const { confirmado, ...enviados } = corpo.data;

    const campos: Record<string, unknown> = {};
    for (const chave of ["sexo", "data_nascimento", "grau_instrucao"] as const) if (enviados[chave] !== undefined) campos[chave] = enviados[chave];
    if (Object.keys(campos).length === 0) return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });

    if (typeof campos.data_nascimento === "string" && !confirmado) {
      const aviso = avisoIdadeFuncionario(campos.data_nascimento, p.hojeISO);
      if (aviso) return respostaAviso(aviso);
    }

    const { data: antes, error: erroLeitura } = await p.svc.from("funcionario_perfil").select("sexo, data_nascimento, grau_instrucao").eq("funcionario_id", id).maybeSingle();
    if (erroDeTabelaAusente(erroLeitura)) return respostaTabelaAusente();

    const { error } = await p.svc.from("funcionario_perfil").upsert({ funcionario_id: id, ...campos, atualizado_por: p.user.id }, { onConflict: "funcionario_id" });
    if (error) return respostaErroBanco(error);
    const { data } = await p.svc.from("funcionario_perfil").select("sexo, data_nascimento, grau_instrucao, filhos_informado_em").eq("funcionario_id", id).maybeSingle();

    await auditarPerfil(p.user, id, "funcionario_perfil_editado", { diff: diffCampos(antes, campos) });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[PUT /api/funcionarios/[id]/perfil]", e);
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  }
}
