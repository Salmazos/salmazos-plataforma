import type { createServiceClient } from "@/lib/supabase/server";
import { apelidoDoNomeCompleto } from "@/lib/responsaveis";
import { STATUS_ATIVOS, type Beneficiario, type Lancamento } from "@/lib/comissao";
import { calcularComissao, competenciaAtual, competenciaDoInstante, dentroDaFolga, mesAnteriorDe, selecionarParaFechamento } from "@/lib/comissaoRegras";
import { competenciaFechavel, competenciaNoControle, diasEntre, janelaDeLembrete, type JanelaLembrete } from "@/lib/comissaoPendenciasRegras";

// Pendências de comissão (rede de segurança): o que o beneficiário ainda não lançou e o que a diretoria ainda não fez. É ESTADO, não
// evento: sai do banco a cada consulta (popup ao entrar, sino diário), então não existe "esqueceu de avisar" nem aviso que se perde.

type Service = ReturnType<typeof createServiceClient>;

export interface CobrancaSemComissao {
  id: string;
  cliente: string | null;
  vaga: string | null;
  gerado_por_user_id: string | null;
  responsavel_vaga: string | null;
  enviado_em: string;
  competencia: string;
  fee_valor: number;
  unidade_id: string;
}

// Cobranças R&S de contratação já enviadas (enviada/validada/paga; nunca cancelada nem em revisão), com fee, fora reposição por garantia,
// dos meses de competência pedidos (a partir do início do controle) e SEM comissão ativa de ninguém. Mesma elegibilidade de "Cobranças para marcar".
export async function cobrancasSemComissao(svc: Service, o: { competencias: readonly string[] }): Promise<CobrancaSemComissao[]> {
  // Mês anterior ao início do controle no sistema (planilha): nunca é "sem comissão marcada" (ver COMISSAO_CONTROLE_INICIO). Vale para o
  // possível esquecimento da diretoria e para o popup/sino do beneficiário, que passam todos por aqui.
  const competenciasNoControle = o.competencias.filter(competenciaNoControle);
  if (competenciasNoControle.length === 0) return [];
  const { data, error } = await svc
    .from("cobrancas_rs")
    .select("id, vaga_id, status, fee_valor, enviado_em, gerado_por_user_id, cliente_nome_snapshot, unidade_id")
    .eq("tipo", "contratacao")
    .in("status", ["aprovada_enviada", "validada", "paga"])
    .not("enviado_em", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Não foi possível ler as cobranças: ${error.message}`);
  const linhas = ((data ?? []) as unknown as {
    id: string; vaga_id: string; fee_valor: number | null; enviado_em: string | null; gerado_por_user_id: string | null; cliente_nome_snapshot: string | null; unidade_id: string;
  }[]).filter((c) => c.enviado_em && Number(c.fee_valor) > 0 && competenciasNoControle.includes(competenciaDoInstante(c.enviado_em)));
  if (linhas.length === 0) return [];

  const ids = linhas.map((c) => c.id);
  const { data: ativas } = await svc.from("comissao_lancamentos").select("cobranca_id").eq("tipo", "comissao").in("status", STATUS_ATIVOS).in("cobranca_id", ids);
  const comComissao = new Set((ativas ?? []).map((a) => a.cobranca_id as string));
  const { data: vagas } = await svc.from("vagas").select("id, titulo, responsavel, reposicao_de_candidato_vaga_id").in("id", [...new Set(linhas.map((c) => c.vaga_id))]);
  const vagaPorId = new Map((vagas ?? []).map((v) => [v.id as string, v]));

  const saida: CobrancaSemComissao[] = [];
  for (const c of linhas) {
    if (comComissao.has(c.id)) continue;
    const vaga = vagaPorId.get(c.vaga_id);
    if (vaga?.reposicao_de_candidato_vaga_id) continue;
    saida.push({
      id: c.id, cliente: c.cliente_nome_snapshot, vaga: (vaga?.titulo as string | undefined) ?? null, gerado_por_user_id: c.gerado_por_user_id,
      responsavel_vaga: ((vaga?.responsavel as string | undefined) ?? "").trim() || null, enviado_em: c.enviado_em as string,
      competencia: competenciaDoInstante(c.enviado_em as string), fee_valor: Number(c.fee_valor), unidade_id: c.unidade_id,
    });
  }
  return saida;
}

// ── Beneficiário ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ItemParaLancar {
  id: string;
  cliente: string | null;
  vaga: string | null;
  enviado_em: string;
  competencia: string;
  comissao_prevista: number;
}

export interface PendenciasBeneficiario {
  // Cobranças SUAS (gerada por você ou vaga sob sua responsabilidade) ainda sem comissão marcada por ninguém, dentro do prazo.
  a_lancar: ItemParaLancar[];
  contestadas: number;
  janela: JanelaLembrete | null;
}

// "Sua" = gerou a cobrança ou é o responsável da vaga (a marcação continua sempre explícita; isto só decide para quem lembrar).
export function ehCobrancaDoBeneficiario(c: Pick<CobrancaSemComissao, "gerado_por_user_id" | "responsavel_vaga">, userId: string, b: Pick<Beneficiario, "nome_completo">): boolean {
  if (c.gerado_por_user_id && c.gerado_por_user_id === userId) return true;
  const resp = c.responsavel_vaga;
  return !!resp && (resp === b.nome_completo || resp === apelidoDoNomeCompleto(b.nome_completo));
}

export async function pendenciasDoBeneficiario(svc: Service, o: { beneficiario: Beneficiario; userId: string; agora?: Date }): Promise<PendenciasBeneficiario> {
  const agora = o.agora ?? new Date();
  const atual = competenciaAtual(agora);
  // Mês corrente sempre; o anterior só enquanto vale o prazo (dias 1 a 3): é o que a rota de marcar aceitaria.
  const competencias = dentroDaFolga(agora) ? [atual, mesAnteriorDe(atual)] : [atual];
  const todas = await cobrancasSemComissao(svc, { competencias });
  const minhas = todas.filter((c) => ehCobrancaDoBeneficiario(c, o.userId, o.beneficiario));
  const { data: cont } = await svc.from("comissao_lancamentos").select("id").eq("beneficiario_id", o.beneficiario.id).eq("status", "contestada").eq("tipo", "comissao");
  return {
    a_lancar: minhas.map((c) => ({ id: c.id, cliente: c.cliente, vaga: c.vaga, enviado_em: c.enviado_em, competencia: c.competencia, comissao_prevista: calcularComissao(c.fee_valor, o.beneficiario.percentual) })),
    contestadas: (cont ?? []).length,
    janela: janelaDeLembrete(agora),
  };
}

// ── Diretoria ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PendenciasDiretoria {
  contestadas: { qtd: number; mais_antiga_em: string | null };
  // Mês que já pode fechar (prazo de lançamento encerrado) e, por unidade, o que espera fechamento. null = nada a fechar.
  fechamento: { competencia: string; unidades: { unidade_id: string; unidade: string | null; qtd: number; total: number; bloqueios: number }[] } | null;
  pagamento: { fechamento_id: string; competencia: string; unidade: string | null; total: number; dias: number }[];
  // Cobranças de beneficiário que ficaram sem comissão e cujo prazo terminou, com o fechamento do mês ainda não feito.
  esquecidas: { competencia: string; itens: { id: string; cliente: string | null; vaga: string | null; gerada_por: string | null; enviado_em: string }[] } | null;
}

export async function pendenciasDaDiretoria(svc: Service, o: { unidadeId: string | null; agora?: Date }): Promise<PendenciasDiretoria> {
  const agora = o.agora ?? new Date();
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const fechavel = competenciaFechavel(agora);

  let q = svc.from("comissao_lancamentos").select("*");
  if (o.unidadeId) q = q.eq("unidade_id", o.unidadeId);
  const { data: lancsRaw, error } = await q;
  if (error) throw new Error(`Não foi possível ler as comissões: ${error.message}`);
  const lancs = (lancsRaw ?? []) as Lancamento[];

  let qf = svc.from("comissao_fechamentos").select("*");
  if (o.unidadeId) qf = qf.eq("unidade_id", o.unidadeId);
  const { data: fechsRaw } = await qf;
  const fechs = (fechsRaw ?? []) as { id: string; competencia: string; unidade_id: string; total: number | string; fechado_em: string; pago_em: string | null }[];
  const { data: unidadesRaw } = await svc.from("unidades").select("id, slug");
  const nomeUnidade = new Map((unidadesRaw ?? []).map((u) => [u.id as string, u.slug as string]));

  // 1) contestações paradas
  const contestadas = lancs.filter((l) => l.tipo === "comissao" && l.status === "contestada");
  const maisAntiga = contestadas.map((l) => l.contestado_em).filter((x): x is string => !!x).sort()[0] ?? null;

  // 2) fechamento liberado: o mês `fechavel` ainda sem fechamento, por unidade, com o que entraria (mesma regra da prévia/função SQL)
  const abertos = lancs.filter((l) => !l.fechamento_id);
  const origensFechadas = new Set(lancs.filter((l) => l.fechamento_id).map((l) => l.id));
  const unidades = [...new Set(abertos.map((l) => l.unidade_id))];
  const linhasFech: NonNullable<PendenciasDiretoria["fechamento"]>["unidades"] = [];
  for (const u of unidades) {
    if (fechs.some((f) => f.unidade_id === u && f.competencia === fechavel)) continue;
    // Já existe fechamento de mês posterior: este mês não pode mais ser fechado (a função SQL recusa); não é pendência.
    if (fechs.some((f) => f.unidade_id === u && f.competencia > fechavel)) continue;
    const sel = selecionarParaFechamento(abertos.filter((l) => l.unidade_id === u), fechavel, origensFechadas);
    const qtd = sel.comissoes.length + sel.ajustes.length;
    if (qtd > 0) linhasFech.push({ unidade_id: u, unidade: nomeUnidade.get(u) ?? null, qtd, total: sel.total, bloqueios: sel.bloqueios.length });
  }

  // 3) fechamento sem pagamento
  const pagamento = fechs
    .filter((f) => !f.pago_em)
    .map((f) => ({ fechamento_id: f.id, competencia: f.competencia, unidade: nomeUnidade.get(f.unidade_id) ?? null, total: Number(f.total), dias: diasEntre(f.fechado_em, hoje) }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  // 4) possível esquecimento: cobrança de BENEFICIÁRIO ativo sem comissão no mês cujo prazo já terminou (e que ainda não foi fechado)
  let esquecidas: PendenciasDiretoria["esquecidas"] = null;
  if (!dentroDaFolga(agora)) {
    const mes = mesAnteriorDe(competenciaAtual(agora));
    const { data: bens } = await svc.from("comissao_beneficiarios").select("analista_perfil_id, ativo");
    const perfisAtivos = (bens ?? []).filter((b) => b.ativo).map((b) => b.analista_perfil_id as string);
    const { data: perfis } = perfisAtivos.length ? await svc.from("analistas_perfil").select("id, user_id, nome_completo").in("id", perfisAtivos) : { data: [] };
    const nomePorUser = new Map((perfis ?? []).filter((p) => p.user_id).map((p) => [p.user_id as string, (p.nome_completo as string | null) ?? null]));
    const sem = (await cobrancasSemComissao(svc, { competencias: [mes] })).filter(
      (c) => !!c.gerado_por_user_id && nomePorUser.has(c.gerado_por_user_id) && (!o.unidadeId || c.unidade_id === o.unidadeId) && !fechs.some((f) => f.unidade_id === c.unidade_id && f.competencia >= mes)
    );
    if (sem.length > 0) {
      esquecidas = { competencia: mes, itens: sem.map((c) => ({ id: c.id, cliente: c.cliente, vaga: c.vaga, gerada_por: nomePorUser.get(c.gerado_por_user_id as string) ?? null, enviado_em: c.enviado_em })) };
    }
  }

  return {
    contestadas: { qtd: contestadas.length, mais_antiga_em: maisAntiga },
    fechamento: linhasFech.length > 0 ? { competencia: fechavel, unidades: linhasFech } : null,
    pagamento,
    esquecidas,
  };
}

export const temPendenciaDiretoria = (p: PendenciasDiretoria): boolean => p.contestadas.qtd > 0 || !!p.fechamento || p.pagamento.length > 0 || !!p.esquecidas;
export const temPendenciaBeneficiario = (p: PendenciasBeneficiario): boolean => p.a_lancar.length > 0 || p.contestadas > 0;
