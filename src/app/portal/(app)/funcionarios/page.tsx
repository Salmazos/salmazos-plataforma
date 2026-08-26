import { redirect } from "next/navigation";
import Link from "next/link";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { formatarDataSemFuso, formatarCPF, formatarTelefone } from "@/lib/utils";
import { calcularStatusAso, ASO_STATUS_INFO } from "@/lib/asoStatus";
import PortalDocumentoBadge from "@/components/PortalDocumentoBadge";

export const dynamic = "force-dynamic";

// Binário — não tem meio-termo como o ASO periódico (que tem "vencendo"). Só existe
// pelo menos 1 linha em funcionario_contratos, ou não existe nenhuma.
const CONTRATO_STATUS_INFO = {
  assinado: { label: "Assinado", bg: "#D1FAE5", text: "#166534" },
  pendente: { label: "Pendente", bg: "#FEF3C7", text: "#92400E" },
};

// Grupo "rótulo em cima, valor embaixo" — mesmo padrão de layout usado no painel interno
// (ver Campo em FuncionariosPageClient.tsx), duplicado aqui de propósito: telas com campos
// diferentes (portal não tem Empresa/Modalidade/Status/Ações do RH), não vale a pena
// compartilhar um componente só pra isso.
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 90 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 3px", whiteSpace: "nowrap" }}>
        {label}
      </p>
      <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{children}</div>
    </div>
  );
}

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
    .select("id, nome_completo, cargo, data_admissao, admissao_id, turno")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "ativo")
    .order("nome_completo");

  const funcionarioIds = (funcionarios ?? []).map((f) => f.id);

  // Data de nascimento/CPF/RG/PIS não existem em `funcionarios` — vêm de
  // admissao_dados_pessoais, preenchida no formulário de admissão digital. Sem FK direta
  // entre as duas tabelas (cada uma referencia `admissoes` separadamente, ver
  // funcionarios.admissao_id), então não dá pra usar embed do PostgREST — segunda consulta
  // por admissao_id e mapeia manualmente, mesmo padrão já usado no projeto pra esse tipo de
  // relação (ver funcionario_asos/funcionario_contratos × analistas_perfil).
  const admissaoIds = [...new Set((funcionarios ?? []).map((f) => f.admissao_id).filter(Boolean))] as string[];

  const [{ data: asos }, { data: contratos }, { data: dadosPessoais }, { data: admissoes }] = await Promise.all([
    funcionarioIds.length
      ? service.from("funcionario_asos").select("funcionario_id, data_exame, arquivo_path").in("funcionario_id", funcionarioIds).is("excluido_em", null).order("data_exame", { ascending: false })
      : Promise.resolve({ data: [] as { funcionario_id: string; data_exame: string; arquivo_path: string | null }[] }),
    funcionarioIds.length
      ? service.from("funcionario_contratos").select("funcionario_id, arquivo_path").in("funcionario_id", funcionarioIds).is("excluido_em", null).order("criado_em", { ascending: false })
      : Promise.resolve({ data: [] as { funcionario_id: string; arquivo_path: string | null }[] }),
    admissaoIds.length
      ? service.from("admissao_dados_pessoais").select("admissao_id, data_nascimento, cpf, rg_numero, pis_pasep").in("admissao_id", admissaoIds)
      : Promise.resolve({ data: [] as { admissao_id: string; data_nascimento: string | null; cpf: string | null; rg_numero: string | null; pis_pasep: string | null }[] }),
    // admissao_id -> candidato_id, pra chegar em candidatos.telefone e no encaminhamento do
    // portal (não existe telefone nem FK direta pra candidato em `funcionarios`).
    admissaoIds.length
      ? service.from("admissoes").select("id, candidato_id").in("id", admissaoIds)
      : Promise.resolve({ data: [] as { id: string; candidato_id: string }[] }),
  ]);

  const dadosPessoaisPorAdmissao = new Map((dadosPessoais ?? []).map((d) => [d.admissao_id, d]));
  const candidatoIdPorAdmissao = new Map((admissoes ?? []).map((a) => [a.id, a.candidato_id]));
  const candidatoIds = [...new Set((admissoes ?? []).map((a) => a.candidato_id).filter(Boolean))];

  // Telefone do candidato + o encaminhamento que abre o perfil dele dentro do portal
  // (rota /portal/candidato/[id] espera o id do ENCAMINHAMENTO, não do candidato — é ela
  // que valida que o encaminhamento pertence a este cliente antes de mostrar o perfil).
  const [{ data: candidatos }, { data: encaminhamentos }] = await Promise.all([
    candidatoIds.length
      ? service.from("candidatos").select("id, telefone").in("id", candidatoIds)
      : Promise.resolve({ data: [] as { id: string; telefone: string | null }[] }),
    candidatoIds.length
      ? service.from("encaminhamentos").select("id, candidato_id").in("candidato_id", candidatoIds).eq("cliente_id", clienteUsuario.cliente_id)
      : Promise.resolve({ data: [] as { id: string; candidato_id: string }[] }),
  ]);

  const telefonePorCandidato = new Map((candidatos ?? []).map((c) => [c.id, c.telefone]));
  const encaminhamentoPorCandidato = new Map((encaminhamentos ?? []).map((e) => [e.candidato_id, e.id]));

  // Já ordenado por data_exame desc — o primeiro encontro de cada funcionario_id é o
  // exame mais recente (mesma técnica já usada no painel interno). arquivo_path do exame
  // mais recente decide se o badge abre um documento: pode haver ASO registrado sem
  // arquivo anexado (schema permite), aí o badge mostra o status mas não é clicável.
  const dataExameMaisRecentePorFuncionario = new Map<string, string>();
  const arquivoAsoMaisRecentePorFuncionario = new Map<string, string | null>();
  for (const a of asos ?? []) {
    if (!dataExameMaisRecentePorFuncionario.has(a.funcionario_id)) {
      dataExameMaisRecentePorFuncionario.set(a.funcionario_id, a.data_exame);
      arquivoAsoMaisRecentePorFuncionario.set(a.funcionario_id, a.arquivo_path);
    }
  }
  const funcionarioIdsComContrato = new Set((contratos ?? []).map((c) => c.funcionario_id));
  // Mesma técnica — já ordenado por criado_em desc, primeiro encontro = contrato mais
  // recente. Badge "Assinado" só reflete existir pelo menos 1 contrato (funcionarioIdsComContrato
  // acima); o arquivo clicável é sempre o do contrato mais recente especificamente.
  const arquivoContratoMaisRecentePorFuncionario = new Map<string, string | null>();
  for (const c of contratos ?? []) {
    if (!arquivoContratoMaisRecentePorFuncionario.has(c.funcionario_id)) {
      arquivoContratoMaisRecentePorFuncionario.set(c.funcionario_id, c.arquivo_path);
    }
  }

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
        {(funcionarios ?? []).length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
            Nenhum funcionário ativo encontrado.
          </p>
        ) : (
          (funcionarios ?? []).map((f, i) => {
            const badgeAso = ASO_STATUS_INFO[calcularStatusAso(dataExameMaisRecentePorFuncionario.get(f.id) ?? null)];
            const badgeContrato = funcionarioIdsComContrato.has(f.id)
              ? CONTRATO_STATUS_INFO.assinado
              : CONTRATO_STATUS_INFO.pendente;
            const urlAso = arquivoAsoMaisRecentePorFuncionario.get(f.id)
              ? `/api/portal/funcionarios/${f.id}/aso-url`
              : null;
            const urlContrato = arquivoContratoMaisRecentePorFuncionario.get(f.id)
              ? `/api/portal/funcionarios/${f.id}/contrato-url`
              : null;
            const dadosPessoais = f.admissao_id ? dadosPessoaisPorAdmissao.get(f.admissao_id) : undefined;
            const candidatoId = f.admissao_id ? candidatoIdPorAdmissao.get(f.admissao_id) : undefined;
            const telefone = candidatoId ? telefonePorCandidato.get(candidatoId) : undefined;
            const encaminhamentoId = candidatoId ? encaminhamentoPorCandidato.get(candidatoId) : undefined;
            const nomeStyle: React.CSSProperties = {
              fontSize: 16,
              fontWeight: 700,
              color: "#111827",
              textDecoration: "underline",
              textDecorationThickness: 1,
              margin: "0 0 12px",
            };
            return (
              <div
                key={f.id}
                style={{
                  padding: "16px 20px",
                  borderBottom: i < (funcionarios ?? []).length - 1 ? "1px solid #F3F4F6" : "none",
                }}
              >
                {/* Só vira link quando existe encaminhamento pra esse cliente+candidato —
                    funcionário de R&S puro ou dado legado sem encaminhamento retroativo não
                    tem perfil de portal pra abrir (ver checklist ambiguidade FK no CLAUDE.md
                    sobre o histórico desse relacionamento). */}
                {encaminhamentoId ? (
                  <Link
                    href={`/portal/candidato/${encaminhamentoId}`}
                    style={{ ...nomeStyle, display: "inline-block" }}
                    className="hover:text-[#92400E] transition-colors"
                  >
                    {f.nome_completo}
                  </Link>
                ) : (
                  <p style={nomeStyle}>{f.nome_completo}</p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 28, rowGap: 14 }}>
                  <Campo label="Data de nascimento">
                    {dadosPessoais?.data_nascimento ? formatarDataSemFuso(dadosPessoais.data_nascimento) : "—"}
                  </Campo>
                  <Campo label="RG">{dadosPessoais?.rg_numero ?? "—"}</Campo>
                  <Campo label="CPF">{dadosPessoais?.cpf ? formatarCPF(dadosPessoais.cpf) : "—"}</Campo>
                  <Campo label="PIS">{dadosPessoais?.pis_pasep ?? "—"}</Campo>
                  <Campo label="Data de admissão">{f.data_admissao ? formatarDataSemFuso(f.data_admissao) : "—"}</Campo>
                  <Campo label="Função">{f.cargo ?? "—"}</Campo>
                  <Campo label="Turno de trabalho">{f.turno ?? "—"}</Campo>
                  <Campo label="Celular">{telefone ? formatarTelefone(telefone) : "—"}</Campo>
                  <Campo label="ASO Periódico">
                    <PortalDocumentoBadge label={badgeAso.label} bg={badgeAso.bg} text={badgeAso.text} url={urlAso} />
                  </Campo>
                  <Campo label="Contrato">
                    <PortalDocumentoBadge label={badgeContrato.label} bg={badgeContrato.bg} text={badgeContrato.text} url={urlContrato} />
                  </Campo>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
