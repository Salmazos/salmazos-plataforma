import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AdmissoesClient from "@/components/AdmissoesClient";

export const dynamic = "force-dynamic";

export default async function AdmissoesPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria", "supervisor"].includes(role)) redirect("/painel");

  const svc = createServiceClient();

  const { data: admissoes } = await svc
    .from("admissoes")
    .select("*, candidatos(id, nome_completo, cargo_pretendido, telefone), vagas(id, titulo)")
    .order("criado_em", { ascending: false });

  const ids = (admissoes ?? []).map((a) => a.id);
  const { data: docs } = ids.length
    ? await svc.from("admissao_documentos").select("admissao_id, status").in("admissao_id", ids)
    : { data: [] as { admissao_id: string; status: string }[] };

  const progressoPorAdmissao = new Map<string, number>();
  for (const d of docs ?? []) {
    if (d.status === "enviado" || d.status === "aprovado") {
      progressoPorAdmissao.set(d.admissao_id, (progressoPorAdmissao.get(d.admissao_id) ?? 0) + 1);
    }
  }

  const admissoesComProgresso = (admissoes ?? []).map((a) => ({
    ...a,
    docsEnviados: progressoPorAdmissao.get(a.id) ?? 0,
    docsTotal: 16,
  }));

  return <AdmissoesClient admissoesIniciais={admissoesComProgresso} />;
}
