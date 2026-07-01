import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AdmissaoDetalheClient from "@/components/AdmissaoDetalheClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdmissaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria", "supervisor"].includes(role)) redirect("/painel");

  const svc = createServiceClient();

  const { data: admissao } = await svc
    .from("admissoes")
    .select("*, candidatos(id, nome_completo, cargo_pretendido, telefone, email), vagas(id, titulo)")
    .eq("id", id)
    .single();

  if (!admissao) notFound();

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }, { data: auditLogs }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("audit_logs").select("id, created_at, usuario_nome, acao, detalhes").eq("entidade", "admissoes").eq("entidade_id", id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/painel/admissoes" className="hover:text-[#FFB800] transition-colors">
          ← Voltar para Admissões
        </Link>
      </div>

      <AdmissaoDetalheClient
        admissao={admissao}
        dadosPessoais={dadosPessoais ?? null}
        dependentes={dependentes ?? []}
        documentos={documentos ?? []}
        auditLogs={auditLogs ?? []}
      />
    </div>
  );
}
