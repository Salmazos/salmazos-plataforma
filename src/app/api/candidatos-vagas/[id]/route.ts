import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";

interface Params {
  params: Promise<{ id: string }>;
}

const ETAPA_LABEL: Record<string, string> = {
  triagem: "Triagem",
  entrevista_salmazos: "Entrevista Salmazos",
  entrevista_rh: "Entrevista Salmazos",
  entrevista_cliente: "Entrevista Cliente",
  aprovado_cliente: "Retorno Cliente",
  contratado: "Contratado",
  reprovado: "Reprovado",
  reprovado_final: "Processo Encerrado",
  nao_tem_interesse: "Não tem Interesse",
  nao_compareceu: "Não Compareceu",
  bloqueado: "Bloqueado",
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const campos: Record<string, unknown> = {};
    if (body.etapa !== undefined) campos.etapa = body.etapa;
    if (body.observacoes !== undefined) campos.observacoes = body.observacoes;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("candidatos_vagas")
      .update(campos)
      .eq("id", id)
      .select("*, candidatos(id, nome_completo)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const candidatoId = (data as { candidato_id: string }).candidato_id;

    if (body.etapa) {
      void registrarHistorico({
        candidato_id: candidatoId,
        tipo: "etapa_alterada",
        descricao: `Movido para ${ETAPA_LABEL[body.etapa] ?? body.etapa}${body.observacoes ? ` — ${body.observacoes}` : ""}`,
        metadata: { etapa: body.etapa, observacoes: body.observacoes || null },
        criado_por: null,
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
