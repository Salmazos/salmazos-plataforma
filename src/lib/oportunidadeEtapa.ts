import type { z } from "zod";
import type { createServiceClient } from "@/lib/supabase/server";
import type { oportunidadeUpdateSchema } from "@/lib/schemas";
import { hojeSaoPaulo, somarDias, mensagemOportunidadeAberta } from "@/lib/comercial";
import { ehAberta, rotuloEtapa, ROTULO_MOTIVO_PERDA } from "@/lib/comercialRotulos";

type ServiceClient = ReturnType<typeof createServiceClient>;
// "negociacao" é legado (o schema da rota não a aceita em escrita), mas a coluna e o CHECK do banco a aceitam e
// ehAberta a trata como aberta: chamadores internos (Propostas) podem usá-la.
export type OportunidadeUpdate = Omit<z.infer<typeof oportunidadeUpdateSchema>, "etapa"> & {
  etapa?: z.infer<typeof oportunidadeUpdateSchema>["etapa"] | "negociacao";
};
// Linha de `oportunidades` (select "*"): o código sempre leu essa linha sem tipagem própria.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OportunidadeLinha = Record<string, any>;

export type ResultadoAtualizacaoOportunidade =
  | { ok: true; data: OportunidadeLinha }
  | { ok: false; status: number; error: string };

// Regras de atualização/mudança de fase de uma oportunidade, extraídas de PATCH /api/comercial/oportunidades/[id]
// para serem reaproveitadas (a rota continua sendo a mesma, com o mesmo comportamento). Quem chama já fez a
// autenticação e a checagem de dono; `atual` é a linha lida (select "*") e `analistaId` é o vendedor logado.
export async function atualizarOportunidade(
  svc: ServiceClient,
  analistaId: string,
  atual: OportunidadeLinha,
  d: OportunidadeUpdate
): Promise<ResultadoAtualizacaoOportunidade> {
  const id = atual.id as string;
  const falha = (status: number, error: string): ResultadoAtualizacaoOportunidade => ({ ok: false, status, error });

  const novaEtapa = d.etapa ?? atual.etapa;
  const aberta = ehAberta(novaEtapa);
  const proximaAcao = d.proxima_acao ?? atual.proxima_acao;
  const proximaEm = d.proxima_acao_em ?? atual.proxima_acao_em;

  if (aberta && (!proximaAcao || !proximaEm)) {
    return falha(400, "Informe a próxima ação e a data.");
  }
  const motivoPerda = d.motivo_perda ?? atual.motivo_perda;
  const categoriaPerda = d.motivo_perda_categoria ?? atual.motivo_perda_categoria ?? null;

  // Valor e serviço só passam a ser exigidos a partir de "Proposta enviada" (e na venda fechada).
  if (d.etapa === "proposta_enviada" || d.etapa === "ganho") {
    const valor = d.valor_estimado !== undefined ? d.valor_estimado : atual.valor_estimado;
    const servico = d.servico_interesse !== undefined ? d.servico_interesse : atual.servico_interesse;
    if (valor == null || !(Number(valor) > 0)) {
      return falha(400, "Informe o valor estimado (maior que zero) para avançar para esta fase.");
    }
    if (!servico || !String(servico).trim()) {
      return falha(400, "Informe o serviço de interesse para avançar para esta fase.");
    }
  }
  if (d.etapa === "perdido") {
    if (!categoriaPerda) {
      return falha(400, "Escolha o motivo de a oportunidade não ter avançado desta vez.");
    }
    if (categoriaPerda === "outro" && !motivoPerda?.trim()) {
      return falha(400, "Descreva o motivo, já que você escolheu \"Outro motivo\".");
    }
  }

  // "Não desta vez" agenda um lembrete de reconexão: padrão hoje + 90 dias, nunca no passado.
  let reconectarEm: string | null = null;
  if (d.etapa === "perdido") {
    const hoje = hojeSaoPaulo();
    reconectarEm = d.reconectar_em ?? somarDias(hoje, 90);
    if (reconectarEm < hoje) {
      return falha(400, "A data para reconectar não pode ser no passado.");
    }
  }

  // Contato: precisa ser da mesma empresa da oportunidade. Os campos contato_* da oportunidade são
  // um snapshot do contato escolhido; contato nulo limpa tudo.
  let contatoEscolhido: { id: string; nome: string; telefone: string | null; email: string | null } | null = null;
  if (d.contato_id) {
    const { data: c } = await svc
      .from("empresa_contatos")
      .select("id, nome, telefone, email, empresa_visitada_id")
      .eq("id", d.contato_id)
      .maybeSingle();
    if (!c || !atual.empresa_visitada_id || c.empresa_visitada_id !== atual.empresa_visitada_id) {
      return falha(400, "Esse contato não pertence à empresa da oportunidade.");
    }
    contatoEscolhido = c;
  }

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["proxima_acao", "proxima_acao_em", "valor_estimado", "servico_interesse", "contato_nome", "contato_telefone", "contato_email"] as const) {
    if (d[k] !== undefined) campos[k] = d[k] === "" ? null : d[k];
  }
  if (d.contato_id !== undefined) {
    campos.contato_id = contatoEscolhido?.id ?? null;
    campos.contato_nome = contatoEscolhido?.nome ?? null;
    campos.contato_telefone = contatoEscolhido?.telefone ?? null;
    campos.contato_email = contatoEscolhido?.email ?? null;
  }
  if (d.etapa) {
    campos.etapa = d.etapa;
    if (d.etapa === "ganho" || d.etapa === "perdido") {
      campos.fechada_em = atual.fechada_em ?? new Date().toISOString();
      campos.motivo_perda = d.etapa === "perdido" ? motivoPerda?.trim() || null : null;
      campos.motivo_perda_categoria = d.etapa === "perdido" ? categoriaPerda : null;
    } else {
      // Reabrir (ganho/perdido → fase aberta) limpa tudo que era do resultado final.
      campos.fechada_em = null;
      campos.motivo_perda = null;
      campos.motivo_perda_categoria = null;
    }
  }

  const { data, error } = await svc.from("oportunidades").update(campos).eq("id", id).select().single();
  if (error) {
    // Reabrir esbarrou no índice de uma-aberta-por-empresa.
    if (error.code === "23505") {
      const msg = (atual.empresa_visitada_id ? await mensagemOportunidadeAberta(svc, atual.empresa_visitada_id, id) : null)
        ?? "Já existe uma oportunidade aberta para esta empresa.";
      return falha(409, msg);
    }
    return falha(400, error.message);
  }

  const agora = new Date().toISOString();
  if (d.etapa === "perdido" && reconectarEm) {
    const { data: pendente } = await svc
      .from("lembretes")
      .select("id")
      .eq("oportunidade_id", id)
      .eq("tipo", "reconectar")
      .eq("status", "pendente")
      .maybeSingle();
    const { error: lembErr } = pendente
      ? await svc.from("lembretes").update({ data_lembrete: reconectarEm, contato_id: data.contato_id ?? null, updated_at: agora }).eq("id", pendente.id)
      : await svc.from("lembretes").insert({
          vendedor_id: analistaId,
          unidade_id: atual.unidade_id,
          empresa_visitada_id: atual.empresa_visitada_id ?? null,
          oportunidade_id: id,
          contato_id: data.contato_id ?? null,
          tipo: "reconectar",
          data_lembrete: reconectarEm,
          texto: `Reconectar com ${atual.empresa}`,
          status: "pendente",
        });
    if (lembErr) {
      // Sem lembrete a perda ficaria sem rede de segurança: desfaz a mudança e avisa.
      await svc.from("oportunidades").update({
        etapa: atual.etapa, fechada_em: atual.fechada_em, motivo_perda: atual.motivo_perda,
        motivo_perda_categoria: atual.motivo_perda_categoria ?? null, updated_at: atual.updated_at,
      }).eq("id", id);
      return falha(500, `Não foi possível criar o lembrete de reconexão: ${lembErr.message}`);
    }
  } else if (d.etapa && (d.etapa === "ganho" || (aberta && atual.etapa === "perdido"))) {
    // Venda fechada ou oportunidade reaberta: o lembrete de reconexão deixa de fazer sentido.
    const { error: cancErr } = await svc
      .from("lembretes")
      .update({ status: "cancelado", concluido_em: agora, updated_at: agora })
      .eq("oportunidade_id", id)
      .eq("tipo", "reconectar")
      .eq("status", "pendente");
    if (cancErr) return falha(500, `Fase alterada, mas não foi possível cancelar o lembrete: ${cancErr.message}`);
  }

  if (d.etapa && d.etapa !== atual.etapa) {
    let detalhePerda = "";
    if (d.etapa === "perdido" && categoriaPerda) {
      const rotulo = ROTULO_MOTIVO_PERDA[categoriaPerda] ?? categoriaPerda;
      const texto = motivoPerda?.trim();
      detalhePerda = categoriaPerda === "outro" ? ` (${texto})` : texto ? ` (${rotulo}: ${texto})` : ` (${rotulo})`;
    }
    await svc.from("oportunidade_interacoes").insert({
      oportunidade_id: id,
      autor_id: analistaId,
      tipo: "mudanca_etapa",
      descricao: `Fase alterada: ${rotuloEtapa(atual.etapa)} → ${rotuloEtapa(d.etapa)}${detalhePerda}${reconectarEm ? ` · Reconectar em ${reconectarEm.split("-").reverse().join("/")}` : ""}`,
    });
  }
  return { ok: true, data };
}
