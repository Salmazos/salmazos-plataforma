import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import { carregarPessoasAtivas, type PessoaAtiva } from "@/lib/gestaoPessoas";
import { gestaoPessoasListaRHSchema, parseBody } from "@/lib/schemas";
import { formatarDataISO, obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import type { FiltrosGestao } from "@/lib/gestaoPessoasLista";

// Gate ÚNICO das rotas do RH da Gestão de Pessoas (lista e exportação), na mesma ordem da página:
// login → papel do módulo Funcionários → unidade → corpo validado → empresa dentro da unidade (404 para outra unidade) → pessoas ativas.
export async function prepararGestaoRH(request: Request): Promise<
  NextResponse | { user: User; cliente: { id: string; nome: string }; pessoas: PessoaAtiva[]; filtros: FiltrosGestao; hojeISO: string }
> {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const negado = await checarPapelFuncionarios(user);
  if (negado) return negado;
  const ctx = await contextoRH(user);
  if (!ctx) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const unidadeRH = ctx.todasUnidades ? null : ctx.unidadeId;

  const corpo = parseBody(gestaoPessoasListaRHSchema, await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ error: corpo.error }, { status: 400 });

  // empresa inválida, inexistente ou de outra unidade: 404 (não confirma que o id existe)
  const base = await carregarPessoasAtivas(createServiceClient(), { clienteId: corpo.data.clienteId, unidadeRH });
  if (!base) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  return { user, cliente: base.cliente, pessoas: base.pessoas, filtros: corpo.data.filtros as FiltrosGestao, hojeISO: formatarDataISO(obterDataHojeBrasil()) };
}
