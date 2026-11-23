// Férias (aviso de vencimento): o disparo diário (cron /api/cron/ferias-avisos). Para cada período ainda não gozado de quem está na regra da aba (ativo E
// Terceirização ou efetivado), com o saldo inicial resolvido, avisa quem está na lista do sino do evento ferias_vencimento quando faltam 90, 60 e 30 dias
// para a data-limite (e do "vencido"). As regras de data e de marco vêm de feriasRegras.ts (decidirAvisoFerias); aqui só se lê, envia e grava.
//
// Garantias (no padrão do cron de ASO):
//  - idempotente: depois do envio o registro (aviso_90_em / aviso_60_em / aviso_30_em; aviso_vencido_em para o vencido e os lembretes) fica gravado; rodar de novo no
//    mesmo dia não repete;
//  - migração pendente (tabelas de férias ou a coluna aviso_vencido_em ainda inexistentes): o cron FALHA DE FORMA CLARA E SEGURA: não envia nada, não marca nada e
//    devolve/loga o motivo (resumo.erro);
//  - o registro só é gravado DEPOIS do envio com sucesso; falha no envio não marca nada (tenta de novo no dia seguinte);
//  - sem destinatário configurado (ou canal desligado, ou ninguém que atenda a unidade) NADA é enviado e NADA é marcado: nenhum aviso se perde;
//  - funcionário em "Saldo inicial pendente", "Ainda não iniciou", "Informar data-base" ou "Data-base mudou" nunca dispara.
import type { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { EVENTO_FERIAS_VENCIMENTO } from "@/lib/avisosCatalogo";
import { formatarDataSemFuso } from "@/lib/utils";
import { colunasDeAviso, decidirAvisoFerias, DIAS_LEMBRETE_VENCIDO, diasRestantes, type DecisaoAvisoFerias } from "@/lib/feriasRegras";
import {
  aplicarMudancasAutomaticasFerias, LIMITE_AUTOMATICO_CRON, carregarDadosFerias, carregarElegiveis, ehErroColunaAvisoVencidoAusente, ehErroTabelaFeriasAusente, garantirPeriodosLote, montarEstado, type FuncionarioFerias,
} from "@/lib/feriasPeriodos";

type ServiceClient = ReturnType<typeof createServiceClient>;

export const TIPO_NOTIFICACAO_FERIAS = "ferias_vencimento";

export interface ResumoAvisosFerias {
  funcionarios: number;
  periodosComAviso: number;
  avisosEnviados: number; // notificações (uma por destinatário)
  marcos: number;
  vencidos: number;
  lembretes: number;
  semDestinatarios: number; // períodos que pediam aviso mas não tinham ninguém a quem avisar (nada marcado)
  falhas: number;
  mudancasAutomaticas?: number; // períodos que mudaram sozinhos de situação pelas datas (programada → em férias → tiradas)
  erro?: string;
}

// Motivo legível de uma falha de leitura: migração pendente (coluna ou tabelas de férias) é dita com todas as letras.
function motivoDoErro(erro: { code?: string | null; message?: string | null } | null | undefined): string {
  if (ehErroColunaAvisoVencidoAusente(erro)) {
    return "Migração pendente: falta a coluna ferias_periodos.aviso_vencido_em (supabase/migration_ferias_aviso_vencido.sql). Nada foi enviado nem marcado.";
  }
  if (ehErroTabelaFeriasAusente(erro)) return "Migração pendente: as tabelas de férias ainda não existem (supabase/migration_ferias_aviso.sql). Nada foi enviado nem marcado.";
  return erro?.message ?? "Erro ao ler as férias. Nada foi enviado nem marcado.";
}

export function montarAvisoFerias(d: DecisaoAvisoFerias, dados: { nome: string; empresa: string; dataLimite: string; dias: number }): { titulo: string; mensagem: string } {
  const limite = formatarDataSemFuso(dados.dataLimite);
  const nome = dados.nome.trim();
  if (d.tipo === "vencido") {
    const atraso = Math.abs(dados.dias);
    return {
      titulo: d.lembrete ? `Lembrete: férias VENCIDAS — ${nome}` : `Férias VENCIDAS — ${nome}`,
      mensagem: `${nome} (${dados.empresa}): a data-limite para tirar as férias (${limite}) passou há ${atraso} dia(s) e as férias não foram lançadas. Risco de pagamento em dobro. Programe com a contabilidade.`,
    };
  }
  return {
    titulo: `Férias a vencer — ${nome}`,
    mensagem: `${nome} (${dados.empresa}) precisa tirar as férias até ${limite}: ${dados.dias === 0 ? "vence hoje" : `faltam ${dados.dias} dia(s)`}. Programe com a contabilidade.`,
  };
}

// `lembreteDias`: intervalo do lembrete do "vencido" (padrão DIAS_LEMBRETE_VENCIDO; 0 = só o aviso único).
export async function executarAvisosFerias(
  svc: ServiceClient,
  hojeISO: string,
  agora: Date = new Date(),
  opcoes: { lembreteDias?: number } = {}
): Promise<ResumoAvisosFerias> {
  const resumo: ResumoAvisosFerias = { funcionarios: 0, periodosComAviso: 0, avisosEnviados: 0, marcos: 0, vencidos: 0, lembretes: 0, semDestinatarios: 0, falhas: 0 };
  const agoraISO = agora.toISOString();

  const funcionarios = await carregarElegiveis(svc, null);
  resumo.funcionarios = funcionarios.length;
  if (funcionarios.length === 0) return resumo;

  const { dados, erro } = await carregarDadosFerias(svc, funcionarios.map((f) => f.id));
  if (erro) {
    resumo.erro = motivoDoErro(erro);
    resumo.falhas++;
    console.error(`[cron/ferias-avisos] ${resumo.erro}`);
    return resumo;
  }
  // Os períodos que faltam são criados aqui também (aniversário de admissão): idempotente.
  const garantido = await garantirPeriodosLote(svc, funcionarios, dados, hojeISO);
  if (garantido.erro) {
    resumo.erro = motivoDoErro(garantido.erro);
    resumo.falhas++;
    console.error(`[cron/ferias-avisos] ${resumo.erro}`);
    return resumo;
  }

  // Antes de decidir qualquer aviso, a situação segue as datas programadas (assim o aviso de "programada com início vencido" não sai à toa). Se falhar, o cron para
  // aqui: nada é enviado nem marcado e o motivo volta no resumo.
  const auto = await aplicarMudancasAutomaticasFerias(svc, funcionarios, garantido.periodos, hojeISO, LIMITE_AUTOMATICO_CRON);
  resumo.mudancasAutomaticas = auto.alteradas;
  if (auto.erro) {
    resumo.erro = `Falha na mudança automática de situação das férias: ${motivoDoErro(auto.erro)}`;
    resumo.falhas++;
    console.error(`[cron/ferias-avisos] ${resumo.erro}`);
    return resumo;
  }
  const periodosAtuais = auto.periodos;

  const clienteIds = [...new Set(funcionarios.map((f) => f.cliente_id).filter((id): id is string => !!id))];
  const { data: clientes } = clienteIds.length > 0 ? await svc.from("clientes").select("id, nome").in("id", clienteIds) : { data: [] as { id: string; nome: string }[] };
  const nomeCliente = new Map((clientes ?? []).map((c) => [c.id as string, c.nome as string]));

  // Quem recebe, por unidade (supervisor só é avisado dos funcionários da própria unidade; sócios, de todas). Uma consulta por unidade.
  const destinatariosPorUnidade = new Map<string, { userIds: string[] } | "falhou">();
  async function destinatariosDa(f: FuncionarioFerias): Promise<string[] | null> {
    if (!destinatariosPorUnidade.has(f.unidade_id)) {
      const r = await resolverDestinatarios(EVENTO_FERIAS_VENCIMENTO, "sino", f.unidade_id, svc);
      destinatariosPorUnidade.set(f.unidade_id, r.falhou ? "falhou" : { userIds: r.modo === "configurado" ? r.userIds : [] });
    }
    const r = destinatariosPorUnidade.get(f.unidade_id)!;
    return r === "falhou" ? null : r.userIds;
  }

  for (const f of funcionarios) {
    const estado = montarEstado(f, dados, periodosAtuais.get(f.id) ?? [], hojeISO);
    // Só "ok": sem data-base, ainda não iniciou, data-base mudou e saldo pendente nunca disparam. (Estado "ok" já inclui o saldo calculado "nenhum".)
    if (estado.avaliacao.estado !== "ok") continue;

    for (const p of [...estado.periodos].sort((a, b) => a.numero - b.numero)) {
      if (p.situacao === "gozada") continue;
      const decisao = decidirAvisoFerias(p, hojeISO, true, opcoes.lembreteDias ?? DIAS_LEMBRETE_VENCIDO);
      if (!decisao) continue;
      resumo.periodosComAviso++;

      const userIds = await destinatariosDa(f);
      if (userIds === null) {
        console.error(`[cron/ferias-avisos] Erro ao ler os destinatários (unidade=${f.unidade_id}) — tenta de novo amanhã.`);
        resumo.falhas++;
        continue;
      }
      if (userIds.length === 0) {
        resumo.semDestinatarios++;
        continue; // sem ninguém a quem avisar: nada é enviado e NADA é marcado
      }

      const { titulo, mensagem } = montarAvisoFerias(decisao, {
        nome: f.nome_completo, empresa: (f.cliente_id ? nomeCliente.get(f.cliente_id) : null) ?? f.empresa ?? "—", dataLimite: p.data_limite, dias: diasRestantes(p.data_limite, hojeISO),
      });
      // Uma linha por destinatário em notificacoes_analista: a MESMA linha alimenta o sino e o popup (o popup segue o interruptor do canal).
      const linhas = userIds.map((user_id) => ({ tipo: TIPO_NOTIFICACAO_FERIAS, titulo, mensagem, user_id, candidato_id: null, funcionario_id: f.id, unidade_id: f.unidade_id }));
      const { error: erroEnvio } = await svc.from("notificacoes_analista").insert(linhas);
      if (erroEnvio) {
        console.error(`[cron/ferias-avisos] Falha ao enviar o aviso (funcionario_id=${f.id}, periodo=${p.numero}):`, erroEnvio.message);
        resumo.falhas++;
        continue; // não marca: tenta de novo amanhã
      }
      resumo.avisosEnviados += linhas.length;
      if (decisao.tipo === "marco") resumo.marcos++;
      else if (decisao.lembrete) resumo.lembretes++;
      else resumo.vencidos++;

      // Só agora, com o envio confirmado, grava o registro (marco enviado + marcos "já vistos").
      const { error: erroMarca } = await svc.from("ferias_periodos").update(colunasDeAviso(decisao, agoraISO)).eq("id", p.id);
      if (erroMarca) {
        console.error(`[cron/ferias-avisos] Aviso enviado, mas falhou ao marcar (funcionario_id=${f.id}, periodo=${p.numero}) — pode repetir amanhã:`, erroMarca.message);
        resumo.falhas++;
      }
    }
  }
  return resumo;
}
