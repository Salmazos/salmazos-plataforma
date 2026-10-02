import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ehAberta, rotuloEtapa } from "@/lib/comercialRotulos";

export const ETAPAS = ["prospeccao", "contato_feito", "reuniao_visita", "proposta_enviada", "negociacao", "ganho", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];
// Derivado de ehAberta (inclui "negociacao" legado, que não se usa mais em registros novos).
export const ETAPAS_ABERTAS: Etapa[] = ETAPAS.filter(ehAberta);
export const RESULTADOS_COMERCIAIS = ["sem_interesse", "retornar", "quer_proposta", "fechou", "nao_encontrou"] as const;
export type ResultadoComercial = (typeof RESULTADOS_COMERCIAIS)[number];

export interface ContextoComercial {
  userId: string;
  analistaId: string;
  unidadeId: string | null;
  // Vendedor = perfil_comercial ligado: cria e edita só as próprias oportunidades.
  vendedor: boolean;
  // Gestor = diretoria/superuser: lê tudo (somente leitura), filtrando por vendedor/unidade.
  gestor: boolean;
  todasUnidades: boolean;
}

export async function resolverContextoComercial(user: User): Promise<ContextoComercial | null> {
  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nivel_acesso, unidade_id, acesso_todas_unidades, perfil_comercial, ativo")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!perfil || perfil.ativo === false) return null;
  const role = user.app_metadata?.role ?? "analista";
  const vendedor = perfil.perfil_comercial === true;
  const gestor = role === "superuser" || perfil.nivel_acesso === "diretoria" || perfil.nivel_acesso === "superuser";
  if (!vendedor && !gestor) return null;
  return {
    userId: user.id,
    analistaId: perfil.id,
    unidadeId: perfil.unidade_id ?? null,
    vendedor,
    gestor,
    todasUnidades: perfil.acesso_todas_unidades === true,
  };
}

export async function podeAcessarFunilComercial(user: User): Promise<boolean> {
  return (await resolverContextoComercial(user)) !== null;
}

export async function exigirContextoComercial(
  user: User | null
): Promise<{ ctx: ContextoComercial; erro: null } | { ctx: null; erro: NextResponse }> {
  if (!user) return { ctx: null, erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const ctx = await resolverContextoComercial(user);
  if (!ctx) return { ctx: null, erro: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }) };
  return { ctx, erro: null };
}

export function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Só pode existir UMA oportunidade aberta por empresa na unidade inteira (índice único parcial no
// banco). Devolve a mensagem com o vendedor responsável e a fase, ou null se a empresa está livre.
export async function mensagemOportunidadeAberta(
  svc: ReturnType<typeof createServiceClient>,
  empresaVisitadaId: string,
  ignorarId?: string
): Promise<string | null> {
  let q = svc
    .from("oportunidades")
    .select("vendedor_id, etapa")
    .eq("empresa_visitada_id", empresaVisitadaId)
    .not("etapa", "in", "(ganho,perdido)")
    .limit(1);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data: aberta } = await q.maybeSingle();
  if (!aberta) return null;
  const { data: vend } = await svc.from("analistas_perfil").select("nome_completo").eq("id", aberta.vendedor_id).maybeSingle();
  return `Já existe uma oportunidade aberta para esta empresa (vendedor: ${vend?.nome_completo ?? "—"}, fase: ${rotuloEtapa(aberta.etapa as string)}).`;
}
