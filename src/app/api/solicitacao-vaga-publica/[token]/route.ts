import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, publicoSolicitarVagaSchema } from "@/lib/schemas";
import { validarLink } from "@/lib/solicitacaoVagaLink";
import { devolverUsoDoLink, reservarUsoDoLink, resolverLinkPorToken } from "@/lib/solicitacaoVagaLinkServidor";
import { itensDasCondicoes, lerCondicoesDoLink, montarSnapshotCondicoes } from "@/lib/solicitacaoVagaCondicoes";
import { mascararCnpj, mascararCpf } from "@/lib/documentoBr";
import { notificarSolicitacaoPublica } from "@/lib/solicitacaoVagaLinkNotificacao";

export const dynamic = "force-dynamic";

// Rotas SEM login (ver PUBLIC_API_PREFIXES no middleware): a segurança é o token do link (checado a cada chamada), o teto de usos,
// o rate limit por IP, o honeypot e a validação de todos os textos. Nunca logar CNPJ/CPF, telefone nem e-mail do cliente.

const SEM_CACHE = { "Cache-Control": "no-store" };
const TAMANHO_MAXIMO_CORPO = 100_000;

interface Contexto {
  params: Promise<{ token: string }>;
}

export async function GET(_request: NextRequest, { params }: Contexto) {
  const { token } = await params;
  const service = createServiceClient();
  const link = await resolverLinkPorToken(service, token);
  const validacao = validarLink(link, new Date());
  if (!link || !validacao.ok) {
    return NextResponse.json(
      { error: validacao.ok ? "Link indisponível." : validacao.mensagem },
      { status: validacao.ok ? 404 : validacao.httpStatus, headers: SEM_CACHE }
    );
  }
  // Condições e texto numerado já renderizados aqui: o cliente vê exatamente o texto do PDF da proposta.
  const { condicoes, clausulas } = lerCondicoesDoLink(link);
  return NextResponse.json(
    {
      data: {
        nome_empresa: link.nome_empresa,
        condicoes,
        clausulas_adicionais: clausulas,
        itens: itensDasCondicoes(condicoes, clausulas),
      },
    },
    { headers: SEM_CACHE }
  );
}

export async function POST(request: NextRequest, { params }: Contexto) {
  try {
    const { token } = await params;
    const tamanho = Number(request.headers.get("content-length") ?? "0");
    if (tamanho > TAMANHO_MAXIMO_CORPO) return NextResponse.json({ error: "Solicitação grande demais." }, { status: 413 });

    const corpo = await request.json().catch(() => null);
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }
    // Honeypot: campo invisível para pessoas. Preenchido = robô; responde como se tivesse dado certo e não grava nada.
    const armadilha = (corpo as { website?: unknown }).website;
    if (typeof armadilha === "string" && armadilha.trim() !== "") {
      return NextResponse.json({ success: true }, { status: 201 });
    }

    const service = createServiceClient();
    const link = await resolverLinkPorToken(service, token);
    const validacao = validarLink(link, new Date());
    if (!link || !validacao.ok) {
      return NextResponse.json(
        { error: validacao.ok ? "Link indisponível." : validacao.mensagem },
        { status: validacao.ok ? 404 : validacao.httpStatus }
      );
    }

    const parsed = parseBody(publicoSolicitarVagaSchema, corpo);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const d = parsed.data;

    // Reserva o envio ANTES de gravar (teto de usos); se a gravação falhar, o envio é devolvido ao link.
    if (!(await reservarUsoDoLink(service, link))) {
      return NextResponse.json({ error: "Este link não está mais disponível. Entre em contato com a Salmazos para receber um novo link." }, { status: 410 });
    }

    const documento = d.tipo_pessoa === "pj" ? mascararCnpj(d.documento) : mascararCpf(d.documento);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null;

    const { data: solicitacao, error } = await service
      .from("solicitacoes_vagas")
      .insert({
        unidade_id: link.unidade_id,
        cliente_id: null,
        cliente_nome: d.nome,
        solicitado_por_user_id: null,
        cargo: d.cargo,
        // Fixo: este link é só de Recrutamento e Seleção, qualquer valor vindo do cliente é ignorado.
        tipo_servico: "recrutamento_selecao",
        num_posicoes: d.num_posicoes,
        cidade: d.cidade,
        estado: d.estado,
        salario: d.salario,
        adicionais_salariais: d.adicionais_salariais,
        horario_tipo: d.horario_tipo,
        horario_texto: d.horario_texto,
        previsao_inicio: d.previsao_inicio,
        requisitos: d.requisitos,
        requisitos_chips: d.requisitos_chips ?? null,
        beneficios: d.beneficios,
        beneficios_chips: d.beneficios_chips ?? null,
        principais_atividades: d.principais_atividades,
        observacoes: d.observacoes,
        confidencial: false,
        origem: "link_publico",
        link_id: link.id,
        dados_empresa: {
          tipo_pessoa: d.tipo_pessoa,
          nome: d.nome,
          cnpj_cpf: documento,
          contato_nome: d.contato_nome,
          telefone: d.telefone,
          endereco: d.endereco,
          email: d.email,
          email_nf: d.email_nf,
        },
        perfil_extra: {
          sexo: d.sexo,
          idade: d.idade,
          pcd: d.pcd,
          habilitacao_categoria: d.habilitacao_categoria,
          veiculo_proprio: d.veiculo_proprio,
          local_trabalho: d.local_trabalho,
        },
        // Condições SEMPRE as do link (lidas aqui, no servidor): nada que venha no corpo as altera. A foto é imutável.
        condicoes_aceitas: montarSnapshotCondicoes(link),
        aceite_taxa_cancelamento_em: new Date().toISOString(),
        aceite_ip: ip,
      })
      .select("id")
      .single();

    if (error || !solicitacao) {
      await devolverUsoDoLink(service, link.id);
      console.error("[POST /api/solicitacao-vaga-publica] Erro ao gravar a solicitação:", error?.code ?? "sem código");
      return NextResponse.json({ error: "Não foi possível registrar a solicitação. Tente novamente em instantes." }, { status: 500 });
    }

    await notificarSolicitacaoPublica(service, {
      solicitacaoId: solicitacao.id,
      unidadeId: link.unidade_id,
      nome: d.nome,
      cargo: d.cargo,
      numPosicoes: d.num_posicoes,
      cidade: d.cidade,
      estado: d.estado,
      previsaoInicio: d.previsao_inicio,
      salario: d.salario,
      adicionaisSalariais: d.adicionais_salariais,
      horario: d.horario_texto,
      requisitos: d.requisitos,
      beneficios: d.beneficios,
      principaisAtividades: d.principais_atividades,
      observacoes: d.observacoes,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/solicitacao-vaga-publica]", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
