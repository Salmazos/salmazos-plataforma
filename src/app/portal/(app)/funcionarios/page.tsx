import { redirect } from "next/navigation";
import Link from "next/link";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { formatarDataSemFuso } from "@/lib/utils";
import { calcularStatusAso, ASO_STATUS_INFO } from "@/lib/asoStatus";

export const dynamic = "force-dynamic";

// Binário — não tem meio-termo como o ASO periódico (que tem "vencendo"). Só existe
// pelo menos 1 linha em funcionario_contratos, ou não existe nenhuma.
const CONTRATO_STATUS_INFO = {
  assinado: { label: "Assinado", bg: "#D1FAE5", text: "#166534" },
  pendente: { label: "Pendente", bg: "#FEF3C7", text: "#92400E" },
};

export default async function PortalFuncionariosPage() {
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

  // Por construção, toda linha em `funcionarios` já é MOT ou Terceirização — R&S nunca
  // gera registro aqui (bloqueado desde a Fase 1) — não há necessidade de filtrar por
  // tipo_servico, só por cliente_id + status ativo.
  const { data: funcionarios } = await service
    .from("funcionarios")
    .select("id, nome_completo, cargo, data_admissao")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "ativo")
    .order("nome_completo");

  const funcionarioIds = (funcionarios ?? []).map((f) => f.id);

  const [{ data: asos }, { data: contratos }] = await Promise.all([
    funcionarioIds.length
      ? service.from("funcionario_asos").select("funcionario_id, data_exame").in("funcionario_id", funcionarioIds).is("excluido_em", null).order("data_exame", { ascending: false })
      : Promise.resolve({ data: [] as { funcionario_id: string; data_exame: string }[] }),
    funcionarioIds.length
      ? service.from("funcionario_contratos").select("funcionario_id").in("funcionario_id", funcionarioIds).is("excluido_em", null)
      : Promise.resolve({ data: [] as { funcionario_id: string }[] }),
  ]);

  // Já ordenado por data_exame desc — o primeiro encontro de cada funcionario_id é o
  // exame mais recente (mesma técnica já usada no painel interno).
  const dataExameMaisRecentePorFuncionario = new Map<string, string>();
  for (const a of asos ?? []) {
    if (!dataExameMaisRecentePorFuncionario.has(a.funcionario_id)) {
      dataExameMaisRecentePorFuncionario.set(a.funcionario_id, a.data_exame);
    }
  }
  const funcionarioIdsComContrato = new Set((contratos ?? []).map((c) => c.funcionario_id));

  return (
    <div>
      <Link
        href="/portal"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50 mb-4"
      >
        <span className="text-base font-bold">←</span>
        Voltar
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Funcionários</h1>
        <p className="text-gray-500 text-sm mt-1">
          Funcionários ativos alocados na sua empresa. Somente leitura.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                {["Nome", "Cargo", "Data de admissão", "ASO Periódico", "Contrato"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(funcionarios ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "40px 16px", textAlign: "center", color: "#9CA3AF" }}>
                    Nenhum funcionário ativo encontrado.
                  </td>
                </tr>
              ) : (
                (funcionarios ?? []).map((f) => {
                  const badgeAso = ASO_STATUS_INFO[calcularStatusAso(dataExameMaisRecentePorFuncionario.get(f.id) ?? null)];
                  const badgeContrato = funcionarioIdsComContrato.has(f.id)
                    ? CONTRATO_STATUS_INFO.assinado
                    : CONTRATO_STATUS_INFO.pendente;
                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600, color: "#111827" }}>{f.nome_completo}</td>
                      <td style={{ padding: "10px 16px", color: "#374151" }}>{f.cargo ?? "—"}</td>
                      <td style={{ padding: "10px 16px", color: "#6B7280" }}>
                        {f.data_admissao ? formatarDataSemFuso(f.data_admissao) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badgeAso.bg, color: badgeAso.text }}>
                          {badgeAso.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badgeContrato.bg, color: badgeContrato.text }}>
                          {badgeContrato.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
