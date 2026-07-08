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
    .select("*, candidatos(id, nome_completo, cargo_pretendido, telefone, email), vagas(id, titulo, cliente_id, clientes(id, nome))")
    .eq("id", id)
    .single();

  if (!admissao) notFound();

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }, { data: adicionais }, { data: auditLogs }, { data: valeTransporte }, { data: autorizacaoSindical }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_adicionais").select("*").eq("admissao_id", id).order("criado_em", { ascending: true }),
    svc.from("audit_logs").select("id, created_at, usuario_nome, acao, detalhes").eq("entidade", "admissoes").eq("entidade_id", id).order("created_at", { ascending: false }),
    svc.from("admissao_vale_transporte").select("*, admissao_vt_linhas(*)").eq("admissao_id", id).order("ordem", { referencedTable: "admissao_vt_linhas", ascending: true }).maybeSingle(),
    svc.from("admissao_autorizacao_sindical").select("*").eq("admissao_id", id).maybeSingle(),
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
        adicionais={adicionais ?? []}
        auditLogs={auditLogs ?? []}
        valeTransporte={valeTransporte ?? null}
        autorizacaoSindical={autorizacaoSindical ?? null}
      />
    </div>
  );
}
