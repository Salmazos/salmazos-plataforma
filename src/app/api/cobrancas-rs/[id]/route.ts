import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsRascunhoSchema } from "@/lib/schemas";
import { podeRevisarCobranca } from "@/lib/fullAccessAuth";
import { carregarIdentidadesClientes, MSG_DOCUMENTO_OUTRA_UNIDADE } from "@/lib/clienteDuplicidadeRota";
import { documentoJaCadastradoEmOutroCliente, tipoDocumentoDaCobranca, validarDocumentoDaCobranca } from "@/lib/cobrancaRSDocumento";
import { carregarNomesGeradoresCobrancaRS } from "@/lib/cobrancaRSAutor";
import { tipoPessoaDoClienteDaCobranca } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("cobrancas_rs")
    // clientes(...) traz o tipo do cliente (PF/PJ) para o modal escolher CPF ou CNPJ; cobrancas_rs tem uma só FK para clientes (sem ambiguidade).
    .select("*, vagas(titulo), clientes(tipo_pessoa, cpf, email_nota_fiscal)")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  const pode = await podeRevisarCobranca(user, data);
  if (!pode) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  // Só o nome de quem gerou (mesmo gate de acesso acima) — o modal mostra "Gerada por".
  const nomes = await carregarNomesGeradoresCobrancaRS(svc, [data.gerado_por_user_id]);
  const geradoPorNome = data.gerado_por_user_id ? nomes.get(data.gerado_por_user_id) ?? null : null;

  return NextResponse.json({ data: { ...data, gerado_por_nome: geradoPorNome } });
}

// "Salvar rascunho" — sem validação obrigatória, salva parcial. Só edita cobranças ainda
// em pendente_revisao (uma vez aprovada/enviada, o snapshot fica congelado). Também usada
// como primeiro passo de "Aprovar e enviar" (ver /aprovar), pra garantir que a validação
// do lado do servidor reflita exatamente o que está persistido.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(cobrancaRsRascunhoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { cargo, salario, data_inicio, cliente_cnpj, cliente_endereco, prazo_cobranca } = parsed.data;

  const svc = createServiceClient();

  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status, cliente_id, unidade_id, cliente_cnpj_snapshot, cliente_endereco_snapshot, gerado_por_user_id")
    .eq("id", id)
    .single();

  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  const pode = await podeRevisarCobranca(user, atual);
  if (!pode) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  if (atual.status !== "pendente_revisao") {
    return NextResponse.json({ error: "Esta cobrança já foi revisada e não pode mais ser editada." }, { status: 400 });
  }

  // Tipo do cliente (cadastro): PF só aceita CPF, PJ só CNPJ. Sem cadastro vinculado nada é conferido (como sempre foi).
  const tipoPessoa = await tipoPessoaDoClienteDaCobranca(svc, atual.cliente_id);

  // O documento digitado é conferido ANTES de salvar qualquer coisa: documento inválido ou do tipo errado dá 400 e a cobrança não muda.
  let documentoNovo: string | null = null;
  if (cliente_cnpj && !atual.cliente_cnpj_snapshot) {
    const v = validarDocumentoDaCobranca(tipoPessoa, cliente_cnpj);
    if (!v.ok) return NextResponse.json({ error: v.erro, campo: "cliente_cnpj" }, { status: 400 });
    documentoNovo = v.valor;
  }

  const campos: Record<string, unknown> = {};
  if (cargo !== undefined) campos.cargo = cargo || null;
  if (salario !== undefined) campos.salario = salario;
  if (data_inicio !== undefined) campos.data_inicio = data_inicio || null;
  if (prazo_cobranca !== undefined) campos.prazo_cobranca = prazo_cobranca || null;

  // CNPJ/Endereço só são graváveis aqui enquanto o snapshot ainda não tiver esse dado —
  // uma vez preenchido (seja do cadastro original ou desta tela), passa a ser somente
  // leitura no modal, então o servidor não deveria aceitar sobrescrevê-lo por essa via.
  if (documentoNovo) campos.cliente_cnpj_snapshot = documentoNovo;
  if (cliente_endereco && !atual.cliente_endereco_snapshot) campos.cliente_endereco_snapshot = cliente_endereco;

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Cadastro do cliente também é atualizado, não só o snapshot desta cobrança — fica completo para o futuro (próximas cobranças do mesmo cliente já
  // vêm com o dado). Endereço e documento são updates SEPARADOS: um falhar não derruba o outro. A cobrança já está salva; o que não for possível
  // gravar no cadastro volta em `avisos` para o modal mostrar.
  const avisos: string[] = [];
  if (atual.cliente_id && (documentoNovo || campos.cliente_endereco_snapshot)) {
    if (campos.cliente_endereco_snapshot) {
      const { error: erroEndereco } = await svc.from("clientes").update({ endereco: campos.cliente_endereco_snapshot }).eq("id", atual.cliente_id);
      if (erroEndereco) {
        console.error(`[PATCH /api/cobrancas-rs/[id]] Não foi possível gravar o endereço no cadastro do cliente ${atual.cliente_id}:`, erroEndereco.code ?? "sem código");
        avisos.push("O endereço não pôde ser salvo no cadastro do cliente (a cobrança foi salva). Atualize o cadastro do cliente.");
      }
    }
    if (documentoNovo) {
      const tipoDoc = tipoDocumentoDaCobranca(tipoPessoa);
      const rotulo = tipoDoc === "cpf" ? "CPF" : "CNPJ";
      // O documento digitado pode já ser de OUTRO cliente (qualquer unidade, ativo ou inativo): nesse caso não se grava no cadastro. Sem nome,
      // cidade nem id do outro cadastro; se for de outra unidade, só "fale com a diretoria" (mesma regra do cadastro de cliente).
      const identidades = await carregarIdentidadesClientes(svc);
      if (!identidades) {
        avisos.push(`Não foi possível conferir se o ${rotulo} já existe em outro cliente; o cadastro do cliente não foi atualizado com ele (a cobrança foi salva).`);
      } else {
        const outro = documentoJaCadastradoEmOutroCliente(documentoNovo, tipoDoc, identidades, atual.cliente_id, atual.unidade_id ?? null);
        if (outro.existe) {
          console.error(`[PATCH /api/cobrancas-rs/[id]] ${rotulo} do snapshot já pertence a outro cliente — cadastro do cliente ${atual.cliente_id} não foi atualizado (cobrança ${id}).`);
          avisos.push(outro.outraUnidade ? MSG_DOCUMENTO_OUTRA_UNIDADE : `Este ${rotulo} já pertence a outro cliente; o cadastro não foi atualizado (a cobrança foi salva).`);
        } else {
          // PF grava em clientes.cpf, PJ em clientes.cnpj: nunca o contrário (o check clientes_documento_coerente recusa os dois juntos).
          const coluna = tipoDoc === "cpf" ? "cpf" : "cnpj";
          const { error: erroDocumento } = await svc.from("clientes").update({ [coluna]: documentoNovo }).eq("id", atual.cliente_id);
          if (erroDocumento) {
            console.error(`[PATCH /api/cobrancas-rs/[id]] Não foi possível gravar o ${rotulo} no cadastro do cliente ${atual.cliente_id}:`, erroDocumento.code ?? "sem código");
            avisos.push(
              erroDocumento.code === "23505"
                ? `Este ${rotulo} acabou de ser cadastrado em outro cliente; o cadastro não foi atualizado (a cobrança foi salva).`
                : `O ${rotulo} não pôde ser salvo no cadastro do cliente (a cobrança foi salva). Atualize o cadastro do cliente.`
            );
          }
        }
      }
    }
  }

  return NextResponse.json({ data, avisos });
}
