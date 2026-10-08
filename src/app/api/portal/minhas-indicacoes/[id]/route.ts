import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, portalEditarIndicacaoSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { hojeBrasiliaISO } from "@/lib/rescisaoProgramada";
import { avisarIndicacaoEditada } from "@/lib/avisoIndicacaoEditada";
import {
  CAMPOS_ADMISSAO,
  ROTULO_CAMPO,
  calcularDiff,
  campoDaAdmissao,
  montarLinhasAviso,
  notasDePropagacao,
  planejarPropagacaoCandidato,
  podeEditarIndicacao,
  validarDataInicio,
  validarVagaNova,
  type Alteracao,
  type CampoEditavel,
  type MotivoNaoPropagado,
  type VagaResumo,
} from "@/lib/indicacaoEdicao";

interface Params {
  params: Promise<{ id: string }>;
}

type Service = ReturnType<typeof createServiceClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const MSG_EM_ANDAMENTO = "Esta indicação já está em andamento. Fale com a Salmazos.";
const MSG_MUDOU = "A indicação mudou. Recarregue a página e tente de novo.";

// cliente_id e o usuário vêm SEMPRE do servidor (auth + cliente_usuarios); nada disso é lido do body.
async function identificar() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const service = createServiceClient();
  const { data: cu } = await service.from("cliente_usuarios").select("cliente_id").eq("user_id", user.id).single();
  if (!cu) return { erro: NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 }) };
  return { user, service, clienteId: cu.cliente_id as string };
}

// A indicação precisa ser do cliente E do usuário logado (a mesma regra da listagem).
async function carregarSolicitacao(service: Service, id: string, clienteId: string, userId: string): Promise<Linha | null> {
  const { data } = await service
    .from("solicitacoes_indicacao_candidato")
    .select("*")
    .eq("id", id)
    .eq("cliente_id", clienteId)
    .eq("solicitado_por_user_id", userId)
    .maybeSingle();
  return data ?? null;
}

// Falha fechado: qualquer erro ao ler a candidatura/admissão = não editável.
async function avaliarEdicao(service: Service, sol: Linha): Promise<{ pode: boolean }> {
  if (sol.status !== "aprovada") return podeEditarIndicacao({ status: sol.status, vagaId: sol.vaga_id, etapa: null, admissoes: [] });
  const [cv, adm] = await Promise.all([
    sol.candidatos_vaga_id
      ? service.from("candidatos_vagas").select("id, etapa").eq("id", sol.candidatos_vaga_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sol.candidato_id
      ? service.from("admissoes").select("vaga_id, status").eq("candidato_id", sol.candidato_id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cv.error || adm.error) {
    console.error("[portal/minhas-indicacoes] Erro ao avaliar se a indicação pode ser editada:", cv.error ?? adm.error);
    return { pode: false };
  }
  return podeEditarIndicacao({ status: sol.status, vagaId: sol.vaga_id, etapa: cv.data?.etapa ?? null, admissoes: adm.data ?? [] });
}

const publico = (s: Linha) => ({
  id: s.id,
  candidato_nome: s.candidato_nome,
  vaga_id: s.vaga_id,
  status: s.status,
  motivo_recusa: s.motivo_recusa ?? null,
  decidido_em: s.decidido_em ?? null,
  created_at: s.created_at,
});

// Dados para pré-preencher o modal de edição. O caminho do currículo no bucket não sai do servidor.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ident = await identificar();
  if ("erro" in ident) return ident.erro;
  const { user, service, clienteId } = ident;

  const sol = await carregarSolicitacao(service, id, clienteId, user.id);
  if (!sol) return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
  if (!(await avaliarEdicao(service, sol)).pode) return NextResponse.json({ error: MSG_EM_ANDAMENTO }, { status: 409 });

  const { data: vaga } = await service.from("vagas").select("id, titulo, tipo_servico").eq("id", sol.vaga_id).maybeSingle();
  const campos: Linha = {};
  for (const c of ["candidato_nome", "candidato_telefone", ...CAMPOS_ADMISSAO]) campos[c] = sol[c] ?? null;

  return NextResponse.json({
    data: {
      id: sol.id,
      status: sol.status,
      vaga_id: sol.vaga_id,
      vaga_titulo: vaga?.titulo ?? null,
      vaga_tipo_servico: vaga?.tipo_servico ?? null,
      tem_curriculo: !!sol.curriculo_url,
      pode_trocar_vaga: sol.status === "pendente",
      ...campos,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ident = await identificar();
    if ("erro" in ident) return ident.erro;
    const { user, service, clienteId } = ident;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }
    const parsed = parseBody(portalEditarIndicacaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const entrada = parsed.data as Linha;

    const sol = await carregarSolicitacao(service, id, clienteId, user.id);
    if (!sol) return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
    if (!(await avaliarEdicao(service, sol)).pode) return NextResponse.json({ error: MSG_EM_ANDAMENTO }, { status: 409 });

    const alteracoes: Alteracao[] = calcularDiff(sol, entrada);
    // Nada mudou: não grava, não avisa.
    if (alteracoes.length === 0) return NextResponse.json({ data: publico(sol), alterado: false });

    // Data de início só é checada se o campo mudou — uma data antiga e inalterada não bloqueia os outros campos.
    const dataNova = alteracoes.find((a) => a.campo === "admissao_data_inicio");
    if (dataNova && typeof dataNova.depois === "string") {
      const erroData = validarDataInicio(dataNova.depois, hojeBrasiliaISO());
      if (erroData) return NextResponse.json({ error: erroData }, { status: 400 });
    }

    // Vaga: só enquanto pendente; depois de aprovada ela já foi copiada para candidatura e encaminhamento.
    const trocouVaga = alteracoes.some((a) => a.campo === "vaga_id");
    let vagaAntes: Linha | null = null;
    let vagaDepois: Linha | null = null;
    if (trocouVaga) {
      if (sol.status !== "pendente") {
        return NextResponse.json({ error: "A vaga não pode ser alterada depois que a indicação foi aprovada." }, { status: 400 });
      }
      const novaId = entrada.vaga_id as string;
      const { data: vagas } = await service.from("vagas").select("id, titulo, cliente_id, status, tipo_servico, unidade_id").in("id", [sol.vaga_id, novaId]);
      vagaAntes = (vagas ?? []).find((v: Linha) => v.id === sol.vaga_id) ?? null;
      vagaDepois = (vagas ?? []).find((v: Linha) => v.id === novaId) ?? null;
      if (!vagaAntes) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 400 });

      // Indicação ainda não virou candidato; "já está na vaga" = outra indicação viva do mesmo nome nela.
      const { data: irmas } = await service
        .from("solicitacoes_indicacao_candidato")
        .select("id, candidato_nome")
        .eq("vaga_id", novaId)
        .eq("cliente_id", clienteId)
        .in("status", ["pendente", "aprovada"])
        .neq("id", sol.id);
      const nome = String(entrada.candidato_nome ?? sol.candidato_nome).trim().toLowerCase();
      const jaNaVaga = (irmas ?? []).some((i: Linha) => String(i.candidato_nome).trim().toLowerCase() === nome);

      const erroVaga = validarVagaNova(vagaAntes as VagaResumo, vagaDepois as VagaResumo | null, clienteId, jaNaVaga);
      if (erroVaga) return NextResponse.json({ error: erroVaga }, { status: 400 });
    }

    // Grava primeiro a solicitação, de forma condicional (status e updated_at lidos acima): se a Salmazos
    // decidiu ou editou no meio, nada é gravado. `sol.updated_at` é passado exatamente como veio do banco.
    const agoraIso = new Date().toISOString();
    const patch: Linha = { updated_at: agoraIso };
    for (const a of alteracoes) patch[a.campo] = a.depois;
    const { data: atualizada, error: updErr } = await service
      .from("solicitacoes_indicacao_candidato")
      .update(patch)
      .eq("id", sol.id)
      .eq("cliente_id", clienteId)
      .eq("status", sol.status)
      .eq("updated_at", sol.updated_at)
      .select("*")
      .maybeSingle();
    if (updErr) {
      console.error("[PATCH /api/portal/minhas-indicacoes/[id]] Erro ao gravar a edição:", updErr);
      return NextResponse.json({ error: "Não foi possível salvar a alteração." }, { status: 500 });
    }
    if (!atualizada) return NextResponse.json({ error: MSG_MUDOU }, { status: 409 });

    // ── Propagação (só aprovada). Sem transação: cada etapa trata o próprio erro e a edição já gravada fica. ──
    const aprovada = sol.status === "aprovada";
    const r = {
      candidaturaFalhou: false,
      candidaturaBloqueada: false,
      falhas: [] as CampoEditavel[],
      naoPropagados: [] as { campo: CampoEditavel; motivo: MotivoNaoPropagado }[],
    };
    if (aprovada) {
      const dadosAdmissao = alteracoes.filter((a) => campoDaAdmissao(a.campo));
      if (dadosAdmissao.length > 0) {
        try {
          const cvPatch: Linha = {};
          for (const a of dadosAdmissao) cvPatch[a.campo] = a.depois;
          // `etapa` na condição: se o Finalizar rodou entre a leitura e agora, não mexe numa candidatura já fechada.
          const { data: cvAtual, error: cvErr } = await service
            .from("candidatos_vagas")
            .update(cvPatch)
            .eq("id", sol.candidatos_vaga_id)
            .eq("etapa", "aprovado_cliente")
            .select("id");
          if (cvErr) r.candidaturaFalhou = true;
          else if (!cvAtual || cvAtual.length === 0) r.candidaturaBloqueada = true;
        } catch (e) {
          console.error("[PATCH minhas-indicacoes] Erro ao atualizar candidatos_vagas:", e);
          r.candidaturaFalhou = true;
        }
      }

      const doCandidato = alteracoes.filter((a) => ["candidato_nome", "candidato_telefone", "curriculo_url"].includes(a.campo));
      if (doCandidato.length > 0) {
        try {
          const { data: cand } = await service.from("candidatos").select("id, origem, nome_completo, telefone, curriculo_url").eq("id", sol.candidato_id).maybeSingle();
          const { data: outras } = await service.from("solicitacoes_indicacao_candidato").select("id").eq("candidato_id", sol.candidato_id).neq("id", sol.id).limit(1);
          const plano = planejarPropagacaoCandidato(cand ?? null, (outras ?? []).length > 0, doCandidato);
          r.naoPropagados.push(...plano.naoPropagados);
          for (const p of plano.propagar) {
            try {
              // Atualização condicional ao valor lido: se a Salmazos mexeu no meio, não sobrescreve.
              let q = service.from("candidatos").update({ [p.coluna]: p.novo }).eq("id", sol.candidato_id);
              q = p.anterior === null ? q.is(p.coluna, null) : q.eq(p.coluna, p.anterior);
              const { data: feito, error: pErr } = await q.select("id");
              if (pErr) r.falhas.push(p.campo);
              else if (!feito || feito.length === 0) r.naoPropagados.push({ campo: p.campo, motivo: "ajustado_pela_salmazos" });
            } catch {
              r.falhas.push(p.campo);
            }
          }
        } catch (e) {
          console.error("[PATCH minhas-indicacoes] Erro ao propagar para candidatos:", e);
          for (const a of doCandidato) if (!r.falhas.includes(a.campo) && !r.naoPropagados.some((n) => n.campo === a.campo)) r.falhas.push(a.campo);
        }
      }
    }
    const propagado = aprovada ? !r.candidaturaFalhou && !r.candidaturaBloqueada && r.falhas.length === 0 && r.naoPropagados.length === 0 : null;
    const camposAlterados = alteracoes.map((a) => a.campo);
    const clienteNome: string = sol.cliente_nome ?? "Cliente";

    // ── Escritas auxiliares: cada uma isolada, nenhuma derruba a edição já gravada ──
    if (aprovada && sol.candidato_id) {
      try {
        await registrarHistorico({
          candidato_id: sol.candidato_id,
          tipo: "comentario_interno",
          descricao: `Indicação editada pelo cliente ${clienteNome} (campos: ${camposAlterados.map((c) => ROTULO_CAMPO[c]).join(", ")})`,
          metadata: { origem: "indicacao_direta_cliente", solicitacao_id: sol.id, campos_alterados: camposAlterados },
          criado_por: clienteNome,
        });
      } catch (e) {
        console.error("[PATCH minhas-indicacoes] Erro ao registrar histórico:", e);
      }
    }

    try {
      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: clienteNome,
        acao: "indicacao_candidato_editada_cliente",
        entidade: "solicitacoes_indicacao_candidato",
        entidade_id: sol.id,
        // Só ids, nomes de campos e flags — nenhum valor (telefone, salário etc.).
        detalhes: {
          cliente_id: clienteId,
          campos_alterados: camposAlterados,
          status_no_momento: sol.status,
          vaga_trocada: trocouVaga,
          propagado,
          campos_nao_propagados: [...r.naoPropagados.map((n) => n.campo), ...r.falhas],
          candidato_id: sol.candidato_id ?? null,
        },
      });
    } catch (e) {
      console.error("[PATCH minhas-indicacoes] Erro ao registrar auditoria:", e);
    }

    try {
      let vagaTitulo: string = vagaDepois?.titulo ?? "";
      let unidadeDaVaga: string | null = vagaDepois?.unidade_id ?? null;
      // A coluna unidade_id da indicação é NOT NULL, mas se vier vazia o resolvedor trataria "sem unidade" como
      // "todas as unidades" (e-mail a analistas de qualquer unidade): cai na unidade da vaga, em try/catch próprio.
      if (!vagaTitulo || (!sol.unidade_id && !unidadeDaVaga)) {
        try {
          const { data: v } = await service.from("vagas").select("titulo, unidade_id").eq("id", atualizada.vaga_id).maybeSingle();
          vagaTitulo = vagaTitulo || (v?.titulo ?? "");
          unidadeDaVaga = unidadeDaVaga ?? v?.unidade_id ?? null;
        } catch (e) {
          console.error("[PATCH minhas-indicacoes] Erro ao ler a vaga para o aviso:", e);
        }
      }
      const unidadeAviso: string | null = sol.unidade_id ?? unidadeDaVaga;
      if (!unidadeAviso) console.error(`[PATCH minhas-indicacoes] Indicação ${sol.id} sem unidade (nem na vaga): aviso sem filtro de unidade.`);
      await avisarIndicacaoEditada({
        solicitacaoId: sol.id,
        candidatoId: aprovada ? (sol.candidato_id ?? null) : null,
        unidadeId: unidadeAviso,
        vagaId: atualizada.vaga_id,
        vagaTitulo,
        clienteNome,
        candidatoNome: atualizada.candidato_nome,
        linhas: montarLinhasAviso(alteracoes, trocouVaga ? { antes: vagaAntes?.titulo ?? "", depois: vagaDepois?.titulo ?? "" } : undefined),
        notas: notasDePropagacao(r),
      });
    } catch (e) {
      console.error("[PATCH minhas-indicacoes] Erro ao avisar a Salmazos:", e);
    }

    return NextResponse.json({ data: publico(atualizada), alterado: true });
  } catch (err) {
    console.error("[PATCH /api/portal/minhas-indicacoes/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
