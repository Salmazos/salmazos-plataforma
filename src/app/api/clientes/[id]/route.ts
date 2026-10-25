import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, clienteUpdateSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { checarAcessoCliente, resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { avaliarDuplicidade, camposIdentidadeAlterados, type CandidatoCliente } from "@/lib/clienteDuplicidade";
import {
  carregarIdentidadesClientes,
  decidirDuplicidade,
  mensagemUnicidadeDocumento,
  MSG_FALHA_CHECAGEM,
  MSG_FALHA_SALVAR,
  type DecisaoDuplicidade,
} from "@/lib/clienteDuplicidadeRota";
import { validarDocumentoDoCliente, vazioParaNulo } from "@/lib/clienteDaSolicitacao";
import { emailDaCobranca } from "@/lib/cobrancaRSDocumento";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoClientes(user);
    if (acessoNegado) return acessoNegado;

    const { id } = await params;
    const bloqueio = await checarAcessoCliente(user, id);
    if (bloqueio) return bloqueio;

    const body = await request.json();

    const parsed = parseBody(clienteUpdateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Par cpf/cnpj: conferido sempre que o corpo mexe em tipo_pessoa, cpf OU cnpj, para a edição que o banco recusaria (cadastro PF com CPF e
    // CNPJ digitado, ou PJ com CPF) voltar como 400 claro e não como erro do check clientes_documento_coerente. O CNPJ segue texto livre.
    let documentoNovo: { cpf: string | null } | null = null;
    if (body.cpf !== undefined || body.tipo_pessoa !== undefined || body.cnpj !== undefined) {
      let { data: atualDoc, error: erroDoc } = await supabase.from("clientes").select("tipo_pessoa, cnpj, cpf").eq("id", id).maybeSingle();
      // Colunas de pessoa física ainda não criadas (migração não rodou): edição de CNPJ de PJ segue como sempre foi; pedir CPF/tipo não dá.
      if (erroDoc && (erroDoc.code === "42703" || /\b(cpf|tipo_pessoa)\b/i.test(erroDoc.message ?? ""))) {
        if (body.cpf !== undefined || body.tipo_pessoa !== undefined) return NextResponse.json({ error: MSG_FALHA_SALVAR }, { status: 500 });
        const { data: so, error: erroSo } = await supabase.from("clientes").select("cnpj").eq("id", id).maybeSingle();
        atualDoc = so ? { tipo_pessoa: "pj", cnpj: so.cnpj, cpf: null } : null;
        erroDoc = erroSo;
      }
      if (erroDoc) {
        console.error("[PATCH /api/clientes/[id]] Erro ao ler o documento atual:", erroDoc.code ?? "sem código");
        return NextResponse.json({ error: MSG_FALHA_SALVAR }, { status: 500 });
      }
      // Cliente sumido entre o acesso e a leitura: segue para o fluxo normal, que responde pelo update.
      if (atualDoc) {
        const doc = validarDocumentoDoCliente(
          {
            tipo_pessoa: body.tipo_pessoa ?? (atualDoc.tipo_pessoa === "pf" ? "pf" : "pj"),
            cnpj: body.cnpj !== undefined ? body.cnpj : atualDoc.cnpj,
            cpf: body.cpf !== undefined ? body.cpf : atualDoc.cpf,
          },
          { modoLegado: true }
        );
        if (!doc.ok) return NextResponse.json({ error: doc.erro, campo: doc.campo }, { status: 400 });
        documentoNovo = { cpf: doc.cpf };
      }
    }

    // Troca de unidade: só quem tem acesso a todas as unidades, e só enquanto o cliente não
    // tem vaga nem encaminhamento — senão vagas/processos ficariam numa unidade e o cliente
    // em outra (e sumiriam da tela de quem cuida deles).
    let novaUnidadeId: string | undefined;
    if (parsed.data.unidade_id !== undefined) {
      const { data: atual } = await supabase.from("clientes").select("unidade_id").eq("id", id).single();
      if (atual && parsed.data.unidade_id !== atual.unidade_id) {
        const ctx = await resolverUnidadeUsuario(user);
        if (!ctx?.todasUnidades) {
          return NextResponse.json({ error: "Só a diretoria pode mudar a unidade de um cliente." }, { status: 403 });
        }
        const [{ count: vagas }, { count: encaminhamentos }] = await Promise.all([
          supabase.from("vagas").select("id", { count: "exact", head: true }).eq("cliente_id", id),
          supabase.from("encaminhamentos").select("id", { count: "exact", head: true }).eq("cliente_id", id),
        ]);
        if ((vagas ?? 0) > 0 || (encaminhamentos ?? 0) > 0) {
          return NextResponse.json(
            { error: "Este cliente já tem vagas ou encaminhamentos — a unidade não pode ser alterada pela tela." },
            { status: 409 }
          );
        }
        novaUnidadeId = parsed.data.unidade_id;
      }
    }

    // Trava de duplicidade: só avalia quando mudou nome, CNPJ, telefone, e-mail ou o cadastro está sendo
    // REATIVADO (ativo false→true), comparando com o valor atual no banco. O próprio cliente fica de fora e
    // só os campos alterados entram (editar o contato de um cadastro que já convive com um "gêmeo" não trava).
    const papelFull = PAPEIS_FULL_ACCESS.includes(user.app_metadata?.role ?? "analista");
    let decisaoDuplicidade: DecisaoDuplicidade = { tipo: "livre" };
    let reativando = false;
    const gatilho =
      body.nome !== undefined || body.cnpj !== undefined || body.cpf !== undefined || body.contato_telefone !== undefined ||
      body.contato_email !== undefined || body.ativo === true;
    if (gatilho) {
      const identidades = await carregarIdentidadesClientes(supabase);
      if (!identidades) return NextResponse.json({ error: MSG_FALHA_CHECAGEM }, { status: 500 });
      const atual = identidades.find((c) => c.id === id);
      if (atual) {
        reativando = body.ativo === true && !atual.ativo;
        const mudancas = { nome: body.nome, cnpj: body.cnpj, cpf: body.cpf, contato_telefone: body.contato_telefone, contato_email: body.contato_email };
        const alterados = camposIdentidadeAlterados(atual, mudancas, reativando);
        // Reativação "pura" (nenhum campo de identidade mudou junto): só valem os BLOQUEIOS (CNPJ igual a outro
        // cliente; telefone E e-mail iguais ao mesmo cliente, liberável só por full access). Aviso de sinal único
        // ou nome parecido não se aplica. Se a mesma requisição também mexe em nome/CNPJ/contato, esses campos
        // seguem a regra normal de edição.
        const reativacaoPura = reativando && camposIdentidadeAlterados(atual, mudancas, false).size === 0;
        if (alterados.size > 0) {
          const efetivo: CandidatoCliente = {
            nome: body.nome !== undefined ? body.nome : atual.nome,
            cnpj: body.cnpj !== undefined ? body.cnpj : atual.cnpj,
            cpf: body.cpf !== undefined ? body.cpf : atual.cpf,
            contato_telefone: body.contato_telefone !== undefined ? body.contato_telefone : atual.contato_telefone,
            contato_email: body.contato_email !== undefined ? body.contato_email : atual.contato_email,
            endereco: body.endereco !== undefined ? body.endereco : atual.endereco,
          };
          const ctxUnidade = await resolverUnidadeUsuario(user);
          const duplicidade = avaliarDuplicidade(efetivo, identidades, {
            papelFull,
            unidadesPermitidas: ctxUnidade?.todasUnidades ? "todas" : ctxUnidade ? [ctxUnidade.unidadeId] : [],
            ignorarId: id,
            camposConsiderados: alterados,
          });
          decisaoDuplicidade = decidirDuplicidade(
            duplicidade,
            { confirmar: parsed.data.confirmar_duplicidade === true, liberar: parsed.data.liberar_bloqueio === true },
            papelFull,
            reativacaoPura
          );
          if (decisaoDuplicidade.tipo === "responder") return decisaoDuplicidade.resposta;
        }
      }
    }

    const campos: Record<string, unknown> = {};
    if (body.nome !== undefined) campos.nome = body.nome;
    if (body.contato_nome !== undefined) campos.contato_nome = body.contato_nome;
    if (body.contato_telefone !== undefined) campos.contato_telefone = body.contato_telefone;
    if (body.contato_email !== undefined) campos.contato_email = body.contato_email;
    if (body.cidade !== undefined) campos.cidade = body.cidade;
    if (body.segmento !== undefined) campos.segmento = body.segmento;
    if (body.servicos !== undefined) campos.servicos = Array.isArray(body.servicos) ? body.servicos : [];
    if (body.ativo !== undefined) campos.ativo = body.ativo;
    if (body.responsavel_comercial !== undefined) campos.responsavel_comercial = body.responsavel_comercial || null;
    if (body.entidade_contratante !== undefined) campos.entidade_contratante = body.entidade_contratante || null;
    if (body.cnpj !== undefined) campos.cnpj = body.cnpj || null;
    // Só grava o CPF quando o corpo o trouxe: editar o CNPJ não reescreve (nem depende da coluna) cpf.
    if (documentoNovo && body.cpf !== undefined) campos.cpf = documentoNovo.cpf;
    if (body.tipo_pessoa !== undefined) campos.tipo_pessoa = body.tipo_pessoa;
    if (body.email_nota_fiscal !== undefined) campos.email_nota_fiscal = vazioParaNulo(body.email_nota_fiscal);
    if (body.endereco !== undefined) campos.endereco = body.endereco || null;
    if (body.processo_simplificado !== undefined) campos.processo_simplificado = body.processo_simplificado;
    if (novaUnidadeId !== undefined) campos.unidade_id = novaUnidadeId;

    const { data, error } = await supabase
      .from("clientes")
      .update(campos)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      // 23505 = índice único de CNPJ ou de CPF entre ativos (migration_clientes_cnpj_ativo_unico.sql, migration_clientes_pessoa_fisica.sql).
      if (error.code === "23505") return NextResponse.json({ error: mensagemUnicidadeDocumento(error) }, { status: 409 });
      console.error("[PATCH /api/clientes/[id]] Erro ao atualizar cliente:", error.message);
      return NextResponse.json({ error: MSG_FALHA_SALVAR }, { status: 500 });
    }

    // Auditoria só com ids e motivos: confirmou duplicidade, liberou bloqueio, reativou.
    const nomeAuditoria = reativando || decisaoDuplicidade.tipo === "confirmada" || decisaoDuplicidade.tipo === "liberada"
      ? await resolverNomeUsuario(user.id, user.email ?? null, supabase)
      : null;
    if (decisaoDuplicidade.tipo === "confirmada" || decisaoDuplicidade.tipo === "liberada") {
      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: nomeAuditoria,
        acao: decisaoDuplicidade.tipo === "liberada" ? "cliente_bloqueio_liberado" : "cliente_duplicidade_confirmada",
        entidade: "clientes",
        entidade_id: id,
        detalhes: { existente_id: decisaoDuplicidade.resultado.existenteId, motivos: decisaoDuplicidade.resultado.motivos },
      });
    }
    if (reativando) {
      registrarAuditoria({ usuario_id: user.id, usuario_nome: nomeAuditoria, acao: "cliente_reativado", entidade: "clientes", entidade_id: id, detalhes: { cliente_id: id } });
    }

    // Contatos aniversariantes do cliente acompanham a troca de unidade dele.
    if (novaUnidadeId !== undefined) {
      await supabase.from("aniversariantes_contatos").update({ unidade_id: novaUnidadeId }).eq("cliente_id", id);
    }

    // Decisão de negócio confirmada com o usuário (caso real: cliente Novacki, e antes
    // CBP Brasil corrigido manualmente) — cliente_email_snapshot em cobrancas_rs nasce como
    // uma cópia do e-mail do cliente no momento da geração da cobrança (rastreabilidade:
    // saber pra qual endereço aquela cobrança específica foi enviada). Mas o usuário quer o
    // e-mail de cobrança sob seu controle a partir do cadastro do cliente: toda edição do
    // e-mail aqui deve corrigir o snapshot de TODAS as cobranças desse cliente (independente
    // do status — não reenvia nada, só corrige o dado exibido/usado numa ação futura, como
    // "Reenviar notificação").
    // O e-mail da cobrança é o da nota fiscal quando preenchido, senão o de contato: mexer em qualquer um dos dois recalcula o snapshot.
    if (campos.contato_email !== undefined || campos.email_nota_fiscal !== undefined) {
      await supabase
        .from("cobrancas_rs")
        .update({ cliente_email_snapshot: emailDaCobranca(data) })
        .eq("cliente_id", id);
    }

    if (body.ativo !== undefined) {
      const { data: usuarios } = await supabase
        .from("cliente_usuarios")
        .select("user_id")
        .eq("cliente_id", id);

      if (usuarios && usuarios.length > 0) {
        const banDuration = body.ativo ? "none" : "876600h";
        await Promise.all(
          usuarios.map((u) =>
            supabase.auth.admin.updateUserById(u.user_id, {
              ban_duration: banDuration,
            })
          )
        );
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/clientes/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
