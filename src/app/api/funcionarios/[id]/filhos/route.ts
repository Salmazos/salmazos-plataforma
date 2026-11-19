import { NextRequest, NextResponse } from "next/server";
import { parseBody, funcionarioFilhoCreateSchema } from "@/lib/schemas";
import { avisoFilho14OuMais, erroDeTabelaAusente } from "@/lib/funcionarioPerfil";
import { auditarPerfil, prepararEdicaoPerfil, respostaErroBanco, respostaTabelaAusente } from "@/lib/funcionarioPerfilRota";

interface Params { params: Promise<{ id: string }> }

// Cadastra um filho de funcionário SEM admissão digital. Nascimento futuro/inexistente = 400. Filho de 14 anos ou mais é aceito (vem um aviso informativo: ele não
// aparece na lista da Gestão de Pessoas). Cadastrar o primeiro filho já conta como "filhos informados" (filhos_informado_em), então a pessoa sai de "Não informado".
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const p = await prepararEdicaoPerfil(id);
    if (p instanceof Response) return p;

    const corpo = parseBody(funcionarioFilhoCreateSchema, await request.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ error: corpo.error }, { status: 400 });
    const nascimento = corpo.data.data_nascimento as string;

    const { data: filho, error } = await p.svc
      .from("funcionario_filhos")
      .insert({ funcionario_id: id, nome: corpo.data.nome, data_nascimento: nascimento, criado_por: p.user.id, atualizado_por: p.user.id })
      .select("id, nome, data_nascimento")
      .single();
    if (error) return respostaErroBanco(error);

    const { data: perfil, error: erroPerfil } = await p.svc.from("funcionario_perfil").select("filhos_informado_em").eq("funcionario_id", id).maybeSingle();
    if (erroDeTabelaAusente(erroPerfil)) return respostaTabelaAusente();
    if (!perfil?.filhos_informado_em) {
      await p.svc.from("funcionario_perfil").upsert({ funcionario_id: id, filhos_informado_em: new Date().toISOString(), filhos_informado_por: p.user.id, atualizado_por: p.user.id }, { onConflict: "funcionario_id" });
    }

    await auditarPerfil(p.user, id, "funcionario_filho_criado", { filho_id: filho.id, nome: filho.nome, data_nascimento: filho.data_nascimento });
    return NextResponse.json({ data: filho, aviso: avisoFilho14OuMais(nascimento, p.hojeISO)?.mensagem ?? null });
  } catch (e) {
    console.error("[POST /api/funcionarios/[id]/filhos]", e);
    return NextResponse.json({ error: "Não foi possível cadastrar o filho." }, { status: 500 });
  }
}
