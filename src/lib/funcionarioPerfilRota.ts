import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { erroDeTabelaAusente, type Aviso } from "@/lib/funcionarioPerfil";
import { formatarDataISO, obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

export type ServicoSupabase = ReturnType<typeof createServiceClient>;

// Gate ÚNICO das rotas do editor de dados pessoais e filhos, na ordem: login (401) → papel do módulo Funcionários (403: analista comum fica fora) → unidade
// (404 para funcionário de outra unidade, sem confirmar que existe) → funcionário existe → 409 se ele TEM admissão (os dados vêm da admissão, nunca desta tabela).
export async function prepararEdicaoPerfil(funcionarioId: string): Promise<NextResponse | { user: User; svc: ServicoSupabase; hojeISO: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const negado = await checarPapelFuncionarios(user);
  if (negado) return negado;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, funcionarioId);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();
  const { data: funcionario } = await svc.from("funcionarios").select("id, admissao_id").eq("id", funcionarioId).maybeSingle();
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (funcionario.admissao_id) {
    return NextResponse.json({ error: "Este funcionário veio por admissão digital: os dados pessoais e os filhos vêm da admissão. Corrija pela admissão." }, { status: 409 });
  }
  return { user, svc, hojeISO: formatarDataISO(obterDataHojeBrasil()) };
}

export const respostaTabelaAusente = () =>
  NextResponse.json({ error: "O cadastro de dados pessoais de funcionários ainda não está disponível (migração pendente). Fale com o suporte." }, { status: 503 });

// Falha de escrita: tabela ausente = 503 claro; qualquer outro erro = 400 com a mensagem do banco.
export function respostaErroBanco(erro: { code?: string | null; message?: string | null }) {
  return erroDeTabelaAusente(erro) ? respostaTabelaAusente() : NextResponse.json({ error: erro.message ?? "Erro ao gravar." }, { status: 400 });
}

// 422 de AVISO (não é bloqueio): a tela mostra a mensagem e reenvia com confirmado:true.
export const respostaAviso = (aviso: Aviso) => NextResponse.json({ error: aviso.mensagem, aviso: true, codigo: aviso.codigo }, { status: 422 });

// Auditoria com o nome real de quem fez (resolverNomeUsuario), sempre na entidade "funcionarios".
export async function auditarPerfil(user: User, funcionarioId: string, acao: string, detalhes: Record<string, unknown>) {
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null),
    acao,
    entidade: "funcionarios",
    entidade_id: funcionarioId,
    detalhes,
  });
}
