import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, solicitacaoVincularClienteSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { avaliarDuplicidade } from "@/lib/clienteDuplicidade";
import {
  carregarIdentidadesClientes,
  decidirDuplicidade,
  mensagemUnicidadeDocumento,
  respostaDuplicidade,
  MSG_FALHA_CHECAGEM,
  MSG_FALHA_SALVAR,
} from "@/lib/clienteDuplicidadeRota";
import {
  completarSomenteVazios,
  montarPrefillCliente,
  retirarDocumentosJaCadastrados,
  validarDocumentoDoCliente,
  vazioParaNulo,
  type CampoCompletavel,
} from "@/lib/clienteDaSolicitacao";

// Cadastra (modo "criar") ou vincula (modo "vincular") o cliente de uma solicitação do link público (R&S). A vaga criada a partir do link nasce
// sem cliente, e sem cliente a cobrança R&S não sai: aqui o analista resolve isso a partir da própria solicitação.
//
// Nunca decide no escuro: o vínculo só acontece por ação explícita do analista (cliente novo conferido por ele no modal, ou cliente existente
// escolhido por ele). Achou cadastro parecido, devolve o candidato (409) e espera a confirmação; nunca vincula sozinho.
//
// Consistência (são várias escritas, sem transação no cliente do Supabase): o vínculo na solicitação é um UPDATE condicional (ainda sem cliente e
// ainda aberta/aprovada). Cliente criado e vínculo que não pegou → o cliente recém-criado é apagado (compensação); se nem isso der, o id dele vai
// na resposta. Vínculo na vaga que falha → desfaz o vínculo da solicitação (e o cliente criado, no modo "criar").

// Aberta (pendente) ou já aprovada: a vaga criada na aprovação é justamente a que fica sem cliente. Recusada nunca.
const STATUS_QUE_ACEITAM_CLIENTE = ["pendente", "aprovada"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG_JA_VINCULADA = "A solicitação já foi vinculada ou decidida. Recarregue a lista.";
const MSG_RECUSADA = "Esta solicitação foi recusada: não é possível cadastrar nem vincular cliente.";
// Marca os 409 em que a SOLICITAÇÃO mudou (já vinculada, decidida ou recusada): é o único 409 em que a tela fecha o formulário e recarrega a lista.
// Os demais 409 (duplicidade, reativação, índice único sem cadastro visível) ficam no formulário, com o que foi digitado.
const SOLICITACAO_INDISPONIVEL = { solicitacao_indisponivel: true };

const MSG_FALHA_VINCULAR = "Não foi possível vincular o cliente à solicitação. Nada foi alterado.";

type Svc = SupabaseClient;

async function vincularSolicitacao(svc: Svc, solicitacaoId: string, clienteId: string): Promise<"ok" | "ja_vinculada" | "erro"> {
  const { data, error } = await svc
    .from("solicitacoes_vagas")
    .update({ cliente_id: clienteId, updated_at: new Date().toISOString() })
    .eq("id", solicitacaoId)
    .is("cliente_id", null)
    .eq("origem", "link_publico")
    .in("status", STATUS_QUE_ACEITAM_CLIENTE)
    .select("id");
  if (error) {
    console.error("[vincular-cliente] Erro ao vincular a solicitação:", error.code ?? "sem código");
    return "erro";
  }
  return (data ?? []).length > 0 ? "ok" : "ja_vinculada";
}

// Condicional por cliente_id = o cliente recém-criado: nunca solta um vínculo que outra pessoa fez. Devolve true só quando a resposta confirma que
// nenhuma solicitação aponta mais para esse cliente (atualizou ou não havia o que atualizar).
async function desfazerVinculoDaSolicitacao(svc: Svc, solicitacaoId: string, clienteId: string): Promise<boolean> {
  const { error } = await svc
    .from("solicitacoes_vagas")
    .update({ cliente_id: null, updated_at: new Date().toISOString() })
    .eq("id", solicitacaoId)
    .eq("cliente_id", clienteId)
    .select("id");
  if (error) console.error("[vincular-cliente] Erro ao desfazer o vínculo da solicitação:", error.code ?? "sem código");
  return !error;
}

// Idem para a vaga: só solta se ainda aponta para o cliente recém-criado.
async function desfazerVinculoDaVaga(svc: Svc, vagaId: string, clienteId: string): Promise<boolean> {
  const { error } = await svc.from("vagas").update({ cliente_id: null }).eq("id", vagaId).eq("cliente_id", clienteId).select("id");
  if (error) console.error("[vincular-cliente] Erro ao desfazer o vínculo da vaga:", error.code ?? "sem código");
  return !error;
}

// Só mexe na vaga se ela ainda não tem cliente e é da mesma unidade do cliente (a vaga só liga a cliente da própria unidade).
async function vincularVaga(
  svc: Svc,
  vagaId: string,
  clienteId: string,
  unidadeId: string
): Promise<{ resultado: "vinculada" | "vaga_nao_alterada" | "erro" }> {
  const { data, error } = await svc
    .from("vagas")
    .update({ cliente_id: clienteId })
    .eq("id", vagaId)
    .is("cliente_id", null)
    .eq("unidade_id", unidadeId)
    .select("id");
  if (error) {
    console.error("[vincular-cliente] Erro ao vincular a vaga:", error.code ?? "sem código");
    return { resultado: "erro" };
  }
  return { resultado: (data ?? []).length > 0 ? "vinculada" : "vaga_nao_alterada" };
}

// Compara e troca por campo: só grava onde o cadastro ainda tem exatamente o valor vazio que foi lido; se alguém preencheu no meio, não grava.
async function aplicarCompletar(
  svc: Svc,
  cliente: Record<string, unknown>,
  valores: Partial<Record<CampoCompletavel, string>>
): Promise<"ok" | "conflito" | "erro"> {
  const campos = Object.keys(valores) as CampoCompletavel[];
  if (campos.length === 0) return "ok";
  let consulta = svc.from("clientes").update(valores).eq("id", String(cliente.id));
  for (const campo of campos) {
    const lido = cliente[campo];
    consulta = lido === null || lido === undefined ? consulta.is(campo, null) : consulta.eq(campo, lido as string);
  }
  const { data, error } = await consulta.select("id");
  if (error) {
    console.error("[vincular-cliente] Erro ao completar o cadastro:", error.code ?? "sem código");
    return "erro";
  }
  return (data ?? []).length > 0 ? "ok" : "conflito";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    const acessoNegado = await checarAcessoClientes(user);
    if (acessoNegado) return acessoNegado;
    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });

    const parsed = parseBody(solicitacaoVincularClienteSchema, await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const entrada = parsed.data;

    const svc = createServiceClient();
    const { data: sol } = await svc.from("solicitacoes_vagas").select("*").eq("id", id).maybeSingle();
    if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (sol.origem !== "link_publico") {
      return NextResponse.json({ error: "Só solicitações vindas do link público de solicitação de vaga podem ter o cliente cadastrado por aqui." }, { status: 400 });
    }
    if (sol.status === "recusada") return NextResponse.json({ error: MSG_RECUSADA, ...SOLICITACAO_INDISPONIVEL }, { status: 409 });
    if (!STATUS_QUE_ACEITAM_CLIENTE.includes(sol.status) || sol.cliente_id) return NextResponse.json({ error: MSG_JA_VINCULADA, ...SOLICITACAO_INDISPONIVEL }, { status: 409 });

    const papelFull = PAPEIS_FULL_ACCESS.includes(user.app_metadata?.role ?? "analista");
    const usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, svc);

    // ── Modo "vincular": cliente existente escolhido pelo analista ───────────────
    if (entrada.modo === "vincular") {
      const { data: cliente } = await svc.from("clientes").select("*").eq("id", entrada.cliente_id).maybeSingle();
      if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      if (cliente.unidade_id !== sol.unidade_id) {
        // Quem não enxerga a unidade do cliente não descobre que ele existe.
        if (!podeVerUnidade(ctx, cliente.unidade_id)) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
        return NextResponse.json(
          { error: "O cliente escolhido é de outra unidade. A solicitação só pode ser vinculada a um cliente da mesma unidade." },
          { status: 400 }
        );
      }
      if (!cliente.ativo) {
        // A reativação é o fluxo que já existe (PATCH /api/clientes/[id], com a checagem de duplicidade dele); depois é só vincular de novo.
        return NextResponse.json(
          { error: "Este cliente está inativo. Reative o cadastro dele (ou escolha outro cliente) antes de vincular.", precisaReativar: true, cliente: { id: cliente.id, nome: cliente.nome } },
          { status: 409 }
        );
      }

      let completar = entrada.completar_vazios ? completarSomenteVazios(cliente, montarPrefillCliente(sol).valores) : null;
      // CNPJ/CPF só é completado se não pertencer a outro cadastro (qualquer unidade, ativo ou inativo): o índice único só vigia ativos e o
      // vínculo não pode empurrar um documento duplicado para dentro do cliente escolhido. Sem conseguir checar, não completa documento nenhum.
      if (completar && ("cnpj" in completar.valores || "cpf" in completar.valores)) {
        const identidades = await carregarIdentidadesClientes(svc);
        if (!identidades) return NextResponse.json({ error: MSG_FALHA_CHECAGEM }, { status: 500 });
        completar = retirarDocumentosJaCadastrados(completar, cliente.id, identidades);
      }

      const vinculo = await vincularSolicitacao(svc, sol.id, cliente.id);
      if (vinculo === "erro") return NextResponse.json({ error: MSG_FALHA_VINCULAR }, { status: 500 });
      if (vinculo === "ja_vinculada") return NextResponse.json({ error: MSG_JA_VINCULADA, ...SOLICITACAO_INDISPONIVEL }, { status: 409 });

      let vagaVinculada = false;
      let vagaMotivo: "sem_vaga" | "vaga_nao_alterada" | "vinculada" = "sem_vaga";
      if (sol.vaga_id) {
        const v = await vincularVaga(svc, sol.vaga_id, cliente.id, sol.unidade_id);
        if (v.resultado === "erro") {
          // A resposta perdida pode ter gravado a vaga: solta os dois vínculos (cliente existente, nada a apagar).
          await desfazerVinculoDaVaga(svc, sol.vaga_id, cliente.id);
          await desfazerVinculoDaSolicitacao(svc, sol.id, cliente.id);
          return NextResponse.json({ error: MSG_FALHA_VINCULAR }, { status: 500 });
        }
        vagaMotivo = v.resultado;
        vagaVinculada = v.resultado === "vinculada";
      }

      // Completar é um extra: se der conflito ou erro, o vínculo (o que importa) já está feito e a resposta avisa.
      let completados: CampoCompletavel[] = [];
      let completarConflito = false;
      if (completar && completar.preenchidos.length > 0) {
        const r = await aplicarCompletar(svc, cliente, completar.valores);
        if (r === "ok") completados = completar.preenchidos;
        else completarConflito = true;
      }

      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: "solicitacao_cliente_vinculado",
        entidade: "solicitacoes_vagas",
        entidade_id: sol.id,
        detalhes: {
          cliente_id: cliente.id,
          vaga_id: sol.vaga_id ?? null,
          vaga_vinculada: vagaVinculada,
          vaga: vagaMotivo,
          campos_completados: completados,
          campos_divergentes: completar?.divergentes ?? [],
          completar_conflito: completarConflito,
        },
      });
      return NextResponse.json({
        data: { cliente_id: cliente.id, vaga_vinculada: vagaVinculada, vaga: vagaMotivo, completados, divergentes: completar?.divergentes ?? [], completar_conflito: completarConflito },
      });
    }

    // ── Modo "criar": cliente novo com o que o analista conferiu no modal ────────
    const c = entrada.cliente;
    // A unidade é SEMPRE a da solicitação (o que vier no corpo é descartado pelo schema).
    const unidadeId: string = sol.unidade_id;

    const documento = validarDocumentoDoCliente({ tipo_pessoa: c.tipo_pessoa, cnpj: c.cnpj, cpf: c.cpf });
    if (!documento.ok) return NextResponse.json({ error: documento.erro, campo: documento.campo }, { status: 400 });
    const endereco = vazioParaNulo(c.endereco);
    const emailNotaFiscal = vazioParaNulo(c.email_nota_fiscal);

    // Duplicidade relativa à unidade da solicitação: o que é de outra unidade volta como "outra unidade", sem dado nenhum, mesmo para quem
    // enxerga todas (a vaga só liga a cliente da mesma unidade).
    const candidato = { nome: c.nome, cnpj: documento.cnpj, cpf: documento.cpf, contato_telefone: c.contato_telefone, contato_email: c.contato_email, endereco };
    const identidades = await carregarIdentidadesClientes(svc);
    if (!identidades) return NextResponse.json({ error: MSG_FALHA_CHECAGEM }, { status: 500 });
    const duplicidade = avaliarDuplicidade(candidato, identidades, { papelFull, unidadesPermitidas: [unidadeId] });
    const decisao = decidirDuplicidade(
      duplicidade,
      { confirmar: entrada.confirmar_duplicidade === true, liberar: entrada.liberar_bloqueio === true },
      papelFull,
      false,
      { documentoGenerico: true }
    );
    if (decisao.tipo === "responder") return decisao.resposta;

    const { data: novo, error: erroInsert } = await svc
      .from("clientes")
      .insert({
        nome: c.nome,
        contato_nome: c.contato_nome,
        contato_telefone: c.contato_telefone,
        contato_email: c.contato_email,
        cidade: c.cidade,
        segmento: c.segmento,
        servicos: c.servicos,
        ativo: true,
        responsavel_comercial: vazioParaNulo(c.responsavel_comercial),
        cnpj: documento.cnpj,
        endereco,
        processo_simplificado: false,
        unidade_id: unidadeId,
        // Colunas novas só vão quando há o que gravar (cadastro PJ comum não depende da migração de pessoa física).
        ...(c.tipo_pessoa === "pf" ? { tipo_pessoa: "pf" } : {}),
        ...(documento.cpf ? { cpf: documento.cpf } : {}),
        ...(emailNotaFiscal ? { email_nota_fiscal: emailNotaFiscal } : {}),
      })
      .select("id, nome, ativo")
      .single();
    if (erroInsert || !novo) {
      if (erroInsert?.code === "23505") {
        // Corrida: alguém cadastrou o mesmo documento entre a checagem e o INSERT. Mesma resposta da duplicidade, não erro 500.
        const depois = await carregarIdentidadesClientes(svc);
        const agora = depois ? avaliarDuplicidade(candidato, depois, { papelFull, unidadesPermitidas: [unidadeId] }) : null;
        if (agora) return respostaDuplicidade(agora, false, { documentoGenerico: true });
        return NextResponse.json({ error: mensagemUnicidadeDocumento(erroInsert) }, { status: 409 });
      }
      console.error("[vincular-cliente] Erro ao gravar o cliente:", erroInsert?.code ?? "sem código");
      return NextResponse.json({ error: MSG_FALHA_SALVAR }, { status: 500 });
    }

    // A partir daqui o cliente existe. solicitacoes_vagas.cliente_id é ON DELETE CASCADE: apagar um cliente que ainda está ligado à solicitação
    // apagaria a solicitação real junto. Por isso o cliente recém-criado SÓ é apagado depois de o vínculo (e o da vaga) ser desfeito com
    // confirmação; se não der para confirmar (o UPDATE pode ter gravado mesmo com a resposta perdida), ele fica e o id vai na resposta.
    const desfazerTudoEApagarCliente = async (): Promise<string | null> => {
      const vagaSolta = sol.vaga_id ? await desfazerVinculoDaVaga(svc, sol.vaga_id, novo.id) : true;
      const solicitacaoSolta = await desfazerVinculoDaSolicitacao(svc, sol.id, novo.id);
      if (!vagaSolta || !solicitacaoSolta) return novo.id;
      const { error } = await svc.from("clientes").delete().eq("id", novo.id);
      if (error) {
        console.error("[vincular-cliente] Erro ao desfazer o cliente recém-criado:", error.code ?? "sem código");
        return novo.id;
      }
      return null;
    };

    const vinculo = await vincularSolicitacao(svc, sol.id, novo.id);
    if (vinculo !== "ok") {
      const orfao = await desfazerTudoEApagarCliente();
      const corpo = vinculo === "ja_vinculada" ? { error: MSG_JA_VINCULADA, ...SOLICITACAO_INDISPONIVEL } : { error: MSG_FALHA_VINCULAR };
      return NextResponse.json(orfao ? { ...corpo, cliente_orfao_id: orfao } : corpo, { status: vinculo === "ja_vinculada" ? 409 : 500 });
    }

    let vagaVinculada = false;
    let vagaMotivo: "sem_vaga" | "vaga_nao_alterada" | "vinculada" = "sem_vaga";
    if (sol.vaga_id) {
      const v = await vincularVaga(svc, sol.vaga_id, novo.id, unidadeId);
      if (v.resultado === "erro") {
        const orfao = await desfazerTudoEApagarCliente();
        return NextResponse.json(orfao ? { error: MSG_FALHA_VINCULAR, cliente_orfao_id: orfao } : { error: MSG_FALHA_VINCULAR }, { status: 500 });
      }
      vagaMotivo = v.resultado;
      vagaVinculada = v.resultado === "vinculada";
    }

    // Auditoria só com ids, motivos e nomes de campos: nenhum CPF, telefone, e-mail (e o nome do cliente só quando é empresa).
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "cliente_criado",
      entidade: "clientes",
      entidade_id: novo.id,
      detalhes: { unidade_id: unidadeId, origem: "solicitacao_link", tipo_pessoa: c.tipo_pessoa, ...(c.tipo_pessoa === "pj" ? { nome: novo.nome } : {}) },
    });
    if (decisao.tipo === "confirmada" || decisao.tipo === "liberada") {
      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: decisao.tipo === "liberada" ? "cliente_bloqueio_liberado" : "cliente_duplicidade_confirmada",
        entidade: "clientes",
        entidade_id: novo.id,
        detalhes: { existente_id: decisao.resultado.existenteId, motivos: decisao.resultado.motivos },
      });
    }
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "solicitacao_cliente_cadastrado",
      entidade: "solicitacoes_vagas",
      entidade_id: sol.id,
      detalhes: {
        cliente_id: novo.id,
        vaga_id: sol.vaga_id ?? null,
        vaga_vinculada: vagaVinculada,
        vaga: vagaMotivo,
        duplicidade_confirmada: decisao.tipo === "confirmada" || decisao.tipo === "liberada",
        motivos: decisao.tipo === "confirmada" || decisao.tipo === "liberada" ? decisao.resultado.motivos : [],
      },
    });

    return NextResponse.json({ data: { cliente: { id: novo.id, nome: novo.nome }, vaga_vinculada: vagaVinculada, vaga: vagaMotivo } }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/solicitacoes-vagas/[id]/vincular-cliente]", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
