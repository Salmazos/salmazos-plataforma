import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dados do cadastro para pré-preencher a proposta depois de escolher a empresa da Carteira: contato principal (nome e cargo), CNPJ, endereço (só o texto) e
// cidade do cliente ligado. NADA além disso sai daqui (sem telefone, e-mail nem CPF) e nada é gravado nem registrado em log.
// Mesma regra das demais rotas de Propostas: só quem pode escrever; só empresa da unidade do usuário (outra unidade = 404, mesmo com acesso a todas);
// empresa de TESTE só para o gestor (para os demais responde 404, como se não existisse).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });

  const naoEncontrada = () => NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const falha = () => NextResponse.json({ error: "Não foi possível carregar os dados do cadastro." }, { status: 500 });
  if (!UUID.test(id)) return naoEncontrada();

  const svc = createServiceClient();
  const { data: empresa, error: erroEmpresa } = await svc.from("empresas_visitadas").select("id, unidade_id, cliente_id, cidade").eq("id", id).maybeSingle();
  if (erroEmpresa) return falha();
  if (!empresa || !ctx.unidadeId || empresa.unidade_id !== ctx.unidadeId) return naoEncontrada();

  if (!ctx.gestor) {
    const { data: marca, error: erroMarca } = await svc.from("empresas_teste").select("empresa_id").eq("empresa_id", id).maybeSingle();
    if (erroMarca) return falha();
    if (marca) return naoEncontrada();
  }

  // Principal primeiro; sem principal, o primeiro (por nome), como na lista de contatos da proposta.
  const { data: contato, error: erroContato } = await svc
    .from("empresa_contatos")
    .select("nome, cargo, principal")
    .eq("empresa_visitada_id", id)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (erroContato) return falha();

  // CNPJ e cidade só do cliente LIGADO à empresa e da mesma unidade (cadastro de outra unidade nunca é lido por aqui). Sem cliente: sem CNPJ.
  let cnpj: string | null = null;
  let cidade: string | null = null;
  let endereco: string | null = null;
  if (empresa.cliente_id) {
    const { data: cliente, error: erroCliente } = await svc.from("clientes").select("cnpj, cidade, endereco, unidade_id").eq("id", empresa.cliente_id).maybeSingle();
    if (erroCliente) return falha();
    if (cliente && cliente.unidade_id === ctx.unidadeId) {
      cnpj = (cliente.cnpj as string | null)?.trim() || null;
      cidade = (cliente.cidade as string | null)?.trim() || null;
      endereco = (cliente.endereco as string | null)?.trim() || null;
    }
  }
  cidade = cidade ?? ((empresa.cidade as string | null)?.trim() || null);

  return NextResponse.json({
    data: {
      contato: contato ? { nome: contato.nome as string, cargo: (contato.cargo as string | null) ?? null } : null,
      cnpj,
      // O front usa o endereço quando existir; senão a cidade; senão deixa vazio.
      endereco,
      cidade,
    },
  });
}
