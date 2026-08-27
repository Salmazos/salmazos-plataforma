import { redirect } from "next/navigation";
import Link from "next/link";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { formatarDataSemFuso, formatarCPF, formatarTelefone } from "@/lib/utils";
import { calcularStatusAso, ASO_STATUS_INFO } from "@/lib/asoStatus";
import PortalFuncionariosListClient, { type FuncionarioPortalRow } from "@/components/PortalFuncionariosListClient";

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

  // Monta as linhas já com tudo resolvido/formatado no servidor — o componente client
  // (PortalFuncionariosListClient) só filtra por nome e renderiza, sem repetir nenhuma
  // lógica de negócio nem fazer chamada de API adicional.
  const linhas: FuncionarioPortalRow[] = (funcionarios ?? []).map((f) => {
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
    // Só vira link quando existe encaminhamento pra esse cliente+candidato — funcionário
    // de R&S puro ou dado legado sem encaminhamento retroativo não tem perfil de portal
    // pra abrir (ver checklist ambiguidade FK no CLAUDE.md sobre o histórico desse
    // relacionamento).
    const encaminhamentoId = candidatoId ? (encaminhamentoPorCandidato.get(candidatoId) ?? null) : null;

    return {
      id: f.id,
      nomeCompleto: f.nome_completo,
      encaminhamentoId,
      dataNascimento: dadosPessoais?.data_nascimento ? formatarDataSemFuso(dadosPessoais.data_nascimento) : "—",
      rg: dadosPessoais?.rg_numero ?? "—",
      cpf: dadosPessoais?.cpf ? formatarCPF(dadosPessoais.cpf) : "—",
      pis: dadosPessoais?.pis_pasep ?? "—",
      dataAdmissao: f.data_admissao ? formatarDataSemFuso(f.data_admissao) : "—",
      cargo: f.cargo ?? "—",
      turno: f.turno ?? "—",
      celular: telefone ? formatarTelefone(telefone) : "—",
      badgeAso: { ...badgeAso, url: urlAso },
      badgeContrato: { ...badgeContrato, url: urlContrato },
    };
  });

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

      <PortalFuncionariosListClient funcionarios={linhas} />
    </div>
  );
}
