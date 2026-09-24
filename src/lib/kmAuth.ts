import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Quilometragem/Reembolsos expõe dado financeiro pessoal (km rodado, valores de reembolso).
// Sem isso, qualquer usuário autenticado podia forjar analista_id na URL e ler/editar/apagar
// registros de outro analista. "Gestor" (Fase 2b — migrado pro sistema central de exceção,
// ver podeAcessarAba): comportamento padrão continua PAPEIS_FULL_ACCESS/supervisor, mas uma
// exceção individual em usuario_acesso_customizado (chave_aba "reembolsos_quilometragem")
// sempre vence — libera quem o papel não liberaria, ou bloqueia quem o papel liberaria. O
// próprio analista_id nunca é afetado por isso: ver/editar os próprios registros continua
// liberado pra qualquer autenticado, independente de gestor.
export interface AcessoKm {
  analistaPerfilId: string | null;
  gestor: boolean;
  // Retrofit SBC: gestor sem acesso a todas as unidades (ex: supervisor) só gere o KM de
  // analistas da própria unidade. null = sem restrição (sócios) ou sem perfil.
  unidadeRestrita: string | null;
}

export async function resolverAcessoKm(user: User): Promise<AcessoKm> {
  const role = user.app_metadata?.role ?? "analista";

  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nivel_acesso, unidade_id, acesso_todas_unidades")
    .eq("user_id", user.id)
    .maybeSingle();

  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role) || perfil?.nivel_acesso === "supervisor";
  const gestor = await podeAcessarAba(user, "reembolsos_quilometragem", comportamentoPadrao);
  const unidadeRestrita = perfil && perfil.acesso_todas_unidades !== true ? perfil.unidade_id : null;
  return { analistaPerfilId: perfil?.id ?? null, gestor, unidadeRestrita };
}

// Gestor com unidade restrita só alcança analistas (analistas_perfil.id) da mesma unidade.
async function analistaNaUnidade(analistaId: string, unidadeRestrita: string | null): Promise<boolean> {
  if (!unidadeRestrita) return true;
  const svc = createServiceClient();
  const { data } = await svc.from("analistas_perfil").select("unidade_id").eq("id", analistaId).maybeSingle();
  return data?.unidade_id === unidadeRestrita;
}

// Para rotas que recebem analista_id explícito (query ou body). Sem id informado, nunca lista
// todo mundo por omissão: cai pro próprio analista_id do usuário, a não ser que ele seja
// gestor E a rota permita explicitamente o modo agregado (permitirTodosSemId). No modo
// agregado, unidadeRestrita diz a quem a rota deve limitar o "todos".
export async function autorizarAnalistaId(
  user: User,
  analistaIdSolicitado: string | null,
  opts: { permitirTodosSemId?: boolean } = {}
): Promise<{ analistaId: string | null; unidadeRestrita: string | null; erro: NextResponse | null }> {
  const { analistaPerfilId, gestor, unidadeRestrita } = await resolverAcessoKm(user);
  const negado = { analistaId: null, unidadeRestrita, erro: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }) };

  if (!analistaIdSolicitado) {
    if (gestor && opts.permitirTodosSemId) return { analistaId: null, unidadeRestrita, erro: null };
    if (!analistaPerfilId) {
      return {
        analistaId: null,
        unidadeRestrita,
        erro: NextResponse.json({ error: "analista_id é obrigatório." }, { status: 400 }),
      };
    }
    return { analistaId: analistaPerfilId, unidadeRestrita, erro: null };
  }

  if (analistaIdSolicitado === analistaPerfilId) {
    return { analistaId: analistaIdSolicitado, unidadeRestrita, erro: null };
  }
  if (gestor && (await analistaNaUnidade(analistaIdSolicitado, unidadeRestrita))) {
    return { analistaId: analistaIdSolicitado, unidadeRestrita, erro: null };
  }
  return negado;
}

// Para rotas que recebem id de registro/visita (não analista_id direto) — usar depois de
// buscar o analista_id dono do registro no banco.
export async function autorizarDonoRegistro(
  user: User,
  donoAnalistaId: string | null
): Promise<NextResponse | null> {
  const { analistaPerfilId, gestor, unidadeRestrita } = await resolverAcessoKm(user);
  if (donoAnalistaId && donoAnalistaId === analistaPerfilId) return null;
  if (gestor && donoAnalistaId && (await analistaNaUnidade(donoAnalistaId, unidadeRestrita))) return null;
  // Registro sem dono (analista_id nulo) só pra gestor sem restrição de unidade — sem dono
  // não dá pra saber de qual unidade é.
  if (gestor && !donoAnalistaId && !unidadeRestrita) return null;
  return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
}
