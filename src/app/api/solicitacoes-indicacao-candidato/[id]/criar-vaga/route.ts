import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, indicacaoCriarVagaSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { generateUniqueSlug } from "@/lib/slug";
import { apelidoDoNomeCompleto } from "@/lib/responsaveis";
import { avisoTaxaVagaCriada, dadosVagaDaIndicacao, ehErroSemVagaIndisponivel, MSG_JA_TEM_VAGA, MSG_SEM_VAGA_INDISPONIVEL } from "@/lib/indicacaoSemVaga";

interface Params {
  params: Promise<{ id: string }>;
}

// "Criar vaga a partir da indicação": cria uma vaga e já liga a indicação a ela. A vaga nasce SEMPRE privada (fora do site público),
// aberta, com 1 posição e com o analista logado como responsável (quem recebe a comissão R&S) — tudo decidido no servidor
// (dadosVagaDaIndicacao); do corpo só aceita o título. Se a ligação falhar, a vaga recém-criada é APAGADA (reversão), como nas demais
// rotas de aprovação. Não dispara o "nova vaga criada" para os analistas: quem criou é o próprio analista, e a vaga é interna.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const parsed = parseBody(indicacaoCriarVagaSchema, await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: sol } = await service.from("solicitacoes_indicacao_candidato").select("*").eq("id", id).maybeSingle();
    if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
    if (sol.status !== "pendente") return NextResponse.json({ error: "Esta indicação já foi decidida." }, { status: 409 });
    if (sol.vaga_id) return NextResponse.json({ error: MSG_JA_TEM_VAGA }, { status: 409 });
    if (!sol.tipo_servico) return NextResponse.json({ error: "A indicação não tem tipo de serviço. Ajuste o tipo antes de criar a vaga." }, { status: 400 });

    const titulo = (parsed.data.titulo ?? String(sol.admissao_funcao ?? "")).trim();
    if (!titulo) return NextResponse.json({ error: "Informe o título da vaga (a indicação não tem cargo/função)." }, { status: 400 });

    const { data: cliente } = await service.from("clientes").select("nome, ativo, cidade").eq("id", sol.cliente_id).maybeSingle();
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
    // Mesma regra de POST /api/vagas: cliente inativo não recebe vaga nova.
    if (cliente.ativo === false) return NextResponse.json({ error: "Este cliente está inativo. Reative o cadastro dele antes de criar a vaga." }, { status: 400 });

    const usuarioNome = ((await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "").trim();
    // vagas.responsavel guarda o nome curto do time (ANALISTAS); quem não está na lista cai no nome completo.
    const responsavel = apelidoDoNomeCompleto(usuarioNome) ?? usuarioNome;
    if (!responsavel) return NextResponse.json({ error: "Não foi possível identificar o responsável pela vaga." }, { status: 400 });

    const agora = new Date().toISOString();
    const slug = await generateUniqueSlug(titulo, service);
    const { data: vaga, error: vagaErr } = await service
      .from("vagas")
      .insert({
        ...dadosVagaDaIndicacao({
          titulo,
          tipoServico: sol.tipo_servico,
          clienteId: sol.cliente_id,
          clienteNome: cliente.nome ?? sol.cliente_nome ?? null,
          unidadeId: sol.unidade_id,
          responsavel,
          candidatoNome: sol.candidato_nome,
          cidade: cliente.cidade,
        }),
        slug,
        data_abertura: agora,
      })
      .select("id, titulo, tipo_servico, fee_rs_percentual")
      .single();
    if (vagaErr || !vaga) {
      console.error("[criar-vaga indicacao] Erro ao criar a vaga:", vagaErr?.message);
      return NextResponse.json({ error: "Não foi possível criar a vaga." }, { status: 500 });
    }

    const { data: ligada, error: ligarErr } = await service
      .from("solicitacoes_indicacao_candidato")
      .update({ vaga_id: vaga.id, direcionada_em: agora, direcionada_por: usuarioNome, direcionamento_tipo: "vaga_criada", updated_at: agora })
      .eq("id", id)
      .eq("status", "pendente")
      .is("vaga_id", null)
      .select("*, vagas(titulo, tipo_servico)")
      .maybeSingle();

    if (ligarErr || !ligada) {
      // Reversão: a vaga acabou de nascer e nada mais aponta para ela — apagar é seguro.
      const { error: delErr } = await service.from("vagas").delete().eq("id", vaga.id);
      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: delErr ? "indicacao_vaga_criada_rollback_falhou" : "indicacao_vaga_criada_revertida",
        entidade: "solicitacoes_indicacao_candidato",
        entidade_id: id,
        detalhes: { vaga_id: vaga.id, erro_ligar: ligarErr?.message ?? "indicação mudou no meio", erro_apagar_vaga: delErr?.message ?? null },
      });
      if (delErr) {
        console.error("[criar-vaga indicacao] Não foi possível reverter a vaga criada:", delErr.message);
        return NextResponse.json({ error: "Falha ao ligar a indicação à vaga e não foi possível apagar a vaga criada. Confira a vaga em Vagas (privada, sem divulgação)." }, { status: 500 });
      }
      if (ligarErr && ehErroSemVagaIndisponivel(ligarErr)) return NextResponse.json({ error: MSG_SEM_VAGA_INDISPONIVEL }, { status: 503 });
      if (ligarErr) return NextResponse.json({ error: "Não foi possível ligar a indicação à vaga. Nada foi criado." }, { status: 500 });
      return NextResponse.json({ error: "A indicação mudou enquanto a vaga era criada. Nada foi criado; recarregue e tente de novo." }, { status: 409 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "vaga_criada",
      entidade: "vagas",
      entidade_id: vaga.id,
      detalhes: { titulo: vaga.titulo, tipo_servico: vaga.tipo_servico, status: "aberta", origem: "indicacao_candidato", solicitacao_id: id, visivel_publicamente: false },
    });
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "indicacao_candidato_direcionada",
      entidade: "solicitacoes_indicacao_candidato",
      entidade_id: id,
      detalhes: { cliente: sol.cliente_nome, vaga_id: vaga.id, vaga_titulo: vaga.titulo, direcionamento_tipo: "vaga_criada" },
    });

    return NextResponse.json({ data: ligada, vaga: { id: vaga.id, titulo: vaga.titulo }, aviso_taxa_rs: avisoTaxaVagaCriada(vaga.tipo_servico) });
  } catch (err) {
    console.error("[POST /api/solicitacoes-indicacao-candidato/[id]/criar-vaga]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
