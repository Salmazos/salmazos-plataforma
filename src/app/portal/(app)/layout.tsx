import { redirect } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import SidebarPortal from "@/components/SidebarPortal";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const { data: cliente } = await service
    .from("clientes")
    .select("ativo, logo_url")
    .eq("id", clienteUsuario.cliente_id)
    .single();

  if (!cliente?.ativo) redirect("/portal/login?suspenso=1");

  // Item "Funcionários" só aparece pra quem tem pelo menos 1 funcionário ativo — não faz
  // sentido mostrar uma lista vazia pra cliente que nunca teve alocação via MOT/Terceirização.
  const { data: funcionarioAtivo } = await service
    .from("funcionarios")
    .select("id")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <SidebarPortal userEmail={user.email ?? ""} mostrarFuncionarios={!!funcionarioAtivo} />
      <main className="flex-1 min-w-0 px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Cabeçalho compartilhado em toda página do portal (área branca de conteúdo,
              distinto do logo Salmazos na sidebar preta). "Solicitar Vaga" morava como item
              do menu lateral (SidebarPortal); saiu de lá e virou este botão centralizado,
              mesmo destino, visível em toda página. */}
          <div className="flex justify-center mb-6">
            <Link
              href="/portal/solicitar-vaga"
              className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-90"
              style={{
                backgroundColor: "#FFD700",
                color: "#000",
                fontWeight: 700,
                padding: "10px 24px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              <PlusCircle size={16} />
              Solicitar Vaga
            </Link>
          </div>

          {/* Logo do cliente — só renderiza se o cliente tiver logo cadastrado (upload em
              /painel/clientes). */}
          {cliente?.logo_url && (
            <div className="flex justify-end mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cliente.logo_url}
                alt="Logo da empresa"
                style={{ height: 48, width: "auto", maxWidth: 180, objectFit: "contain" }}
              />
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
