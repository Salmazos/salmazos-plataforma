import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolverUnidadeUsuario, podeVerUnidade, type ContextoUnidade } from "@/lib/unidadeAuth";

// RH por unidade — DECISÃO DO OLVER (24/09), quando SBC ganhou os primeiros supervisores:
// quem acessa o RH (Admissões, Funcionários, Rescisões) sem ver todas as unidades — hoje,
// supervisor — só enxerga os registros da própria unidade. Os sócios (acesso a todas as
// unidades, que é quem faz o RH centralizado em Monte Mor/Hortolândia) seguem vendo tudo.
// Antes disso a regra era só por papel, sem unidade: um supervisor de SBC via CPF, salário
// e dados bancários dos funcionários de Monte Mor.
//
// Estas checagens vêm DEPOIS do gate de papel (checarPapelAdmissoes/checarPapelFuncionarios)
// — não substituem, só recortam por unidade. Registro de outra unidade responde 404, como no
// resto da Fase 3, pra não confirmar que o id existe.

const NAO_ENCONTRADO = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
const SEM_PERFIL = () => NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

// Pra listagens: contexto de unidade do usuário (null = sem perfil de analista, nega).
export async function contextoRH(user: User): Promise<ContextoUnidade | null> {
  return resolverUnidadeUsuario(user);
}

async function checarUnidade(user: User, unidadeId: string | null | undefined): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return SEM_PERFIL();
  if (!unidadeId || !podeVerUnidade(ctx, unidadeId)) return NAO_ENCONTRADO();
  return null;
}

export async function checarAcessoAdmissaoRH(user: User, admissaoId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("admissoes").select("unidade_id").eq("id", admissaoId).maybeSingle();
  if (!data) return NAO_ENCONTRADO();
  return checarUnidade(user, data.unidade_id);
}

export async function checarAcessoFuncionarioRH(user: User, funcionarioId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("funcionarios").select("unidade_id").eq("id", funcionarioId).maybeSingle();
  if (!data) return NAO_ENCONTRADO();
  return checarUnidade(user, data.unidade_id);
}

export async function checarAcessoRescisaoRH(user: User, rescisaoId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("rescisoes").select("unidade_id").eq("id", rescisaoId).maybeSingle();
  if (!data) return NAO_ENCONTRADO();
  return checarUnidade(user, data.unidade_id);
}

// ASO periódico e contrato não têm unidade própria — são do funcionário.
export async function checarAcessoAsoRH(user: User, asoId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("funcionario_asos").select("funcionario_id").eq("id", asoId).maybeSingle();
  if (!data) return NAO_ENCONTRADO();
  return checarAcessoFuncionarioRH(user, data.funcionario_id);
}

export async function checarAcessoContratoRH(user: User, contratoId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("funcionario_contratos").select("funcionario_id").eq("id", contratoId).maybeSingle();
  if (!data) return NAO_ENCONTRADO();
  return checarAcessoFuncionarioRH(user, data.funcionario_id);
}
