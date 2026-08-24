import { redirect } from "next/navigation";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import PortalDocumentosPageClient from "@/components/PortalDocumentosPageClient";

export const dynamic = "force-dynamic";

export default async function PortalDocumentosPage() {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) redirect("/portal/login");

  // Dataset pequeno por cliente (poucas dezenas de documentos no máximo) — busca tudo de
  // uma vez (categorias customizadas + documentos) e agrupa no client, sem precisar de
  // rota própria de listagem por categoria (diferente do painel interno, que pagina por
  // categoria sob demanda porque cobre TODOS os clientes de uma vez).
  const [{ data: categoriasCustomizadas }, { data: documentos }] = await Promise.all([
    service
      .from("documentos_categorias_customizadas")
      .select("id, chave, label")
      .eq("cliente_id", clienteUsuario.cliente_id)
      .order("criado_em", { ascending: true }),
    service
      .from("documentos")
      .select("id, nome, categoria, extensao, created_at")
      .eq("tipo", "cliente")
      .eq("cliente_id", clienteUsuario.cliente_id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <PortalDocumentosPageClient
      categoriasCustomizadas={categoriasCustomizadas ?? []}
      documentos={documentos ?? []}
    />
  );
}
