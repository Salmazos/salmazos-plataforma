import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, encaminhamentoUpdateSchema } from "@/lib/schemas";
import { exigirAcessoEncaminhamento } from "@/lib/unidadeAuth";
import { normalizarDataEntrevista } from "@/lib/dataEntrevista";
import { registrarHistorico } from "@/lib/registrarHistorico";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bloqueio = await exigirAcessoEncaminhamento(id);
    if (bloqueio) return bloqueio;
    const body = await request.json();
    const parsed = parseBody(encaminhamentoUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServiceClient();
    const campos: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) campos.status = parsed.data.status;
    if (parsed.data.observacoes !== undefined) campos.observacoes = parsed.data.observacoes;

    let dataEntrevistaAnterior: string | null = null;
    let dataEntrevistaNova: string | null = null;

    if (parsed.data.data_entrevista !== undefined) {
      const { data: registroAnterior, error: erroAnterior } = await supabase
        .from("encaminhamentos")
        .select("data_entrevista")
        .eq("id", id)
        .single();

      if (erroAnterior) return NextResponse.json({ error: erroAnterior.message }, { status: 400 });

      dataEntrevistaAnterior = registroAnterior?.data_entrevista ?? null;
      dataEntrevistaNova = normalizarDataEntrevista(parsed.data.data_entrevista);
      campos.data_entrevista = dataEntrevistaNova;
      campos.lembrete_entrevista_hoje_enviado_em = null;
    }

    const { data, error } = await supabase
      .from("encaminhamentos")
      .update(campos)
      .eq("id", id)
      .select("*, cliente:clientes(id, nome, cidade, segmento, servicos)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (dataEntrevistaNova !== null && dataEntrevistaAnterior !== dataEntrevistaNova) {
      const formatarData = (iso: string | null): string => {
        if (!iso) return "—";
        const date = new Date(iso);
        return date.toLocaleDateString("pt-BR");
      };

      await registrarHistorico({
        tipo: "encaminhamento",
        candidato_id: data.candidato_id,
        descricao: `Entrevista com o cliente remarcada de ${formatarData(dataEntrevistaAnterior)} para ${formatarData(dataEntrevistaNova)}`,
        metadata: {
          remarcacao: true,
          data_entrevista: dataEntrevistaNova,
          data_entrevista_anterior: dataEntrevistaAnterior,
        },
        criado_por: "sistema",
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/encaminhamentos/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
