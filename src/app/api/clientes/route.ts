import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, clienteCreateSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { obterContextoUnidade } from "@/lib/unidadeAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { avaliarDuplicidade } from "@/lib/clienteDuplicidade";
import {
  carregarIdentidadesClientes,
  decidirDuplicidade,
  mensagemUnicidadeDocumento,
  MSG_FALHA_CHECAGEM,
  MSG_FALHA_SALVAR,
} from "@/lib/clienteDuplicidadeRota";
import { validarDocumentoDoCliente, vazioParaNulo } from "@/lib/clienteDaSolicitacao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  // Esta rota alimenta todos os selects de cliente do sistema (nova/editar vaga,
  // encaminhamento, admissão rápida, KM, aniversários...) — filtrar aqui mantém todos eles
  // na unidade de quem está usando.
  const supabase = createServiceClient();
  let query = supabase
    .from("clientes")
    .select("*")
    .order("nome");
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);
  // ?ativos=1 — seletores de "criar/vincular" (vaga, entrevista, admissão rápida) não oferecem cliente inativo.
  // Sem o parâmetro a resposta é a de sempre (relatórios, filtros e gestão precisam enxergar os inativos).
  // ?incluir=<id> mantém na lista um cliente específico mesmo inativo (a vaga já vinculada a ele).
  if (request.nextUrl.searchParams.get("ativos") === "1") {
    const incluir = request.nextUrl.searchParams.get("incluir");
    query = incluir && UUID.test(incluir) ? query.or(`ativo.eq.true,id.eq.${incluir}`) : query.eq("ativo", true);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoClientes(user);
    if (acessoNegado) return acessoNegado;

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(clienteCreateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Cliente nasce na unidade de quem cria (explícito, não o DEFAULT do banco). Só quem tem
    // acesso a todas as unidades (sócios) escolhe outra — é o caso de cadastrar cliente de
    // SBC estando com perfil de Monte Mor/Hortolândia.
    const unidadeId = ctx.todasUnidades && parsed.data.unidade_id ? parsed.data.unidade_id : ctx.unidadeId;

    // Pessoa física (CPF no lugar do CNPJ). Cadastro sem tipo_pessoa é PJ, como sempre foi: o CNPJ continua texto livre (sem conferir dígitos,
    // porque os cadastros antigos aceitam qualquer texto); "" vira null, e o par cpf/cnpj nunca sai com os dois preenchidos (check do banco).
    const tipoPessoa = parsed.data.tipo_pessoa ?? "pj";
    const documento = validarDocumentoDoCliente({ tipo_pessoa: tipoPessoa, cnpj: parsed.data.cnpj, cpf: parsed.data.cpf }, { modoLegado: true });
    if (!documento.ok) return NextResponse.json({ error: documento.erro, campo: documento.campo }, { status: 400 });
    const emailNotaFiscal = vazioParaNulo(parsed.data.email_nota_fiscal);

    const supabase = createServiceClient();

    // Trava de duplicidade (global: todas as unidades, ativos e inativos; uma consulta, comparação em memória).
    const papelFull = PAPEIS_FULL_ACCESS.includes(user.app_metadata?.role ?? "analista");
    const identidades = await carregarIdentidadesClientes(supabase);
    if (!identidades) return NextResponse.json({ error: MSG_FALHA_CHECAGEM }, { status: 500 });
    const duplicidade = avaliarDuplicidade(
      {
        nome: parsed.data.nome,
        cnpj: documento.cnpj,
        cpf: documento.cpf,
        contato_telefone: parsed.data.contato_telefone,
        contato_email: parsed.data.contato_email,
        endereco: parsed.data.endereco,
      },
      identidades,
      { papelFull, unidadesPermitidas: ctx.todasUnidades ? "todas" : [ctx.unidadeId] }
    );
    const decisao = decidirDuplicidade(
      duplicidade,
      { confirmar: parsed.data.confirmar_duplicidade === true, liberar: parsed.data.liberar_bloqueio === true },
      papelFull
    );
    if (decisao.tipo === "responder") return decisao.resposta;

    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nome: body.nome,
        contato_nome: body.contato_nome,
        contato_telefone: body.contato_telefone,
        contato_email: body.contato_email,
        cidade: body.cidade,
        segmento: body.segmento,
        servicos: Array.isArray(body.servicos) ? body.servicos : [],
        ativo: true,
        responsavel_comercial: body.responsavel_comercial ?? null,
        entidade_contratante: body.entidade_contratante || null,
        cnpj: documento.cnpj,
        endereco: body.endereco || null,
        processo_simplificado: body.processo_simplificado ?? false,
        unidade_id: unidadeId,
        // Colunas novas só vão quando há o que gravar: cadastro PJ comum segue idêntico mesmo antes da migração rodar.
        ...(tipoPessoa === "pf" ? { tipo_pessoa: "pf" } : {}),
        ...(documento.cpf ? { cpf: documento.cpf } : {}),
        ...(emailNotaFiscal ? { email_nota_fiscal: emailNotaFiscal } : {}),
      })
      .select()
      .single();
    if (error) {
      // 23505 = índice único de CNPJ ou de CPF entre ativos (migration_clientes_cnpj_ativo_unico.sql, migration_clientes_pessoa_fisica.sql): corrida entre duas requisições.
      if (error.code === "23505") return NextResponse.json({ error: mensagemUnicidadeDocumento(error) }, { status: 409 });
      console.error("[POST /api/clientes] Erro ao gravar cliente:", error.message);
      return NextResponse.json({ error: MSG_FALHA_SALVAR }, { status: 500 });
    }

    // A tabela clientes não tem coluna de autor: sem este registro, descobrir quem criou um cliente (ex.: na unidade errada)
    // exigia rastrear pelos logs do Supabase. Só o id e o nome da empresa — nenhum dado de contato.
    const usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, supabase);
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "cliente_criado",
      entidade: "clientes",
      entidade_id: data.id,
      detalhes: { nome: data.nome, unidade_id: unidadeId },
    });

    if (decisao.tipo === "confirmada" || decisao.tipo === "liberada") {
      // Auditoria só com ids e motivos.
      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: decisao.tipo === "liberada" ? "cliente_bloqueio_liberado" : "cliente_duplicidade_confirmada",
        entidade: "clientes",
        entidade_id: data.id,
        detalhes: { existente_id: decisao.resultado.existenteId, motivos: decisao.resultado.motivos },
      });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/clientes]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
