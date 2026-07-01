import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { parseBody, candidatoVagaUpdateSchema } from "@/lib/schemas";

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
    const parsed = parseBody(candidatoVagaUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const campos: Record<string, unknown> = {};
    if (parsed.data.etapa !== undefined) campos.etapa = parsed.data.etapa;
    if (parsed.data.observacoes !== undefined) campos.observacoes = parsed.data.observacoes;
    if (parsed.data.cliente_id !== undefined) campos.cliente_id = parsed.data.cliente_id || null;
    if (parsed.data.data_entrevista_salmazos !== undefined) campos.data_entrevista_salmazos = parsed.data.data_entrevista_salmazos || null;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("candidatos_vagas")
      .update(campos)
      .eq("id", id)
      .select("*, candidatos(id, nome_completo)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const candidatoId = (data as { candidato_id: string }).candidato_id;

    if (parsed.data.etapa) {
      void registrarHistorico({
        candidato_id: candidatoId,
        tipo: "etapa_alterada",
        descricao: `Movido para ${ETAPA_LABEL[parsed.data.etapa] ?? parsed.data.etapa}${parsed.data.observacoes ? ` — ${parsed.data.observacoes}` : ""}`,
        metadata: { etapa: parsed.data.etapa, observacoes: parsed.data.observacoes || null },
        criado_por: null,
      });
    }

    if (parsed.data.etapa === "reprovado") {
      return NextResponse.json({ data, showReprovacaoModal: true, candidatoId });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
