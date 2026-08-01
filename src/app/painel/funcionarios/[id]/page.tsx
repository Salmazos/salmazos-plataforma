import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FuncionarioDetalheClient from "@/components/FuncionarioDetalheClient";
import { PAPEIS_PAINEL_FUNCIONARIOS } from "@/lib/funcionariosAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function FuncionarioDetalhePage({ params }: Params) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_FUNCIONARIOS.includes(role)) redirect("/painel");
  const podeExcluirDocumento = PAPEIS_FULL_ACCESS.includes(role);

  const { id } = await params;
  const svc = createServiceClient();

  const { data: funcionario } = await svc
    .from("funcionarios")
    .select("*, clientes(nome)")
    .eq("id", id)
    .maybeSingle();

  if (!funcionario) notFound();

  const [{ data: asos }, { data: contratos }, { data: clientes }] = await Promise.all([
    svc.from("funcionario_asos").select("*").eq("funcionario_id", id).is("excluido_em", null).order("data_exame", { ascending: false }),
    svc.from("funcionario_contratos").select("*").eq("funcionario_id", id).is("excluido_em", null).order("criado_em", { ascending: false }),
    svc.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // Sem FK direta entre criado_por (em funcionario_asos/funcionario_contratos) e
  // analistas_perfil (mesmo caso já resolvido em rescisao_avisos_plataforma_destinatarios) —
  // resolve o nome com uma segunda consulta em vez de um embed do PostgREST, que não existe
  // pra esse relacionamento. Uma única consulta cobre os dois históricos.
  const userIds = [
    ...new Set([...(asos ?? []).map((a) => a.criado_por), ...(contratos ?? []).map((c) => c.criado_por)].filter(Boolean)),
  ];
  const { data: perfis } = userIds.length
    ? await svc.from("analistas_perfil").select("user_id, nome_completo").in("user_id", userIds)
    : { data: [] };
  const nomePorUserId = new Map((perfis ?? []).map((p) => [p.user_id, p.nome_completo]));

  const asosComNome = (asos ?? []).map((a) => ({
    ...a,
    criado_por_nome: a.criado_por ? nomePorUserId.get(a.criado_por) ?? "Usuário removido" : null,
  }));
  const contratosComNome = (contratos ?? []).map((c) => ({
    ...c,
    criado_por_nome: c.criado_por ? nomePorUserId.get(c.criado_por) ?? "Usuário removido" : null,
  }));

  return (
    <FuncionarioDetalheClient
      funcionario={funcionario}
      asosIniciais={asosComNome}
      contratosIniciais={contratosComNome}
      clientes={clientes ?? []}
      podeExcluirDocumento={podeExcluirDocumento}
    />
  );
}
