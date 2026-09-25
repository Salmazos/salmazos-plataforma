import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, vagaUpdateSchema } from "@/lib/schemas";
import { generateUniqueSlug } from "@/lib/slug";
import { gerarCobrancaCancelamentoRSSeAplicavel } from "@/lib/cobrancaRS";
import { sincronizarPosicoesAbertas } from "@/lib/vagaPosicoes";
import { exigirAcessoVaga, resolverUnidadeCliente } from "@/lib/unidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const bloqueio = await exigirAcessoVaga(id);
  if (bloqueio) return bloqueio;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vagas")
    .select("*, clientes(id, nome, processo_simplificado)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const bloqueio = await exigirAcessoVaga(id);
    if (bloqueio) return bloqueio;
    const body = await request.json();

    const parsed = parseBody(vagaUpdateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createServiceClient();

    // DECISÃO DO OLVER (24/09): trocar o cliente só pra outro da MESMA unidade da vaga.
    // Mover a vaga de unidade junto levaria os candidatos do Kanban dela pra outra equipe —
    // fica fora do painel por enquanto.
    if (body.cliente_id) {
      const [{ data: vagaAtual }, unidadeCliente] = await Promise.all([
        supabase.from("vagas").select("unidade_id").eq("id", id).maybeSingle(),
        resolverUnidadeCliente(body.cliente_id),
      ]);
      if (!vagaAtual || !unidadeCliente || unidadeCliente !== vagaAtual.unidade_id) {
        return NextResponse.json(
          { error: "O cliente escolhido é de outra unidade. A vaga só pode ser vinculada a um cliente da mesma unidade." },
          { status: 400 }
        );
      }
    }

    const campos: Record<string, unknown> = {};
    if (body.titulo !== undefined) {
      campos.titulo = body.titulo;
      campos.slug = await generateUniqueSlug(body.titulo, supabase, id);
    }
    if (body.cliente_id !== undefined)          campos.cliente_id = body.cliente_id ?? null;
    if (body.tipo_servico !== undefined)        campos.tipo_servico = body.tipo_servico;
    if (body.num_posicoes !== undefined)        campos.num_posicoes = Number(body.num_posicoes);
    if (body.prazo !== undefined)               campos.prazo = body.prazo || null;
    if (body.status !== undefined)              campos.status = body.status;
    if (body.cidade !== undefined)              campos.cidade = body.cidade || null;
    if (body.estado !== undefined)              campos.estado = body.estado || null;
    if (body.salario !== undefined)             campos.salario = body.salario || null;
    if (body.adicionais_salariais !== undefined) campos.adicionais_salariais = body.adicionais_salariais || null;
    if (body.requisitos !== undefined)          campos.requisitos = body.requisitos || null;
    if (body.beneficios !== undefined)          campos.beneficios = body.beneficios || null;
    if (body.principais_atividades !== undefined) campos.principais_atividades = body.principais_atividades || null;
    if (body.horario !== undefined)             campos.horario = body.horario || null;
    if (body.habilidades_desejadas !== undefined) campos.habilidades_desejadas = body.habilidades_desejadas;
    if (body.responsavel !== undefined)         campos.responsavel = body.responsavel;
    if (body.observacoes !== undefined)         campos.observacoes = body.observacoes || null;
    if (body.fee_rs_percentual !== undefined)  campos.fee_rs_percentual = body.fee_rs_percentual !== "" ? Number(body.fee_rs_percentual) : null;
    if (body.fee_rs_prazo_cobranca !== undefined) campos.fee_rs_prazo_cobranca = body.fee_rs_prazo_cobranca || null;
    if (body.confidencial !== undefined)        campos.confidencial = body.confidencial === true;
    if (body.taxa_cancelamento !== undefined)   campos.taxa_cancelamento = body.taxa_cancelamento === true;
    if (body.taxa_cancelamento_percentual !== undefined) campos.taxa_cancelamento_percentual = body.taxa_cancelamento_percentual !== "" ? Number(body.taxa_cancelamento_percentual) : null;
    if (body.visivel_publicamente !== undefined) campos.visivel_publicamente = body.visivel_publicamente === true;

    let statusAlterado = false;
    let statusAnterior: string | null = null;

    if (body.status !== undefined) {
      const { data: current } = await supabase
        .from("vagas")
        .select("status, num_posicoes, num_posicoes_abertas")
        .eq("id", id)
        .single();
      if (current && current.status !== body.status) {
        statusAlterado = true;
        statusAnterior = current.status as string;

        if (body.status === "aberta") {
          campos.data_abertura = new Date().toISOString();
          campos.data_fechamento = null;
          // num_posicoes_abertas é recalculado depois do update principal, a partir da
          // contagem real de contratados (ver sincronizarPosicoesAbertas mais abaixo) — não
          // resetar pro total aqui: essa vaga pode já ter posições de verdade preenchidas,
          // e resetar pro total "esquecia" delas (causa raiz do caso real da vaga Auxiliar
          // de Produção/Novacki de 21-22/09, ver nota de memória de 22/09).
        } else if (body.status === "fechada" || body.status === "cancelada") {
          campos.data_fechamento = new Date().toISOString();
        }
      }
    }

    if (body.tipo_servico !== undefined) {
      const { data: current } = await supabase
        .from("vagas")
        .select("tipo_servico, tipo_servico_original")
        .eq("id", id)
        .single();

      if (current && current.tipo_servico !== body.tipo_servico) {
        let alteradoPor = "";
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();
        if (user) {
          const { data: perfil } = await supabase
            .from("analistas_perfil")
            .select("nome_completo")
            .eq("user_id", user.id)
            .single();
          alteradoPor = perfil?.nome_completo ?? user.email ?? "";
        }

        if (!current.tipo_servico_original) {
          campos.tipo_servico_original = current.tipo_servico;
        }
        campos.tipo_servico_alterado_em = new Date().toISOString();
        campos.tipo_servico_alterado_por = alteradoPor;
        campos.tipo_servico_motivo = body.motivo_alteracao || null;

        await supabase.from("vagas_historico_modalidade").insert({
          vaga_id: id,
          tipo_anterior: current.tipo_servico,
          tipo_novo: body.tipo_servico,
          alterado_por: alteradoPor,
          motivo: body.motivo_alteracao || null,
        });
      }
    }

    const { data, error } = await supabase
      .from("vagas")
      .update(campos)
      .eq("id", id)
      .select("*, clientes(id, nome, processo_simplificado)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (statusAlterado) {
      registrarAuditoria({
        acao: "vaga_atualizada",
        entidade: "vagas",
        entidade_id: id,
        detalhes: { status_anterior: statusAnterior, status_novo: body.status as string },
      });

      // Cobrança R&S não é mais decidida no fechamento da vaga — cada contratação já
      // captura sua própria decisão (candidatos_vagas.gerar_cobranca_rs) no momento em
      // que é finalizada (ver PATCH /api/candidatos-vagas/[id]/finalizar), então fechar a
      // vaga aqui não precisa (e não deve) mexer em cobrança.

      // Cancelamento manual (mesmos 2 caminhos: "Encerrar vaga" e edição direta do status)
      // também pode gerar cobrança, se a vaga tiver taxa de cancelamento configurada.
      if (body.status === "cancelada") {
        await gerarCobrancaCancelamentoRSSeAplicavel(id, supabase).catch((err) =>
          console.error("[PATCH /api/vagas/[id]] Erro ao gerar cobrança de cancelamento R&S:", err)
        );
      }
    }

    // Recalcula num_posicoes_abertas sempre que o total de posições muda ou a vaga é
    // reaberta manualmente — nos dois casos o valor anterior desse contador não é mais
    // confiável (ver vagaPosicoes.ts). Refaz a busca depois, porque `data` acima já foi
    // capturado antes dessa correção e ficaria com o contador (e possivelmente o status,
    // se a vaga acabar re-fechando por já estar com todas as posições preenchidas)
    // desatualizado na resposta.
    let dataFinal = data;
    if (body.num_posicoes !== undefined || (statusAlterado && body.status === "aberta")) {
      await sincronizarPosicoesAbertas(id, supabase);
      const { data: recarregada } = await supabase
        .from("vagas")
        .select("*, clientes(id, nome, processo_simplificado)")
        .eq("id", id)
        .single();
      if (recarregada) dataFinal = recarregada;
    }

    return NextResponse.json({ data: dataFinal });
  } catch (err) {
    console.error("[PATCH /api/vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
