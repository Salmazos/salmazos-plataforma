import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export const ETAPAS = ["prospeccao", "contato_feito", "reuniao_visita", "proposta_enviada", "negociacao", "ganho", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETAPAS_ABERTAS: Etapa[] = ["prospeccao", "contato_feito", "reuniao_visita", "proposta_enviada", "negociacao"];
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

const ORDEM_ETAPA: Record<string, number> = { prospeccao: 0, contato_feito: 1, reuniao_visita: 2, proposta_enviada: 3, negociacao: 4 };

const DIAS_RETORNO: Record<ResultadoComercial, number> = { sem_interesse: 30, retornar: 7, quer_proposta: 3, fechou: 1, nao_encontrou: 7 };
const TEXTO_PROXIMA_ACAO: Record<ResultadoComercial, string> = {
  sem_interesse: "Retomar contato (sem interesse na última visita)",
  retornar: "Retornar contato",
  quer_proposta: "Enviar proposta",
  fechou: "Confirmar fechamento",
  nao_encontrou: "Tentar novo contato (ninguém encontrado)",
};
const ETAPA_INICIAL: Record<ResultadoComercial, Etapa> = {
  sem_interesse: "contato_feito",
  retornar: "contato_feito",
  quer_proposta: "reuniao_visita",
  fechou: "negociacao",
  nao_encontrou: "prospeccao",
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface VisitaComercialInput {
  registroId: string;
  kmVisitaId: string | null;
  empresa: string;
  contato?: string | null;
  contatoTelefone?: string | null;
  contatoEmail?: string | null;
  motivo?: string | null;
  resumo?: string | null;
  resultadoComercial?: ResultadoComercial | null;
  clienteId?: string | null;
}

// Integração KM → Funil. Idempotente: a tela de KM apaga e regrava todas as visitas ao editar
// um registro, então a interação é chaveada por (oportunidade, km_registro_id) e uma regravação
// só atualiza a interação — nunca duplica nem reagenda a próxima ação. Chamar sempre dentro de
// try/catch: falha aqui não pode impedir o salvamento da KM.
export async function registrarVisitaNoFunil(svc: ServiceClient, input: VisitaComercialInput): Promise<void> {
  const { data: registro } = await svc.from("km_registros").select("analista_id, data").eq("id", input.registroId).maybeSingle();
  if (!registro?.analista_id) return;
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, perfil_comercial, unidade_id, ativo")
    .eq("id", registro.analista_id)
    .maybeSingle();
  if (!perfil || perfil.ativo === false || perfil.perfil_comercial !== true || !perfil.unidade_id) return;

  const resultado = input.resultadoComercial ?? null;
  const hoje = hojeSaoPaulo();
  const dataVisita: string = typeof registro.data === "string" ? registro.data.slice(0, 10) : hoje;
  let proximaEm = somarDias(dataVisita, DIAS_RETORNO[resultado ?? "retornar"]);
  if (proximaEm < hoje) proximaEm = hoje;
  const proximaAcao = TEXTO_PROXIMA_ACAO[resultado ?? "retornar"];

  const { data: carteira } = await svc
    .from("empresas_visitadas")
    .select("id, cliente_id")
    .ilike("nome", escapeLike(input.empresa))
    .eq("unidade_id", perfil.unidade_id)
    .limit(1)
    .maybeSingle();

  const { data: abertas } = await svc
    .from("oportunidades")
    .select("id, etapa, contato_nome, contato_telefone, contato_email, empresa_visitada_id, cliente_id")
    .eq("vendedor_id", perfil.id)
    .eq("unidade_id", perfil.unidade_id)
    .ilike("empresa", escapeLike(input.empresa))
    .in("etapa", ETAPAS_ABERTAS)
    .order("created_at", { ascending: false })
    .limit(1);
  let oportunidade = abertas?.[0] ?? null;
  let nova = false;

  if (!oportunidade) {
    const { data: criada, error } = await svc
      .from("oportunidades")
      .insert({
        unidade_id: perfil.unidade_id,
        vendedor_id: perfil.id,
        empresa: input.empresa,
        contato_nome: input.contato || null,
        contato_telefone: input.contatoTelefone || null,
        contato_email: input.contatoEmail || null,
        cliente_id: input.clienteId || carteira?.cliente_id || null,
        empresa_visitada_id: carteira?.id ?? null,
        origem: "km",
        etapa: ETAPA_INICIAL[resultado ?? "retornar"],
        proxima_acao: proximaAcao,
        proxima_acao_em: proximaEm,
      })
      .select("id, etapa, contato_nome, contato_telefone, contato_email, empresa_visitada_id, cliente_id")
      .single();
    if (error || !criada) throw new Error(error?.message ?? "falha ao criar oportunidade");
    oportunidade = criada;
    nova = true;
  }

  const descricao = [input.motivo, input.resumo].filter((x) => x && String(x).trim()).join(" — ") || "Visita registrada na KM";
  const { data: jaExiste } = await svc
    .from("oportunidade_interacoes")
    .select("id")
    .eq("oportunidade_id", oportunidade.id)
    .eq("km_registro_id", input.registroId)
    .maybeSingle();

  if (jaExiste) {
    // Regravação (edição do registro de KM): atualiza só a interação.
    await svc
      .from("oportunidade_interacoes")
      .update({ resultado, descricao, km_visita_id: input.kmVisitaId })
      .eq("id", jaExiste.id);
    return;
  }

  await svc.from("oportunidade_interacoes").insert({
    oportunidade_id: oportunidade.id,
    autor_id: perfil.id,
    tipo: "visita",
    resultado,
    descricao,
    km_visita_id: input.kmVisitaId,
    km_registro_id: input.registroId,
  });

  if (!nova) {
    const atualiza: Record<string, unknown> = { proxima_acao: proximaAcao, proxima_acao_em: proximaEm, updated_at: new Date().toISOString() };
    if (resultado) {
      const alvo = ETAPA_INICIAL[resultado];
      if ((ORDEM_ETAPA[alvo] ?? 0) > (ORDEM_ETAPA[oportunidade.etapa] ?? 0)) atualiza.etapa = alvo;
    }
    if (!oportunidade.contato_nome && input.contato) atualiza.contato_nome = input.contato;
    if (!oportunidade.contato_telefone && input.contatoTelefone) atualiza.contato_telefone = input.contatoTelefone;
    if (!oportunidade.contato_email && input.contatoEmail) atualiza.contato_email = input.contatoEmail;
    if (!oportunidade.empresa_visitada_id && carteira?.id) atualiza.empresa_visitada_id = carteira.id;
    await svc.from("oportunidades").update(atualiza).eq("id", oportunidade.id);
  }
}
