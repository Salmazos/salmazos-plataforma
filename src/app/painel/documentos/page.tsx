import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DocumentosPageClient from "@/components/DocumentosPageClient";
import { podeAcessarDocumentos } from "@/lib/documentosAuth";
import { resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) redirect("/login");
  if (!(await podeAcessarDocumentos(user))) redirect("/painel");

  const role = user.app_metadata?.role ?? "analista";
  const isFullAccess = ["superuser", "diretoria"].includes(role);
  const isSupervisorOrAbove = ["superuser", "diretoria", "supervisor"].includes(role);

  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return <SemAcessoPainel />;

  const supabase = createServiceClient();

  // Documentos de cliente: só os clientes da unidade de quem está vendo (sócios veem todos).
  let clientesQuery = supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome");
  if (!ctx.todasUnidades) clientesQuery = clientesQuery.eq("unidade_id", ctx.unidadeId);

  const [{ data: clientes }, { data: perfil }] = await Promise.all([
    clientesQuery,
    supabase
      .from("analistas_perfil")
      .select("id")
      .eq("user_id", user.id)
      .single(),
  ]);

  return (
    <DocumentosPageClient
      clientes={clientes ?? []}
      isFullAccess={isFullAccess}
      isSupervisorOrAbove={isSupervisorOrAbove}
      analistaId={perfil?.id ?? null}
    />
  );
}
