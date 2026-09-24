import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, clienteUpdateSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { checarAcessoCliente, resolverUnidadeUsuario } from "@/lib/unidadeAuth";

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
    if (body.endereco !== undefined) campos.endereco = body.endereco || null;
    if (body.processo_simplificado !== undefined) campos.processo_simplificado = body.processo_simplificado;
    if (novaUnidadeId !== undefined) campos.unidade_id = novaUnidadeId;

    const { data, error } = await supabase
      .from("clientes")
      .update(campos)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
    if (campos.contato_email !== undefined) {
      await supabase
        .from("cobrancas_rs")
        .update({ cliente_email_snapshot: campos.contato_email })
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
