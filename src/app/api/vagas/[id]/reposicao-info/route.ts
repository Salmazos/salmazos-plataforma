import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { detectarReaberturaAnterior, decisaoCobrancaJaRegistrada } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

const DIAS_GARANTIA = 30;

// Info pro aviso/botão de decisão de cobrança R&S numa vaga de R&S — usado tanto antes de
// fechar (botão "Encerrar vaga", vaga ainda aberta) quanto depois (aviso automático ou
// botão fixo numa vaga já fechada sem decisão registrada, ver VagaDetalheClient). Cobre os
// dois jeitos de saber que houve uma reposição dentro da garantia de 30 dias: vínculo
// explícito (vagas.reposicao_de_candidato_vaga_id, gravado só pelo fluxo de
// acionar-garantia) e detecção por histórico (mesma vaga reaberta manualmente e fechada de
// novo, sem esse vínculo — ver detectarReaberturaAnterior). `reaberturaRecente` é o que
// decide, no front, se o aviso abre sozinho (reabertura real dentro da garantia) ou só fica
// como um botão discreto (fechamento comum, sem reabertura, mas ainda pedindo a decisão).
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: vaga, error } = await supabase
    .from("vagas")
    .select("tipo_servico, data_abertura, reposicao_de_candidato_vaga_id")
    .eq("id", id)
    .single();

  if (error || !vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });

  if (vaga.tipo_servico !== "recrutamento_selecao") {
    return NextResponse.json({ pendente: false });
  }

  const decisaoRegistrada = await decisaoCobrancaJaRegistrada(id, vaga.data_abertura as string | null, supabase);
  if (decisaoRegistrada) {
    return NextResponse.json({ pendente: false, decisaoRegistrada: true });
  }

  let cvAnteriorId: string | null = vaga.reposicao_de_candidato_vaga_id as string | null;
  let reaberturaRecente = false;
  let dataInicioAnterior: string | null = null;

  if (cvAnteriorId) {
    // Vínculo explícito do fluxo de garantia — sempre conta como reabertura recente, é a
    // própria definição desse fluxo (a vaga nova só é criada dentro da janela de 30 dias).
    reaberturaRecente = true;
  } else {
    const anterior = await detectarReaberturaAnterior(id, supabase);
    if (anterior) {
      const diffDias = Math.floor(
        (Date.now() - new Date(anterior.dataInicio + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDias < DIAS_GARANTIA) {
        cvAnteriorId = anterior.candidatoVagaId;
        reaberturaRecente = true;
        dataInicioAnterior = anterior.dataInicio;
      }
    }
  }

  let candidatoNome: string | null = null;
  let cobrancaValor: number | null = null;
  let cobrancaData: string | null = null;

  if (cvAnteriorId) {
    const { data: cvOriginal } = await supabase
      .from("candidatos_vagas")
      .select("data_inicio, candidatos(nome_completo)")
      .eq("id", cvAnteriorId)
      .maybeSingle();
    const cvo = cvOriginal as { data_inicio: string | null; candidatos: { nome_completo: string } | null } | null;
    candidatoNome = cvo?.candidatos?.nome_completo ?? null;
    if (!dataInicioAnterior) dataInicioAnterior = cvo?.data_inicio ?? null;

    const { data: cobranca } = await supabase
      .from("cobrancas_rs")
      .select("fee_valor, created_at")
      .eq("candidato_vaga_id", cvAnteriorId)
      .eq("tipo", "contratacao")
      .maybeSingle();
    cobrancaValor = cobranca?.fee_valor ?? null;
    cobrancaData = cobranca?.created_at ?? null;
  }

  return NextResponse.json({
    pendente: true,
    decisaoRegistrada: false,
    reaberturaRecente,
    candidatoNome,
    dataInicioAnterior,
    cobrancaValor,
    cobrancaData,
  });
}
