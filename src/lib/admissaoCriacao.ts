import { SITE_URL } from "@/lib/siteUrl";
import type { z } from "zod";
import type { createServiceClient } from "@/lib/supabase/server";
import type { admissaoCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";

type Service = ReturnType<typeof createServiceClient>;

export const TOKEN_VALIDADE_DIAS = 5;

export type DadosCriacaoAdmissao = z.infer<typeof admissaoCreateSchema>;

export type ResultadoCriacaoAdmissao =
  // `admissaoId` vem mesmo na falha quando a linha de admissoes chegou a ser criada, para o chamador poder desfazer.
  | { ok: true; admissao: Record<string, unknown> & { id: string; token: string }; url: string }
  | { ok: false; error: string; admissaoId?: string };

export function urlAdmissao(token: string): string {
  return `${SITE_URL}/admissao/${token}`;
}

// Cria a admissão (linha + checklist de documentos + adicionais + autorização sindical) e devolve token/URL.
// NÃO envia nada: e-mail e link de WhatsApp são decisão do chamador (POST /api/admissoes envia na hora; a aprovação
// de indicação direta só cria e deixa o envio para a analista, em Admissões). A vaga e a permissão do usuário já
// foram validadas por quem chama; `unidadeId` é a da vaga.
export async function criarAdmissaoSemEnvio(
  svc: Service,
  o: {
    dados: DadosCriacaoAdmissao;
    unidadeId: string;
    usuario: { id: string; nome: string | null };
  }
): Promise<ResultadoCriacaoAdmissao> {
  const { candidato_id, vaga_id, modalidade, funcao, salario, tipo_salario, horario_trabalho, data_admissao, entidade_contratante, adicionais, autorizacao_sindical, admissao_qtd_dias_teste } = o.dados;

  const tokenExpiraEm = new Date(Date.now() + TOKEN_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .insert({
      candidato_id,
      vaga_id,
      unidade_id: o.unidadeId,
      modalidade,
      funcao,
      salario,
      tipo_salario,
      horario_trabalho,
      data_admissao,
      entidade_contratante,
      criado_por: o.usuario.id,
      token_expira_em: tokenExpiraEm,
    })
    .select()
    .single();

  if (error || !admissao) return { ok: false, error: error?.message ?? "Não foi possível criar a admissão." };

  // apenasPainel fica de fora do seed automático — só passa a existir
  // quando o RH decide usá-lo manualmente pela aba Documentos, não como um card sempre
  // presente (e vazio) igual aos demais tipos.
  const documentosRows = DOCUMENTOS_ADMISSAO.filter((doc) => !doc.apenasPainel).map((doc) => ({
    admissao_id: admissao.id,
    tipo_documento: doc.tipo_documento,
    obrigatorio: doc.obrigatorio,
    condicional: doc.condicional,
  }));

  const { error: docsError } = await svc.from("admissao_documentos").insert(documentosRows);
  if (docsError) return { ok: false, error: docsError.message, admissaoId: admissao.id };

  if (adicionais && adicionais.length > 0) {
    const adicionaisRows = adicionais.map((a) => ({
      admissao_id: admissao.id,
      tipo: a.tipo,
      formato_valor: a.formato_valor,
      valor: a.valor,
    }));
    const { error: adicionaisError } = await svc.from("admissao_adicionais").insert(adicionaisRows);
    if (adicionaisError) return { ok: false, error: adicionaisError.message, admissaoId: admissao.id };
  }

  if (autorizacao_sindical) {
    const { error: asError } = await svc.from("admissao_autorizacao_sindical").insert({
      admissao_id: admissao.id,
      nome_sindicato: autorizacao_sindical.nome_sindicato ?? null,
      autoriza_assistencial_confederativa: autorizacao_sindical.autoriza_assistencial_confederativa,
      autoriza_sindical: autorizacao_sindical.autoriza_sindical,
    });
    if (asError) return { ok: false, error: asError.message, admissaoId: admissao.id };
  }

  // O RH corrigiu a quantidade de dias de teste: grava na candidatura de origem (a fonte que todas as telas do RH leem), com
  // auditoria do antes/depois. Sem a chave no corpo, a candidatura não é tocada.
  if (admissao_qtd_dias_teste !== undefined) {
    const { data: cvAtual } = await svc.from("candidatos_vagas").select("admissao_qtd_dias_teste").eq("candidato_id", candidato_id).eq("vaga_id", vaga_id).maybeSingle();
    const antes = cvAtual?.admissao_qtd_dias_teste ?? null;
    if (cvAtual && antes !== admissao_qtd_dias_teste) {
      const { error: qtdError } = await svc.from("candidatos_vagas").update({ admissao_qtd_dias_teste }).eq("candidato_id", candidato_id).eq("vaga_id", vaga_id);
      if (qtdError) return { ok: false, error: qtdError.message, admissaoId: admissao.id };
      registrarAuditoria({
        usuario_id: o.usuario.id,
        usuario_nome: o.usuario.nome,
        acao: "admissao_qtd_dias_teste_ajustada_pelo_rh",
        entidade: "admissoes",
        entidade_id: admissao.id,
        detalhes: { candidato_id, vaga_id, antes, depois: admissao_qtd_dias_teste },
      });
    }
  }

  registrarAuditoria({
    usuario_id: o.usuario.id,
    usuario_nome: o.usuario.nome,
    acao: "admissao_criada",
    entidade: "admissoes",
    entidade_id: admissao.id,
    detalhes: { candidato_id, vaga_id: vaga_id ?? null, modalidade, funcao, salario, tipo_salario, horario_trabalho, data_admissao },
  });

  return { ok: true, admissao, url: urlAdmissao(admissao.token) };
}

// Desfaz uma admissão criada nesta requisição (checklist, adicionais e autorização sindical caem junto: ON DELETE CASCADE).
export async function removerAdmissaoCriada(svc: Service, admissaoId: string): Promise<string | null> {
  const { error } = await svc.from("admissoes").delete().eq("id", admissaoId);
  return error ? error.message : null;
}
