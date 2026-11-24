import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { checarAcessoAdmissaoRH } from "@/lib/rhUnidadeAuth";
import { STATUS_LINK_RENOVAVEL, TOKEN_VALIDADE_DIAS, linkVencido } from "@/lib/admissaoValidade";
import { ADMISSAO_STATUS_BADGE } from "@/lib/admissaoStatus";
import { dataBR } from "@/lib/dataBR";

interface Params {
  params: Promise<{ id: string }>;
}

// Renova o link público de admissão QUANDO ELE JÁ VENCEU: troca o token (o link antigo para de funcionar na hora) e dá mais TOKEN_VALIDADE_DIAS dias.
// Não mexe em status, dados preenchidos, documentos nem token_usado_em. O token (novo ou antigo) nunca vai para log nem para auditoria.
// A troca é UM UPDATE só, com a trava de status e de vencimento no próprio WHERE: se duas pessoas clicam juntas, só uma renova e a outra recebe 409.
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;
  const bloqueioUnidade = await checarAcessoAdmissaoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();
  const { data: atual, error: erroLeitura } = await svc.from("admissoes").select("id, status, token_expira_em").eq("id", id).maybeSingle();
  if (erroLeitura) return NextResponse.json({ error: "Não foi possível ler a admissão. Tente de novo." }, { status: 400 });
  if (!atual) return NextResponse.json({ error: "Admissão não encontrada." }, { status: 404 });

  if (!(STATUS_LINK_RENOVAVEL as readonly string[]).includes(atual.status)) {
    const rotulo = ADMISSAO_STATUS_BADGE[atual.status]?.label ?? atual.status;
    return NextResponse.json({ error: `Só dá para renovar o link de uma admissão que ainda está com o candidato (aguardando ou em preenchimento). Esta está em "${rotulo}".` }, { status: 400 });
  }

  const agora = new Date();
  if (!linkVencido(atual.token_expira_em, agora)) {
    return NextResponse.json({ error: `Este link ainda está válido (vence em ${dataBR(atual.token_expira_em)}). Só dá para renovar depois que vencer.` }, { status: 400 });
  }

  const tokenNovo = randomUUID();
  const renovadoEm = agora.toISOString();
  const validadeNova = new Date(agora.getTime() + TOKEN_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: renovada, error } = await svc
    .from("admissoes")
    .update({ token: tokenNovo, token_expira_em: validadeNova })
    .eq("id", id)
    .in("status", [...STATUS_LINK_RENOVAVEL])
    .lt("token_expira_em", renovadoEm)
    .select("id, token, token_expira_em, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Não foi possível renovar o link. Tente de novo." }, { status: 400 });
  if (!renovada) {
    return NextResponse.json({ error: "O link não foi renovado: outra pessoa pode ter acabado de renová-lo ou o status da admissão mudou. Atualize a página e confira." }, { status: 409 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "admissao_link_renovado",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { renovado_em: renovadoEm, validade_anterior: atual.token_expira_em, validade_nova: validadeNova, validade_dias: TOKEN_VALIDADE_DIAS, status: atual.status },
  });

  // A tela precisa do token novo para montar o link (Copiar link / WhatsApp); não vai para nenhum log.
  return NextResponse.json({ data: { id: renovada.id, token: renovada.token, token_expira_em: renovada.token_expira_em, status: renovada.status } });
}
