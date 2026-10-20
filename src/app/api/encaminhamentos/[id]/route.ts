import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, encaminhamentoUpdateSchema } from "@/lib/schemas";
import { exigirAcessoEncaminhamento } from "@/lib/unidadeAuth";
import { normalizarDataEntrevista } from "@/lib/dataEntrevista";
import { normalizarLocalEntrevista, decidirAlteracaoEntrevista } from "@/lib/localEntrevista";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { avisarEntrevistaAoCliente, lerEncaminhamentoPorId } from "@/lib/avisoClienteEntrevista";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bloqueio = await exigirAcessoEncaminhamento(id);
    if (bloqueio) return bloqueio;

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    const body = await request.json();
    const parsed = parseBody(encaminhamentoUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServiceClient();
    const campos: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) campos.status = parsed.data.status;
    if (parsed.data.observacoes !== undefined) campos.observacoes = parsed.data.observacoes;

    const dataEnviada = parsed.data.data_entrevista !== undefined;
    const localEnviado = parsed.data.local_entrevista !== undefined;
    // Vazio/null limpa o campo; texto passa pela mesma normalização de todas as rotas antes de gravar.
    const localNovo = localEnviado ? normalizarLocalEntrevista(parsed.data.local_entrevista) : null;

    let dataEntrevistaAnterior: string | null = null;
    let localAnterior: string | null = null;
    let dataEntrevistaNova: string | null = null;
    let decisao = decidirAlteracaoEntrevista(null, {});

    if (dataEnviada || localEnviado) {
      const { data: registroAnterior, error: erroAnterior } = await supabase
        .from("encaminhamentos")
        .select("data_entrevista, local_entrevista")
        .eq("id", id)
        .single();

      if (erroAnterior) return NextResponse.json({ error: erroAnterior.message }, { status: 400 });

      dataEntrevistaAnterior = registroAnterior?.data_entrevista ?? null;
      localAnterior = registroAnterior?.local_entrevista ?? null;
      dataEntrevistaNova = dataEnviada ? normalizarDataEntrevista(parsed.data.data_entrevista) : null;

      // Data igual à gravada (ex.: o modal de remarcar reenviando a data só pra corrigir o local) não é remarcação:
      // não regrava a data, não zera o lembrete "entrevista hoje" e não avisa o cliente. Ver decidirAlteracaoEntrevista.
      decisao = decidirAlteracaoEntrevista(registroAnterior, {
        data_entrevista: dataEntrevistaNova,
        local_entrevista: localEnviado ? localNovo : undefined,
      });
      Object.assign(campos, decisao.campos);
    }
    const { dataMudou, localMudou } = decisao;

    // Estado ANTES de gravar, só quando a DATA muda: decide entre aviso de entrevista agendada ou remarcada ao
    // cliente no portal. Leitura isolada, nunca lança.
    const leituraEntrevista = dataMudou ? await lerEncaminhamentoPorId(supabase, id) : null;

    const retorno = "*, cliente:clientes(id, nome, cidade, segmento, servicos)";
    const { data, error } =
      Object.keys(campos).length > 0
        ? await supabase.from("encaminhamentos").update(campos).eq("id", id).select(retorno).single()
        : await supabase.from("encaminhamentos").select(retorno).eq("id", id).single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (dataMudou && dataEntrevistaNova !== null) {
      const formatarData = (iso: string | null): string => {
        if (!iso) return "—";
        const date = new Date(iso);
        return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      };
      const localFinal = decisao.localFinal;

      await registrarHistorico({
        tipo: "encaminhamento",
        candidato_id: data.candidato_id,
        descricao: `Entrevista com o cliente remarcada de ${formatarData(dataEntrevistaAnterior)} para ${formatarData(dataEntrevistaNova)}${localFinal ? ` — local: ${localFinal}` : ""}`,
        metadata: {
          remarcacao: true,
          data_entrevista: dataEntrevistaNova,
          data_entrevista_anterior: dataEntrevistaAnterior,
          ...(localFinal ? { local_entrevista: localFinal } : {}),
          ...(localMudou ? { local_entrevista_anterior: localAnterior } : {}),
        },
        criado_por: user?.email ?? null,
      });
    } else if (localMudou) {
      // Só o local mudou: histórico (tipo já existente no CHECK), sem aviso ao cliente e sem mexer no lembrete.
      await registrarHistorico({
        tipo: "encaminhamento",
        candidato_id: data.candidato_id,
        descricao: `Local da entrevista alterado de ${localAnterior ?? "não informado"} para ${localNovo ?? "não informado"}`,
        metadata: {
          alteracao: "local_entrevista",
          local_entrevista: localNovo,
          local_entrevista_anterior: localAnterior,
          encaminhamento_id: id,
        },
        criado_por: user?.email ?? null,
      });
    }

    // Aviso ao cliente no portal (sino e popup, conforme Configurações > Avisos): chamada extra, isolada e que
    // nunca lança, depois de a data já estar gravada e do histórico. Só quando a DATA mudou; o aviso leva o local
    // atual (data.local_entrevista), se houver.
    if (leituraEntrevista) await avisarEntrevistaAoCliente(supabase, data, leituraEntrevista);

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/encaminhamentos/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
