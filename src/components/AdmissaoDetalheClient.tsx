"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/utils";
import { ADMISSAO_STATUS_BADGE, ADMISSAO_STATUS_OPTIONS, MODALIDADE_LABEL, STATUS_JA_ENVIADO } from "@/lib/admissaoStatus";
import { MOTIVOS_REJEICAO_DOCUMENTO } from "@/lib/admissaoConstants";
import { OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import {
  ESTADO_CIVIL_OPTIONS, GRAU_INSTRUCAO_OPTIONS, OPCAO_VALE_TRANSPORTE_LABEL,
  COR_RACA_OPTIONS, PARENTESCO_OPTIONS, CNH_CATEGORIAS,
} from "@/lib/admissaoConstants";
import { ENTIDADES_CONTRATANTES } from "@/lib/constants";
import ModalContaSalario from "@/components/ModalContaSalario";
import ModalAssinaturaEletronica from "@/components/ModalAssinaturaEletronica";
import type { AdmissaoAdicional, AdmissaoDadosPessoais, AdmissaoDependente, AdmissaoDocumento } from "@/types";

type Tab = "dados" | "documentos" | "notas";

interface AdmissaoVtLinha {
  id: string;
  onibus_viacao: string | null;
  percurso: string | null;
  valor_unitario: number | null;
  valor_total_diario: number | null;
  ordem: number;
}

interface AdmissaoValeTransporte {
  opcao: string | null;
  dias_semana: string | null;
  bairro_cidade_trabalho: string | null;
  admissao_vt_linhas: AdmissaoVtLinha[];
}

interface AdmissaoAutorizacaoSindical {
  nome_sindicato: string | null;
  autoriza_assistencial_confederativa: boolean | null;
  autoriza_sindical: boolean | null;
}

interface AdmissaoFull {
  id: string;
  modalidade: string;
  status: string;
  token: string;
  token_expira_em: string;
  criado_em: string;
  vaga_id: string | null;
  funcao: string | null;
  salario: number | null;
  horario_trabalho: string | null;
  data_admissao: string | null;
  entidade_contratante: string | null;
  observacoes_internas: string | null;
  pdf_pacote_path: string | null;
  pdf_pacote_gerado_em: string | null;
  pdf_pacote_gerado_por: string | null;
  pacote_gerado_forcado: boolean;
  pacote_gerado_justificativa: string | null;
  carta_banco_path: string | null;
  carta_banco_enviada_em: string | null;
  carta_banco_enviada_por: string | null;
  carta_banco_id: string | null;
  carta_banco_nome: string | null;
  metodo_assinatura: string | null;
  assinatura_provedor: string | null;
  assinatura_documento_externo_id: string | null;
  assinatura_em: string | null;
  assinatura_path: string | null;
  lgpd_aceite_em: string | null;
  lgpd_aceite_ip: string | null;
  candidatos: { id: string; nome_completo: string; cargo_pretendido: string; telefone: string | null; email: string | null } | null;
  vagas: { id: string; titulo: string; cliente_id: string | null; clientes: { id: string; nome: string } | null } | null;
}

interface AuditLogEntry {
  id: string;
  created_at: string;
  usuario_nome: string | null;
  acao: string;
  detalhes: Record<string, unknown> | null;
}

interface Props {
  admissao: AdmissaoFull;
  dadosPessoais: AdmissaoDadosPessoais | null;
  dependentes: AdmissaoDependente[];
  documentos: AdmissaoDocumento[];
  adicionais: AdmissaoAdicional[];
  auditLogs: AuditLogEntry[];
  valeTransporte: AdmissaoValeTransporte | null;
  autorizacaoSindical: AdmissaoAutorizacaoSindical | null;
}

const ACAO_LABEL: Record<string, string> = {
  admissao_criada: "Admissão criada",
  admissao_atualizada: "Admissão atualizada",
  admissao_pacote_gerado: "Pacote para contabilidade gerado",
  admissao_pacote_gerado_forcado: "Pacote gerado com pendências (forçado)",
  admissao_documento_upload_pela_equipe: "Documento enviado pela equipe",
  admissao_dados_pessoais_editados_pelo_analista: "Dados pessoais editados pelo analista",
  admissao_dependente_criado_pelo_analista: "Dependente adicionado pelo analista",
  admissao_dependente_editado_pelo_analista: "Dependente editado pelo analista",
  admissao_dependente_removido_pelo_analista: "Dependente removido pelo analista",
  admissao_vale_transporte_editado_pelo_analista: "Vale Transporte editado pelo analista",
  admissao_dados_admissao_editados_pelo_analista: "Vaga/dados da admissão editados pelo analista",
  admissao_adicionais_atualizados: "Adicionais atualizados",
  admissao_autorizacao_sindical_atualizada: "Autorização Sindical atualizada",
};

function Linha({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card mb-4">
      <p className="section-title">{titulo}</p>
      {children}
    </div>
  );
}

function formatarAdicionalValor(formatoValor: "percentual" | "fixo", valor: number): string {
  return formatoValor === "percentual"
    ? `${valor.toLocaleString("pt-BR")}%`
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseValorAdicional(value: string): number {
  const digits = value.replace(/\s/g, "").replace(/^R\$/, "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(digits);
  return isNaN(num) ? 0 : num;
}

interface AdicionalLinha {
  tipo: string;
  valor: string;
  formato_valor: "percentual" | "fixo";
}

// ── Edição total pelo analista: infraestrutura genérica para os campos de
// admissao_dados_pessoais, organizados nas mesmas seções que já existiam como somente
// leitura. Cada seção compartilha o mesmo formDP/handleSalvarDP (uma linha só na tabela),
// só muda qual subconjunto de campos é mostrado no formulário de edição.
type TipoCampo = "text" | "date" | "select" | "simnao";

interface CampoDef {
  key: string;
  label: string;
  tipo: TipoCampo;
  options?: { value: string; label: string }[];
}

const SIMNAO_OPTIONS = [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }];

const CAMPOS_DADOS_PESSOAIS: CampoDef[] = [
  { key: "nome_completo", label: "Nome completo", tipo: "text" },
  { key: "data_nascimento", label: "Data de nascimento", tipo: "date" },
  { key: "sexo", label: "Sexo", tipo: "select", options: [{ value: "M", label: "Masculino" }, { value: "F", label: "Feminino" }] },
  { key: "estado_civil", label: "Estado civil", tipo: "select", options: ESTADO_CIVIL_OPTIONS },
  { key: "nacionalidade", label: "Nacionalidade", tipo: "text" },
  { key: "naturalidade", label: "Naturalidade", tipo: "text" },
  { key: "pais_nascimento", label: "País de nascimento", tipo: "text" },
  { key: "cor_raca", label: "Cor/Raça", tipo: "select", options: COR_RACA_OPTIONS },
  { key: "cpf", label: "CPF", tipo: "text" },
  { key: "rg_numero", label: "RG número", tipo: "text" },
  { key: "rg_orgao_emissor", label: "RG órgão emissor", tipo: "text" },
  { key: "rg_uf", label: "RG UF", tipo: "text" },
  { key: "rg_data_emissao", label: "RG data de emissão", tipo: "date" },
  { key: "nome_mae", label: "Nome da mãe", tipo: "text" },
  { key: "nacionalidade_mae", label: "Nacionalidade da mãe", tipo: "text" },
  { key: "nome_pai", label: "Nome do pai", tipo: "text" },
  { key: "nacionalidade_pai", label: "Nacionalidade do pai", tipo: "text" },
  { key: "grau_instrucao", label: "Grau de instrução", tipo: "select", options: GRAU_INSTRUCAO_OPTIONS },
];

const CAMPOS_DOCUMENTOS_PROFISSIONAIS: CampoDef[] = [
  { key: "pis_pasep", label: "PIS/PASEP", tipo: "text" },
  { key: "pis_data_cadastramento", label: "Data de cadastramento do PIS", tipo: "date" },
  { key: "possui_ctps_digital", label: "Possui CTPS Digital?", tipo: "simnao" },
  { key: "carteira_trabalho_numero", label: "CTPS Física — número", tipo: "text" },
  { key: "carteira_trabalho_serie", label: "CTPS Física — série", tipo: "text" },
  { key: "carteira_trabalho_uf", label: "CTPS Física — UF", tipo: "text" },
  { key: "ctps_data_emissao", label: "CTPS Física — data de emissão", tipo: "date" },
  { key: "titulo_eleitor", label: "Título de eleitor", tipo: "text" },
  { key: "zona_eleitoral", label: "Zona eleitoral", tipo: "text" },
  { key: "secao_eleitoral", label: "Seção eleitoral", tipo: "text" },
  { key: "reservista", label: "Reservista", tipo: "text" },
  { key: "cnh_numero", label: "CNH número", tipo: "text" },
  { key: "cnh_categoria", label: "CNH categoria", tipo: "select", options: CNH_CATEGORIAS.map((c) => ({ value: c, label: c })) },
  { key: "cnh_validade", label: "CNH validade", tipo: "date" },
  { key: "cnh_data_emissao", label: "CNH data de emissão", tipo: "date" },
  { key: "cnh_uf", label: "CNH UF", tipo: "text" },
];

const CAMPOS_ENDERECO: CampoDef[] = [
  { key: "endereco_cep", label: "CEP", tipo: "text" },
  { key: "endereco_logradouro", label: "Logradouro", tipo: "text" },
  { key: "endereco_numero", label: "Número", tipo: "text" },
  { key: "endereco_complemento", label: "Complemento", tipo: "text" },
  { key: "endereco_bairro", label: "Bairro", tipo: "text" },
  { key: "endereco_cidade", label: "Cidade", tipo: "text" },
  { key: "endereco_uf", label: "UF", tipo: "text" },
  { key: "telefone", label: "Telefone", tipo: "text" },
  { key: "email", label: "E-mail", tipo: "text" },
];

const CAMPOS_BANCARIOS: CampoDef[] = [
  { key: "banco", label: "Banco", tipo: "text" },
  { key: "agencia", label: "Agência", tipo: "text" },
  { key: "conta", label: "Conta", tipo: "text" },
  { key: "tipo_conta", label: "Tipo de conta", tipo: "select", options: [{ value: "corrente", label: "Conta Corrente" }, { value: "poupanca", label: "Conta Poupança" }] },
  { key: "pix", label: "Chave PIX", tipo: "text" },
];

const CAMPOS_SITUACAO_TRABALHISTA: CampoDef[] = [
  { key: "recebendo_seguro_desemprego", label: "Recebendo seguro-desemprego?", tipo: "simnao" },
  { key: "primeiro_emprego", label: "Primeiro emprego?", tipo: "simnao" },
  { key: "trabalhou_empresa_antes", label: "Já trabalhou nesta empresa antes?", tipo: "simnao" },
  { key: "aposentado", label: "Aposentado?", tipo: "simnao" },
  { key: "dependente_ir", label: "Dependente para Imposto de Renda?", tipo: "simnao" },
  { key: "dependente_salario_familia", label: "Dependente para Salário Família?", tipo: "simnao" },
  { key: "tera_adiantamento", label: "Terá adiantamento salarial?", tipo: "simnao" },
];

const CAMPOS_BOOLEANOS_DP = new Set(
  [...CAMPOS_DOCUMENTOS_PROFISSIONAIS, ...CAMPOS_SITUACAO_TRABALHISTA]
    .filter((c) => c.tipo === "simnao")
    .map((c) => c.key)
);

function dpParaFormulario(dp: AdmissaoDadosPessoais | null): Record<string, string> {
  if (!dp) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(dp)) {
    if (v == null) { out[k] = ""; continue; }
    if (typeof v === "boolean") { out[k] = v ? "sim" : "nao"; continue; }
    out[k] = String(v);
  }
  return out;
}

function formularioParaPayload(form: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form)) {
    if (CAMPOS_BOOLEANOS_DP.has(k)) { payload[k] = v === "sim" ? true : v === "nao" ? false : null; continue; }
    payload[k] = v.trim() === "" ? null : v;
  }
  return payload;
}

function CampoValor({ def, valor, onChange }: { def: CampoDef; valor: string; onChange: (v: string) => void }) {
  if (def.tipo === "select" || def.tipo === "simnao") {
    const options = def.tipo === "simnao" ? SIMNAO_OPTIONS : def.options ?? [];
    return (
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="input-field text-sm">
        <option value="">Selecione</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type={def.tipo === "date" ? "date" : "text"}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="input-field text-sm"
    />
  );
}

function SecaoEditavelDP({
  titulo, campos, editando, formDP, salvando, onIniciarEdicao, onCampo, onSalvar, onCancelar, children,
}: {
  titulo: string;
  campos: CampoDef[];
  editando: boolean;
  formDP: Record<string, string>;
  salvando: boolean;
  onIniciarEdicao: () => void;
  onCampo: (key: string, valor: string) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Secao titulo={titulo}>
      <div className="flex justify-end mb-1">
        {!editando && (
          <button onClick={onIniciarEdicao} className="text-xs font-semibold" style={{ color: "#B45309" }}>
            Editar
          </button>
        )}
      </div>
      {editando ? (
        <div>
          {campos.map((c) => (
            <div key={c.key} className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">{c.label}</label>
              <CampoValor def={c} valor={formDP[c.key] ?? ""} onChange={(v) => onCampo(c.key, v)} />
            </div>
          ))}
          <div className="flex gap-2 justify-end mt-2">
            <button onClick={onCancelar} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvando}>
              Cancelar
            </button>
            <button onClick={onSalvar} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      ) : children}
    </Secao>
  );
}

interface DependenteForm {
  id?: string;
  nome: string;
  parentesco: string;
  data_nascimento: string;
  cpf: string;
  nome_mae: string;
  cpf_mae: string;
  cartorio: string;
  local_nascimento: string;
  declaracao_nascido_vivo: string;
  num_registro: string;
  num_livro: string;
  num_folha: string;
}

function dependenteParaFormulario(d: AdmissaoDependente): DependenteForm {
  return {
    id: d.id,
    nome: d.nome ?? "",
    parentesco: d.parentesco ?? "",
    data_nascimento: d.data_nascimento ?? "",
    cpf: d.cpf ?? "",
    nome_mae: d.nome_mae ?? "",
    cpf_mae: d.cpf_mae ?? "",
    cartorio: d.cartorio ?? "",
    local_nascimento: d.local_nascimento ?? "",
    declaracao_nascido_vivo: d.declaracao_nascido_vivo ?? "",
    num_registro: d.num_registro ?? "",
    num_livro: d.num_livro ?? "",
    num_folha: d.num_folha ?? "",
  };
}

const DEPENDENTE_VAZIO: DependenteForm = {
  nome: "", parentesco: "", data_nascimento: "", cpf: "", nome_mae: "", cpf_mae: "",
  cartorio: "", local_nascimento: "", declaracao_nascido_vivo: "", num_registro: "", num_livro: "", num_folha: "",
};

interface ValeTransporteLinhaForm {
  onibus_viacao: string;
  percurso: string;
  valor_unitario: string;
  valor_total_diario: string;
}

interface ValeTransporteForm {
  opcao: string;
  dias_semana: string;
  bairro_cidade_trabalho: string;
  termos_aceitos: string;
  linhas: ValeTransporteLinhaForm[];
}

interface VagaOpcao {
  id: string;
  titulo: string;
  status: string;
  clientes: { id: string; nome: string } | null;
}

export default function AdmissaoDetalheClient({ admissao, dadosPessoais, dependentes, documentos: documentosIniciais, adicionais: adicionaisIniciais, auditLogs, valeTransporte, autorizacaoSindical }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dados");
  const [status, setStatus] = useState(admissao.status);
  const [documentos, setDocumentos] = useState(documentosIniciais);
  const [adicionais, setAdicionais] = useState(adicionaisIniciais);
  const [editandoAdicionais, setEditandoAdicionais] = useState(false);
  const [linhasAdicionais, setLinhasAdicionais] = useState<AdicionalLinha[]>([]);
  const [salvandoAdicionais, setSalvandoAdicionais] = useState(false);
  const [autorizacaoSindicalAtual, setAutorizacaoSindicalAtual] = useState(autorizacaoSindical);
  const [editandoAS, setEditandoAS] = useState(false);
  const [nomeSindicatoEdit, setNomeSindicatoEdit] = useState("");
  const [autorizaAssistencialEdit, setAutorizaAssistencialEdit] = useState<"" | "sim" | "nao">("");
  const [autorizaSindicalEdit, setAutorizaSindicalEdit] = useState<"" | "sim" | "nao">("");
  const [salvandoAS, setSalvandoAS] = useState(false);
  const [observacoes, setObservacoes] = useState(admissao.observacoes_internas ?? "");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [dataExameAdmissional, setDataExameAdmissional] = useState(dadosPessoais?.data_exame_admissional ?? "");
  const [salvandoExame, setSalvandoExame] = useState(false);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [rejeitandoId, setRejeitandoId] = useState<string | null>(null);
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [processandoDocId, setProcessandoDocId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadAlvo, setUploadAlvo] = useState<{ tipo: string; docId?: string; label: string } | null>(null);
  const [enviandoUpload, setEnviandoUpload] = useState(false);
  const [erroUpload, setErroUpload] = useState("");
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [abrindoPacote, setAbrindoPacote] = useState(false);
  const [toast, setToast] = useState("");
  const [erroPacote, setErroPacote] = useState("");
  const [solicitandoCorrecao, setSolicitandoCorrecao] = useState(false);
  const [notaCorrecao, setNotaCorrecao] = useState("");
  const [enviandoCorrecao, setEnviandoCorrecao] = useState(false);
  const [forcandoPacote, setForcandoPacote] = useState(false);
  const [justificativaForcar, setJustificativaForcar] = useState("");
  const [gerandoPdfForcado, setGerandoPdfForcado] = useState(false);
  const [modalContaSalarioAberto, setModalContaSalarioAberto] = useState(false);
  const [modalAssinaturaAberto, setModalAssinaturaAberto] = useState(false);
  const [abrindoAssinatura, setAbrindoAssinatura] = useState(false);

  // ── Edição total pelo analista ──────────────────────────────────────────
  const [dp, setDp] = useState(dadosPessoais);
  const [secaoDPEditando, setSecaoDPEditando] = useState<string | null>(null);
  const [formDP, setFormDP] = useState<Record<string, string>>({});
  const [salvandoDP, setSalvandoDP] = useState(false);

  const [vagaAtual, setVagaAtual] = useState({
    id: admissao.vaga_id,
    titulo: admissao.vagas?.titulo ?? null,
    clienteNome: admissao.vagas?.clientes?.nome ?? null,
  });
  const [funcaoAtual, setFuncaoAtual] = useState(admissao.funcao);
  const [salarioAtual, setSalarioAtual] = useState(admissao.salario);
  const [horarioAtual, setHorarioAtual] = useState(admissao.horario_trabalho);
  const [entidadeAtual, setEntidadeAtual] = useState(admissao.entidade_contratante);
  const [editandoDadosAdmissao, setEditandoDadosAdmissao] = useState(false);
  const [formDadosAdmissao, setFormDadosAdmissao] = useState({ vagaId: "", funcao: "", salario: "", horario: "", entidade: "" });
  const [vagasDisponiveis, setVagasDisponiveis] = useState<VagaOpcao[]>([]);
  const [carregandoVagas, setCarregandoVagas] = useState(false);
  const [buscaVaga, setBuscaVaga] = useState("");
  const [salvandoDadosAdmissao, setSalvandoDadosAdmissao] = useState(false);

  const [dependentesAtuais, setDependentesAtuais] = useState(dependentes);
  const [editandoDependentes, setEditandoDependentes] = useState(false);
  const [linhasDependentes, setLinhasDependentes] = useState<DependenteForm[]>([]);
  const [salvandoDependentes, setSalvandoDependentes] = useState(false);

  const [valeTransporteAtual, setValeTransporteAtual] = useState(valeTransporte);
  const [editandoVT, setEditandoVT] = useState(false);
  const [formVT, setFormVT] = useState<ValeTransporteForm>({ opcao: "", dias_semana: "", bairro_cidade_trabalho: "", termos_aceitos: "", linhas: [] });
  const [salvandoVT, setSalvandoVT] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const iniciarEdicaoDP = (secao: string) => {
    setFormDP(dpParaFormulario(dp));
    setSecaoDPEditando(secao);
  };

  const cancelarEdicaoDP = () => setSecaoDPEditando(null);

  const atualizarCampoDP = (key: string, valor: string) => {
    setFormDP((prev) => ({ ...prev, [key]: valor }));
  };

  const handleSalvarDP = async () => {
    setSalvandoDP(true);
    try {
      const payload = formularioParaPayload(formDP);
      const res = await fetch(`/api/admissoes/${admissao.id}/dados-pessoais`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Erro ao salvar."); return; }
      setDp(json.data);
      setSecaoDPEditando(null);
      router.refresh();
    } catch {
      showToast("Erro de conexão ao salvar.");
    } finally {
      setSalvandoDP(false);
    }
  };

  const iniciarEdicaoDadosAdmissao = () => {
    setFormDadosAdmissao({
      vagaId: vagaAtual.id ?? "",
      funcao: funcaoAtual ?? "",
      salario: salarioAtual != null ? String(salarioAtual) : "",
      horario: horarioAtual ?? "",
      entidade: entidadeAtual ?? "",
    });
    setBuscaVaga("");
    setEditandoDadosAdmissao(true);
    if (vagasDisponiveis.length === 0) {
      setCarregandoVagas(true);
      fetch("/api/vagas")
        .then((r) => r.json())
        .then(({ data }) => setVagasDisponiveis(data ?? []))
        .catch(() => showToast("Erro ao carregar lista de vagas."))
        .finally(() => setCarregandoVagas(false));
    }
  };

  const cancelarEdicaoDadosAdmissao = () => setEditandoDadosAdmissao(false);

  const atualizarCampoDadosAdmissao = <K extends keyof typeof formDadosAdmissao>(campo: K, valor: (typeof formDadosAdmissao)[K]) => {
    setFormDadosAdmissao((prev) => ({ ...prev, [campo]: valor }));
  };

  const vagaTrocada = editandoDadosAdmissao && formDadosAdmissao.vagaId && formDadosAdmissao.vagaId !== (vagaAtual.id ?? "");

  const handleSalvarDadosAdmissao = async () => {
    setSalvandoDadosAdmissao(true);
    try {
      const payload: Record<string, unknown> = {};
      if (formDadosAdmissao.vagaId && formDadosAdmissao.vagaId !== (vagaAtual.id ?? "")) payload.vaga_id = formDadosAdmissao.vagaId;
      if (formDadosAdmissao.funcao.trim()) payload.funcao = formDadosAdmissao.funcao.trim();
      const salarioNum = parseValorAdicional(formDadosAdmissao.salario);
      if (salarioNum > 0) payload.salario = salarioNum;
      if (formDadosAdmissao.horario.trim()) payload.horario_trabalho = formDadosAdmissao.horario.trim();
      if (formDadosAdmissao.entidade) payload.entidade_contratante = formDadosAdmissao.entidade;

      const res = await fetch(`/api/admissoes/${admissao.id}/dados-admissao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Erro ao salvar dados da admissão."); return; }

      const novaVaga = json.data.vagas as { id: string; titulo: string; clientes: { nome: string } | null } | null;
      setVagaAtual({ id: json.data.vaga_id, titulo: novaVaga?.titulo ?? null, clienteNome: novaVaga?.clientes?.nome ?? null });
      setFuncaoAtual(json.data.funcao);
      setSalarioAtual(json.data.salario);
      setHorarioAtual(json.data.horario_trabalho);
      setEntidadeAtual(json.data.entidade_contratante);
      setEditandoDadosAdmissao(false);
      router.refresh();
    } catch {
      showToast("Erro de conexão ao salvar dados da admissão.");
    } finally {
      setSalvandoDadosAdmissao(false);
    }
  };

  const vagasFiltradas = vagasDisponiveis.filter((v) => {
    if (!buscaVaga.trim()) return true;
    const termo = buscaVaga.trim().toLowerCase();
    return v.titulo.toLowerCase().includes(termo) || (v.clientes?.nome ?? "").toLowerCase().includes(termo);
  });

  const iniciarEdicaoDependentes = () => {
    setLinhasDependentes(dependentesAtuais.map(dependenteParaFormulario));
    setEditandoDependentes(true);
  };

  const cancelarEdicaoDependentes = () => setEditandoDependentes(false);

  const adicionarDependenteLinha = () => setLinhasDependentes((prev) => [...prev, { ...DEPENDENTE_VAZIO }]);

  const removerDependenteLinha = (idx: number) => setLinhasDependentes((prev) => prev.filter((_, i) => i !== idx));

  const atualizarCampoDependente = <K extends keyof DependenteForm>(idx: number, campo: K, valor: DependenteForm[K]) => {
    setLinhasDependentes((prev) => prev.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));
  };

  const handleSalvarDependentes = async () => {
    setSalvandoDependentes(true);
    try {
      const idsAtuais = new Set(linhasDependentes.filter((d) => d.id).map((d) => d.id));
      const removidos = dependentesAtuais.filter((d) => !idsAtuais.has(d.id));

      for (const rem of removidos) {
        await fetch(`/api/admissoes/${admissao.id}/dependentes/${rem.id}`, { method: "DELETE" });
      }

      const resultado: AdmissaoDependente[] = [];
      for (const linha of linhasDependentes) {
        if (!linha.nome.trim()) continue;
        const payload = {
          nome: linha.nome.trim(),
          parentesco: linha.parentesco || null,
          data_nascimento: linha.data_nascimento || null,
          cpf: linha.cpf || null,
          nome_mae: linha.nome_mae || null,
          cpf_mae: linha.cpf_mae || null,
          cartorio: linha.cartorio || null,
          local_nascimento: linha.local_nascimento || null,
          declaracao_nascido_vivo: linha.declaracao_nascido_vivo || null,
          num_registro: linha.num_registro || null,
          num_livro: linha.num_livro || null,
          num_folha: linha.num_folha || null,
        };
        const url = linha.id ? `/api/admissoes/${admissao.id}/dependentes/${linha.id}` : `/api/admissoes/${admissao.id}/dependentes`;
        const res = await fetch(url, {
          method: linha.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) { showToast(json.error || "Erro ao salvar um dos dependentes."); continue; }
        resultado.push(json.data);
      }

      setDependentesAtuais(resultado);
      setEditandoDependentes(false);
      router.refresh();
    } catch {
      showToast("Erro de conexão ao salvar dependentes.");
    } finally {
      setSalvandoDependentes(false);
    }
  };

  const iniciarEdicaoVT = () => {
    setFormVT({
      opcao: valeTransporteAtual?.opcao ?? "",
      dias_semana: valeTransporteAtual?.dias_semana ?? "",
      bairro_cidade_trabalho: valeTransporteAtual?.bairro_cidade_trabalho ?? "",
      termos_aceitos: "",
      linhas: (valeTransporteAtual?.admissao_vt_linhas ?? []).map((l) => ({
        onibus_viacao: l.onibus_viacao ?? "",
        percurso: l.percurso ?? "",
        valor_unitario: l.valor_unitario != null ? String(l.valor_unitario) : "",
        valor_total_diario: l.valor_total_diario != null ? String(l.valor_total_diario) : "",
      })),
    });
    setEditandoVT(true);
  };

  const cancelarEdicaoVT = () => setEditandoVT(false);

  const atualizarCampoVT = <K extends keyof ValeTransporteForm>(campo: K, valor: ValeTransporteForm[K]) => {
    setFormVT((prev) => ({ ...prev, [campo]: valor }));
  };

  const adicionarLinhaVT = () => {
    if (formVT.linhas.length >= 2) return;
    setFormVT((prev) => ({ ...prev, linhas: [...prev.linhas, { onibus_viacao: "", percurso: "", valor_unitario: "", valor_total_diario: "" }] }));
  };

  const removerLinhaVT = (idx: number) => setFormVT((prev) => ({ ...prev, linhas: prev.linhas.filter((_, i) => i !== idx) }));

  const atualizarLinhaVT = <K extends keyof ValeTransporteLinhaForm>(idx: number, campo: K, valor: ValeTransporteLinhaForm[K]) => {
    setFormVT((prev) => ({ ...prev, linhas: prev.linhas.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)) }));
  };

  const handleSalvarVT = async () => {
    setSalvandoVT(true);
    try {
      const payload = {
        opcao: formVT.opcao || null,
        dias_semana: formVT.dias_semana.trim() || null,
        bairro_cidade_trabalho: formVT.bairro_cidade_trabalho.trim() || null,
        termos_aceitos: formVT.termos_aceitos === "sim" ? true : formVT.termos_aceitos === "nao" ? false : null,
        linhas: formVT.linhas
          .filter((l) => l.onibus_viacao.trim() || l.percurso.trim())
          .map((l) => ({
            onibus_viacao: l.onibus_viacao.trim() || null,
            percurso: l.percurso.trim() || null,
            valor_unitario: l.valor_unitario.trim() || null,
            valor_total_diario: l.valor_total_diario.trim() || null,
          })),
      };
      const res = await fetch(`/api/admissoes/${admissao.id}/vale-transporte`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Erro ao salvar o Vale Transporte."); return; }
      setValeTransporteAtual(json.data);
      setEditandoVT(false);
      router.refresh();
    } catch {
      showToast("Erro de conexão ao salvar o Vale Transporte.");
    } finally {
      setSalvandoVT(false);
    }
  };

  const handleStatusChange = async (novoStatus: string) => {
    setSalvandoStatus(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (res.ok) { setStatus(novoStatus); router.refresh(); }
    } finally {
      setSalvandoStatus(false);
    }
  };

  // Reabre o acesso do candidato ao mesmo link — mesma lógica que hoje é feita "na mão"
  // pelo dropdown de status genérico (levando de volta pra "em_preenchimento", o único
  // valor fora de STATUS_JA_ENVIADO que faz sentido como "retomando o preenchimento").
  const handleSolicitarCorrecao = async () => {
    setEnviandoCorrecao(true);
    try {
      const notaFinal = notaCorrecao.trim()
        ? `[Solicitação de correção — ${new Date().toLocaleString("pt-BR")}] ${notaCorrecao.trim()}`
        : "";
      const observacoesAtualizadas = notaFinal
        ? (observacoes.trim() ? `${observacoes.trim()}\n\n${notaFinal}` : notaFinal)
        : undefined;

      const res = await fetch(`/api/admissoes/${admissao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "em_preenchimento",
          ...(observacoesAtualizadas !== undefined ? { observacoes_internas: observacoesAtualizadas } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(json.error || "Erro ao solicitar correção."); return; }

      setStatus("em_preenchimento");
      if (observacoesAtualizadas !== undefined) setObservacoes(observacoesAtualizadas);
      setSolicitandoCorrecao(false);
      setNotaCorrecao("");
      showToast("Acesso do candidato reaberto — ele já pode corrigir o documento pelo mesmo link.");
      router.refresh();
    } catch {
      showToast("Erro de conexão ao solicitar correção.");
    } finally {
      setEnviandoCorrecao(false);
    }
  };

  const handleSalvarObservacoes = async () => {
    setSalvandoObs(true);
    try {
      await fetch(`/api/admissoes/${admissao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacoes_internas: observacoes }),
      });
    } finally {
      setSalvandoObs(false);
    }
  };

  const handleSalvarExameAdmissional = async () => {
    setSalvandoExame(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/dados-pessoais`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_exame_admissional: dataExameAdmissional || null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        showToast(json.error || "Erro ao salvar a data do exame admissional.");
      }
    } catch {
      showToast("Erro de conexão ao salvar a data do exame admissional.");
    } finally {
      setSalvandoExame(false);
    }
  };

  const iniciarEdicaoAdicionais = () => {
    setLinhasAdicionais(adicionais.map((a) => ({ tipo: a.tipo, valor: String(a.valor), formato_valor: a.formato_valor })));
    setEditandoAdicionais(true);
  };

  const cancelarEdicaoAdicionais = () => {
    setEditandoAdicionais(false);
    setLinhasAdicionais([]);
  };

  const adicionarLinhaAdicional = () => {
    setLinhasAdicionais((prev) => [...prev, { tipo: "", valor: "", formato_valor: "percentual" }]);
  };

  const removerLinhaAdicional = (idx: number) => {
    setLinhasAdicionais((prev) => prev.filter((_, i) => i !== idx));
  };

  const atualizarLinhaAdicional = <K extends keyof AdicionalLinha>(idx: number, campo: K, valor: AdicionalLinha[K]) => {
    setLinhasAdicionais((prev) => prev.map((a, i) => (i === idx ? { ...a, [campo]: valor } : a)));
  };

  const handleSalvarAdicionais = async () => {
    setSalvandoAdicionais(true);
    try {
      const payload = linhasAdicionais
        .filter((a) => a.tipo.trim() && parseValorAdicional(a.valor) > 0)
        .map((a) => ({ tipo: a.tipo.trim(), formato_valor: a.formato_valor, valor: parseValorAdicional(a.valor) }));
      const res = await fetch(`/api/admissoes/${admissao.id}/adicionais`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adicionais: payload }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Erro ao salvar os adicionais."); return; }
      setAdicionais(json.data);
      setEditandoAdicionais(false);
      setLinhasAdicionais([]);
    } catch {
      showToast("Erro de conexão ao salvar os adicionais.");
    } finally {
      setSalvandoAdicionais(false);
    }
  };

  const iniciarEdicaoAS = () => {
    setNomeSindicatoEdit(autorizacaoSindicalAtual?.nome_sindicato ?? "");
    setAutorizaAssistencialEdit(
      autorizacaoSindicalAtual?.autoriza_assistencial_confederativa === true ? "sim"
        : autorizacaoSindicalAtual?.autoriza_assistencial_confederativa === false ? "nao" : ""
    );
    setAutorizaSindicalEdit(
      autorizacaoSindicalAtual?.autoriza_sindical === true ? "sim"
        : autorizacaoSindicalAtual?.autoriza_sindical === false ? "nao" : ""
    );
    setEditandoAS(true);
  };

  const cancelarEdicaoAS = () => {
    setEditandoAS(false);
  };

  const handleSalvarAS = async () => {
    setSalvandoAS(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/autorizacao-sindical`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_sindicato: nomeSindicatoEdit.trim() || null,
          autoriza_assistencial_confederativa: autorizaAssistencialEdit === "sim" ? true : autorizaAssistencialEdit === "nao" ? false : null,
          autoriza_sindical: autorizaSindicalEdit === "sim" ? true : autorizaSindicalEdit === "nao" ? false : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Erro ao salvar a autorização sindical."); return; }
      setAutorizacaoSindicalAtual(json.data);
      setEditandoAS(false);
    } catch {
      showToast("Erro de conexão ao salvar a autorização sindical.");
    } finally {
      setSalvandoAS(false);
    }
  };

  // Upload feito pela própria equipe em nome do candidato — caminho paralelo ao do
  // candidato (mesmo padrão de doc_id pra tipos multi-arquivo), pros casos em que ele
  // perde acesso, se confunde, ou é mais rápido a equipe resolver direto pelo painel.
  const iniciarUpload = (tipo: string, docId: string | undefined, label: string) => {
    setErroUpload("");
    setUploadAlvo({ tipo, docId, label });
    uploadInputRef.current?.click();
  };

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadAlvo) return;

    setErroUpload("");
    if (file.size > 10 * 1024 * 1024) { setErroUpload(`"${file.name}" é maior que 10MB.`); return; }
    const tiposAceitos = ["image/jpeg", "image/png", "image/heic", "application/pdf"];
    if (!tiposAceitos.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
      setErroUpload(`Formato de "${file.name}" não aceito. Envie JPG, PNG, PDF ou HEIC.`);
      return;
    }

    setEnviandoUpload(true);
    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      if (uploadAlvo.docId) formData.append("doc_id", uploadAlvo.docId);
      const res = await fetch(`/api/admissoes/${admissao.id}/documentos-upload/${uploadAlvo.tipo}`, {
        method: "PATCH",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) { setErroUpload(json.error || "Erro ao enviar o documento."); return; }

      setDocumentos((prev) => {
        const existe = prev.some((d) => d.id === json.data.id);
        return existe ? prev.map((d) => (d.id === json.data.id ? json.data : d)) : [...prev, json.data];
      });
      showToast(`"${uploadAlvo.label}" enviado com sucesso — aguardando aprovação.`);
    } catch {
      setErroUpload("Erro de conexão ao enviar o documento.");
    } finally {
      setEnviandoUpload(false);
      setUploadAlvo(null);
    }
  };

  const handleVisualizar = async (doc: AdmissaoDocumento) => {
    const res = await fetch(`/api/admissoes/${admissao.id}/documentos/${doc.id}`);
    const json = await res.json();
    if (res.ok && json.signedUrl) window.open(json.signedUrl, "_blank");
    else showToast(json.error || "Erro ao gerar visualização.");
  };

  const handleAprovar = async (doc: AdmissaoDocumento) => {
    setProcessandoDocId(doc.id);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "aprovado" }),
      });
      const json = await res.json();
      if (res.ok) setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? json.data : d)));
    } finally {
      setProcessandoDocId(null);
    }
  };

  const isOutroMotivo = motivoSelecionado === OUTRO_MOTIVO_REPROVACAO;
  const motivoValido = isOutroMotivo ? motivoOutro.trim().length > 0 : motivoSelecionado.trim().length > 0;

  const handleConfirmarRejeicao = async (doc: AdmissaoDocumento) => {
    if (!motivoValido) return;
    const motivoFinal = isOutroMotivo ? motivoOutro.trim() : motivoSelecionado;
    setProcessandoDocId(doc.id);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejeitado", motivo_rejeicao: motivoFinal }),
      });
      const json = await res.json();
      if (res.ok) {
        setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? json.data : d)));
        setRejeitandoId(null);
        setMotivoSelecionado("");
        setMotivoOutro("");
        if (json.whatsappUrl) {
          showToast("Documento rejeitado. Clique para notificar o candidato.");
          window.open(json.whatsappUrl, "_blank");
        }
      }
    } finally {
      setProcessandoDocId(null);
    }
  };

  const handleGerarPdf = async () => {
    setGerandoPdf(true);
    setErroPacote("");
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/gerar-pdf`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "Erro ao gerar o PDF.";
        setErroPacote(msg);
        showToast(msg);
        setTab("documentos");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admissao-${(admissao.candidatos?.nome_completo ?? "candidato").toLowerCase().replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("enviado_contabilidade");
      showToast("⚠️ Este PDF contém dados pessoais sensíveis. Envie com segurança e não compartilhe por canais não seguros.");
      router.refresh();
    } catch {
      const msg = "Erro de conexão ao gerar o PDF.";
      setErroPacote(msg);
      showToast(msg);
    } finally {
      setGerandoPdf(false);
    }
  };

  // Mesmo fluxo de handleGerarPdf, mas envia forcar+justificativa — só chamado quando o
  // botão normal já está bloqueado por pendência (ver podeGerarPdf) e a equipe decidiu
  // seguir mesmo assim. A rota registra em audit_logs quais documentos estavam pendentes
  // no momento e a justificativa escrita.
  const handleForcarGeracaoPacote = async () => {
    if (!justificativaForcar.trim()) return;
    setGerandoPdfForcado(true);
    setErroPacote("");
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/gerar-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forcar: true, justificativa: justificativaForcar.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "Erro ao gerar o PDF.";
        setErroPacote(msg);
        showToast(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admissao-${(admissao.candidatos?.nome_completo ?? "candidato").toLowerCase().replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("enviado_contabilidade");
      setForcandoPacote(false);
      setJustificativaForcar("");
      showToast("⚠️ Pacote gerado com pendências — este PDF contém dados sensíveis, envie com segurança.");
      router.refresh();
    } catch {
      const msg = "Erro de conexão ao gerar o PDF.";
      setErroPacote(msg);
      showToast(msg);
    } finally {
      setGerandoPdfForcado(false);
    }
  };

  const handleVerPacote = async () => {
    setAbrindoPacote(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/pacote`);
      const json = await res.json();
      if (res.ok && json.signedUrl) window.open(json.signedUrl, "_blank");
      else showToast(json.error || "Erro ao abrir o pacote.");
    } finally {
      setAbrindoPacote(false);
    }
  };

  const handleVerAssinatura = async () => {
    setAbrindoAssinatura(true);
    try {
      const res = await fetch(`/api/admissoes/${admissao.id}/assinatura`);
      const json = await res.json();
      if (res.ok && json.signedUrl) window.open(json.signedUrl, "_blank");
      else showToast(json.error || "Erro ao abrir o documento assinado.");
    } finally {
      setAbrindoAssinatura(false);
    }
  };

  // A liberação do botão depende EXCLUSIVAMENTE dos documentos obrigatórios aprovados
  // em admissao_documentos — o campo admissoes.status (editável manualmente pela equipe)
  // nunca deve entrar nessa conta, para não abrir um atalho de aprovação sem revisão.
  const docsObrigatoriosPendentes = documentos.filter((d) => d.obrigatorio && d.status !== "aprovado");
  const nomesDocsPendentes = docsObrigatoriosPendentes.map(
    (d) => DOCUMENTOS_ADMISSAO.find((def) => def.tipo_documento === d.tipo_documento)?.label ?? d.tipo_documento
  );
  const podeGerarPdf = docsObrigatoriosPendentes.length === 0;
  const tituloBotaoPdf = nomesDocsPendentes.length > 0 ? `Faltam aprovar: ${nomesDocsPendentes.join(", ")}` : undefined;
  const docsAprovados = documentos.filter((d) => d.status === "aprovado").length;
  const badge = ADMISSAO_STATUS_BADGE[status] ?? { label: status, bg: "#F3F4F6", text: "#374151" };
  const logGeracaoPacote = auditLogs.find((l) => l.acao === "admissao_pacote_gerado");

  // Carta de abertura de conta salário: só faz sentido pra admissões de fato (MOT ou
  // terceirização) — recrutamento & seleção não passa por este fluxo de admissão digital,
  // então admissao.modalidade nunca é "recrutamento_selecao" aqui, mas a checagem explícita
  // documenta a regra e protege contra mudanças futuras no schema.
  const podeAbrirContaSalario = admissao.modalidade === "MOT" || admissao.modalidade === "terceirizacao";
  const faltaFuncaoOuSalario = !admissao.funcao || admissao.salario == null;
  const docRgAprovadoContaSalario = documentos.some((d) => d.tipo_documento === "rg" && d.status === "aprovado");
  const docComprovanteAprovadoContaSalario = documentos.some((d) => d.tipo_documento === "comprovante_endereco" && d.status === "aprovado");
  const cartaBancoDesabilitada = faltaFuncaoOuSalario || !docRgAprovadoContaSalario || !docComprovanteAprovadoContaSalario;
  const tituloBotaoCartaBanco = faltaFuncaoOuSalario
    ? "Preencha função e salário desta admissão antes de gerar a carta."
    : !docRgAprovadoContaSalario || !docComprovanteAprovadoContaSalario
    ? `Aprove antes: ${[!docRgAprovadoContaSalario && "RG", !docComprovanteAprovadoContaSalario && "Comprovante de endereço"].filter(Boolean).join(", ")}`
    : undefined;
  const logCartaBanco = auditLogs.find(
    (l) => l.acao === "admissao_carta_conta_salario_enviada" || l.acao === "admissao_carta_conta_salario_reenviada_forcada"
  );

  // Assinatura eletrônica: só faz sentido depois que o pacote de contabilidade (o PDF
  // enviado pra assinar) já existe — mesmo pré-requisito de pdf_pacote_path das outras
  // ações desta tela. Nome/e-mail default pra pré-preencher o modal de confirmação vêm
  // de admissao_dados_pessoais, nunca de candidatos (mesma razão da carta de conta
  // salário: candidatos pode vir de extração automática de currículo, não confiável pra
  // um envio formal a terceiros) — mas ficam editáveis só naquela tela antes de enviar.
  const assinaturaConcluida = Boolean(admissao.assinatura_em);
  const assinaturaEmAndamento = Boolean(admissao.assinatura_documento_externo_id) && !assinaturaConcluida;
  const logAssinaturaCriada = auditLogs.find((l) => l.acao === "admissao_assinatura_clicksign_criada");

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{admissao.candidatos?.nome_completo ?? "Admissão"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {admissao.vagas?.titulo ?? "—"} · {MODALIDADE_LABEL[admissao.modalidade] ?? admissao.modalidade}
          </p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: badge.bg, color: badge.text }}>
          {badge.label}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-gray-100 mb-5">
        {[{ id: "dados" as Tab, label: "Dados do Candidato" }, { id: "documentos" as Tab, label: "Documentos" }, { id: "notas" as Tab, label: "Anotações Internas" }].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontWeight: tab === t.id ? 700 : 500, fontSize: 14,
              color: tab === t.id ? "#111827" : "#6B7280", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid #FFB800" : "2px solid transparent", marginBottom: -2, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dados" && (
        <>
          <div
            className="rounded-lg p-3 mb-4 text-sm"
            style={
              admissao.lgpd_aceite_em
                ? { background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" }
                : { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }
            }
          >
            {admissao.lgpd_aceite_em ? (
              <>
                ✅ Consentimento LGPD aceito em: {new Date(admissao.lgpd_aceite_em).toLocaleString("pt-BR")}
                {admissao.lgpd_aceite_ip ? ` · IP: ${admissao.lgpd_aceite_ip}` : ""}
              </>
            ) : (
              "⚠️ Consentimento LGPD ainda não registrado — candidato não concluiu o envio final."
            )}
          </div>

          <Secao titulo="Dados da Admissão">
            <div className="flex justify-end mb-1">
              {!editandoDadosAdmissao && (
                <button onClick={iniciarEdicaoDadosAdmissao} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                  Editar
                </button>
              )}
            </div>

            {editandoDadosAdmissao ? (
              <div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Vaga vinculada</label>
                  <input
                    type="text" placeholder="Buscar por título ou cliente..." value={buscaVaga}
                    onChange={(e) => setBuscaVaga(e.target.value)}
                    className="input-field text-sm mb-1"
                  />
                  {carregandoVagas ? (
                    <p className="text-xs text-gray-400">Carregando vagas...</p>
                  ) : (
                    <select
                      value={formDadosAdmissao.vagaId}
                      onChange={(e) => atualizarCampoDadosAdmissao("vagaId", e.target.value)}
                      className="input-field text-sm"
                    >
                      <option value="">Selecione a vaga</option>
                      {vagasFiltradas.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.titulo} — {v.clientes?.nome ?? "sem cliente"}{v.status !== "aberta" ? ` (${v.status})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {vagaTrocada && (
                  <div className="rounded-lg p-2 mb-2 text-xs" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                    ⚠️ Trocar a vaga muda o Cliente exibido no painel e no PDF. Função, salário, horário e entidade contratante <strong>não são atualizados automaticamente</strong> — revise e ajuste manualmente abaixo antes de salvar.
                  </div>
                )}

                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Função</label>
                  <input type="text" value={formDadosAdmissao.funcao} onChange={(e) => atualizarCampoDadosAdmissao("funcao", e.target.value)} className="input-field text-sm" />
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Salário</label>
                  <input type="text" inputMode="decimal" value={formDadosAdmissao.salario} onChange={(e) => atualizarCampoDadosAdmissao("salario", e.target.value)} className="input-field text-sm" />
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Horário de trabalho</label>
                  <input type="text" value={formDadosAdmissao.horario} onChange={(e) => atualizarCampoDadosAdmissao("horario", e.target.value)} className="input-field text-sm" />
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Entidade Contratante (CNPJ)</label>
                  <select value={formDadosAdmissao.entidade} onChange={(e) => atualizarCampoDadosAdmissao("entidade", e.target.value)} className="input-field text-sm">
                    <option value="">Selecione</option>
                    {ENTIDADES_CONTRATANTES.map((ent) => (
                      <option key={ent.value} value={ent.value}>{ent.razaoSocial} — {ent.cnpj}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end">
                  <button onClick={cancelarEdicaoDadosAdmissao} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoDadosAdmissao}>
                    Cancelar
                  </button>
                  <button onClick={handleSalvarDadosAdmissao} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoDadosAdmissao}>
                    {salvandoDadosAdmissao ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Linha label="Vaga" value={vagaAtual.titulo} />
                <Linha label="Cliente" value={vagaAtual.clienteNome} />
                <Linha label="Função" value={funcaoAtual} />
                <Linha label="Salário" value={salarioAtual != null ? salarioAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null} />
                <Linha label="Horário de trabalho" value={horarioAtual} />
                <Linha label="Entidade Contratante" value={ENTIDADES_CONTRATANTES.find((e) => e.value === entidadeAtual)?.razaoSocial ?? entidadeAtual} />
              </>
            )}

            <Linha label="Data de admissão" value={admissao.data_admissao} />
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50 text-sm">
              <span className="text-gray-500">Data do exame admissional</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dataExameAdmissional ?? ""}
                  onChange={(e) => setDataExameAdmissional(e.target.value)}
                  onBlur={handleSalvarExameAdmissional}
                  className="input-field !w-auto !py-1 !text-sm"
                />
                {salvandoExame && <span className="text-xs text-gray-400">Salvando...</span>}
              </div>
            </div>

            <div className="pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-500">Adicionais</span>
                {!editandoAdicionais && (
                  <button onClick={iniciarEdicaoAdicionais} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                    Editar
                  </button>
                )}
              </div>

              {editandoAdicionais ? (
                <div>
                  {linhasAdicionais.length === 0 && (
                    <p className="text-xs text-gray-400 mb-2">Nenhum adicional. Opcional.</p>
                  )}
                  {linhasAdicionais.map((a, idx) => (
                    <div key={idx} className="flex gap-2 items-center mb-2">
                      <input
                        type="text" list="adicionais-sugestoes" placeholder="Tipo (ex: Insalubridade)" value={a.tipo}
                        onChange={(e) => atualizarLinhaAdicional(idx, "tipo", e.target.value)}
                        className="input-field flex-1 text-sm"
                      />
                      <input
                        type="text" inputMode="decimal" placeholder="Valor" value={a.valor}
                        onChange={(e) => atualizarLinhaAdicional(idx, "valor", e.target.value)}
                        className="input-field text-sm" style={{ width: 90 }}
                      />
                      <select
                        value={a.formato_valor}
                        onChange={(e) => atualizarLinhaAdicional(idx, "formato_valor", e.target.value as "percentual" | "fixo")}
                        className="input-field text-sm" style={{ width: 70 }}
                      >
                        <option value="percentual">%</option>
                        <option value="fixo">R$</option>
                      </select>
                      <button
                        onClick={() => removerLinhaAdicional(idx)}
                        className="text-red-600 text-sm" style={{ padding: 6 }} aria-label="Remover adicional"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  <datalist id="adicionais-sugestoes">
                    <option value="Insalubridade" />
                    <option value="Periculosidade" />
                    <option value="Assiduidade" />
                    <option value="Outros" />
                  </datalist>
                  <div className="flex items-center justify-between mt-2">
                    <button onClick={adicionarLinhaAdicional} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                      + Adicionar
                    </button>
                    <div className="flex gap-2">
                      <button onClick={cancelarEdicaoAdicionais} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoAdicionais}>
                        Cancelar
                      </button>
                      <button onClick={handleSalvarAdicionais} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoAdicionais}>
                        {salvandoAdicionais ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : adicionais.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum adicional registrado.</p>
              ) : (
                adicionais.map((a) => (
                  <div key={a.id} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                    <span className="text-gray-500">{a.tipo}</span>
                    <span className="text-gray-900 font-medium text-right">{formatarAdicionalValor(a.formato_valor, a.valor)}</span>
                  </div>
                ))
              )}
            </div>
          </Secao>

          <SecaoEditavelDP
            titulo="Dados Pessoais" campos={CAMPOS_DADOS_PESSOAIS}
            editando={secaoDPEditando === "pessoais"} formDP={formDP} salvando={salvandoDP}
            onIniciarEdicao={() => iniciarEdicaoDP("pessoais")} onCampo={atualizarCampoDP}
            onSalvar={handleSalvarDP} onCancelar={cancelarEdicaoDP}
          >
            <Linha label="Nome completo" value={dp?.nome_completo} />
            <Linha label="Data de nascimento" value={dp?.data_nascimento} />
            <Linha label="Sexo" value={dp?.sexo === "M" ? "Masculino" : dp?.sexo === "F" ? "Feminino" : ""} />
            <Linha label="Estado civil" value={ESTADO_CIVIL_OPTIONS.find((o) => o.value === dp?.estado_civil)?.label} />
            <Linha label="Nacionalidade" value={dp?.nacionalidade} />
            <Linha label="Naturalidade" value={dp?.naturalidade} />
            <Linha label="País de nascimento" value={dp?.pais_nascimento} />
            <Linha label="Cor/Raça" value={COR_RACA_OPTIONS.find((o) => o.value === dp?.cor_raca)?.label} />
            <Linha label="CPF" value={dp?.cpf} />
            <Linha label="RG" value={[dp?.rg_numero, dp?.rg_orgao_emissor, dp?.rg_uf].filter(Boolean).join(" / ")} />
            <Linha label="Nome da mãe" value={dp?.nome_mae} />
            <Linha label="Nome do pai" value={dp?.nome_pai} />
            <Linha label="Grau de instrução" value={GRAU_INSTRUCAO_OPTIONS.find((o) => o.value === dp?.grau_instrucao)?.label} />
          </SecaoEditavelDP>

          <SecaoEditavelDP
            titulo="Documentos Profissionais" campos={CAMPOS_DOCUMENTOS_PROFISSIONAIS}
            editando={secaoDPEditando === "documentos"} formDP={formDP} salvando={salvandoDP}
            onIniciarEdicao={() => iniciarEdicaoDP("documentos")} onCampo={atualizarCampoDP}
            onSalvar={handleSalvarDP} onCancelar={cancelarEdicaoDP}
          >
            <Linha label="PIS/PASEP" value={dp?.pis_pasep} />
            <Linha label="CTPS Digital" value={dp?.possui_ctps_digital ? "Sim" : ""} />
            <Linha label="CTPS Física" value={[dp?.carteira_trabalho_numero, dp?.carteira_trabalho_serie, dp?.carteira_trabalho_uf].filter(Boolean).join(" / ")} />
            <Linha label="Título de eleitor" value={[dp?.titulo_eleitor, dp?.zona_eleitoral, dp?.secao_eleitoral].filter(Boolean).join(" / ")} />
            <Linha label="Reservista" value={dp?.reservista} />
            <Linha label="CNH" value={dp?.cnh_numero ? `${dp.cnh_numero} — Cat. ${dp.cnh_categoria ?? "—"} — Val. ${dp.cnh_validade ?? "—"}` : ""} />
          </SecaoEditavelDP>

          <SecaoEditavelDP
            titulo="Endereço e Contato" campos={CAMPOS_ENDERECO}
            editando={secaoDPEditando === "endereco"} formDP={formDP} salvando={salvandoDP}
            onIniciarEdicao={() => iniciarEdicaoDP("endereco")} onCampo={atualizarCampoDP}
            onSalvar={handleSalvarDP} onCancelar={cancelarEdicaoDP}
          >
            <Linha label="Endereço" value={[dp?.endereco_logradouro, dp?.endereco_numero, dp?.endereco_complemento].filter(Boolean).join(", ")} />
            <Linha label="Bairro / Cidade / UF" value={[dp?.endereco_bairro, dp?.endereco_cidade, dp?.endereco_uf].filter(Boolean).join(" / ")} />
            <Linha label="CEP" value={dp?.endereco_cep} />
            <Linha label="Telefone" value={dp?.telefone} />
            <Linha label="E-mail" value={dp?.email} />
          </SecaoEditavelDP>

          <SecaoEditavelDP
            titulo="Dados Bancários" campos={CAMPOS_BANCARIOS}
            editando={secaoDPEditando === "bancarios"} formDP={formDP} salvando={salvandoDP}
            onIniciarEdicao={() => iniciarEdicaoDP("bancarios")} onCampo={atualizarCampoDP}
            onSalvar={handleSalvarDP} onCancelar={cancelarEdicaoDP}
          >
            <Linha label="Banco" value={dp?.banco} />
            <Linha label="Agência" value={dp?.agencia} />
            <Linha label="Conta" value={dp?.conta} />
            <Linha label="Tipo de conta" value={dp?.tipo_conta === "corrente" ? "Conta Corrente" : dp?.tipo_conta === "poupanca" ? "Conta Poupança" : ""} />
            <Linha label="Chave PIX" value={dp?.pix} />
          </SecaoEditavelDP>

          <SecaoEditavelDP
            titulo="Situação Trabalhista e Benefícios" campos={CAMPOS_SITUACAO_TRABALHISTA}
            editando={secaoDPEditando === "trabalhista"} formDP={formDP} salvando={salvandoDP}
            onIniciarEdicao={() => iniciarEdicaoDP("trabalhista")} onCampo={atualizarCampoDP}
            onSalvar={handleSalvarDP} onCancelar={cancelarEdicaoDP}
          >
            <Linha label="Recebendo seguro-desemprego?" value={dp?.recebendo_seguro_desemprego === true ? "Sim" : dp?.recebendo_seguro_desemprego === false ? "Não" : ""} />
            <Linha label="Primeiro emprego?" value={dp?.primeiro_emprego === true ? "Sim" : dp?.primeiro_emprego === false ? "Não" : ""} />
            <Linha label="Já trabalhou nesta empresa antes?" value={dp?.trabalhou_empresa_antes === true ? "Sim" : dp?.trabalhou_empresa_antes === false ? "Não" : ""} />
            <Linha label="Aposentado?" value={dp?.aposentado === true ? "Sim" : dp?.aposentado === false ? "Não" : ""} />
            <Linha label="Dependente para Imposto de Renda?" value={dp?.dependente_ir === true ? "Sim" : dp?.dependente_ir === false ? "Não" : ""} />
            <Linha label="Dependente para Salário Família?" value={dp?.dependente_salario_familia === true ? "Sim" : dp?.dependente_salario_familia === false ? "Não" : ""} />
            <Linha label="Terá adiantamento salarial?" value={dp?.tera_adiantamento === true ? "Sim" : dp?.tera_adiantamento === false ? "Não" : ""} />
          </SecaoEditavelDP>

          <Secao titulo="Dependentes">
            <div className="flex justify-end mb-1">
              {!editandoDependentes && (
                <button onClick={iniciarEdicaoDependentes} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                  Editar
                </button>
              )}
            </div>

            {editandoDependentes ? (
              <div>
                {linhasDependentes.length === 0 && <p className="text-xs text-gray-400 mb-2">Nenhum dependente.</p>}
                {linhasDependentes.map((d, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-gray-700">Dependente {idx + 1}</span>
                      <button onClick={() => removerDependenteLinha(idx)} className="text-red-600 text-xs font-semibold">Remover</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nome *</label>
                        <input type="text" value={d.nome} onChange={(e) => atualizarCampoDependente(idx, "nome", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Parentesco</label>
                        <select value={d.parentesco} onChange={(e) => atualizarCampoDependente(idx, "parentesco", e.target.value)} className="input-field text-sm">
                          <option value="">Selecione</option>
                          {PARENTESCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Data de nascimento</label>
                        <input type="date" value={d.data_nascimento} onChange={(e) => atualizarCampoDependente(idx, "data_nascimento", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">CPF</label>
                        <input type="text" value={d.cpf} onChange={(e) => atualizarCampoDependente(idx, "cpf", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nome da mãe</label>
                        <input type="text" value={d.nome_mae} onChange={(e) => atualizarCampoDependente(idx, "nome_mae", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">CPF da mãe</label>
                        <input type="text" value={d.cpf_mae} onChange={(e) => atualizarCampoDependente(idx, "cpf_mae", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cartório</label>
                        <input type="text" value={d.cartorio} onChange={(e) => atualizarCampoDependente(idx, "cartorio", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Local de nascimento</label>
                        <input type="text" value={d.local_nascimento} onChange={(e) => atualizarCampoDependente(idx, "local_nascimento", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Declaração de nascido vivo</label>
                        <input type="text" value={d.declaracao_nascido_vivo} onChange={(e) => atualizarCampoDependente(idx, "declaracao_nascido_vivo", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nº registro</label>
                        <input type="text" value={d.num_registro} onChange={(e) => atualizarCampoDependente(idx, "num_registro", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nº livro</label>
                        <input type="text" value={d.num_livro} onChange={(e) => atualizarCampoDependente(idx, "num_livro", e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nº folha</label>
                        <input type="text" value={d.num_folha} onChange={(e) => atualizarCampoDependente(idx, "num_folha", e.target.value)} className="input-field text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-2">
                  <button onClick={adicionarDependenteLinha} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                    + Adicionar dependente
                  </button>
                  <div className="flex gap-2">
                    <button onClick={cancelarEdicaoDependentes} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoDependentes}>
                      Cancelar
                    </button>
                    <button onClick={handleSalvarDependentes} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoDependentes}>
                      {salvandoDependentes ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>
            ) : dependentesAtuais.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum dependente registrado.</p>
            ) : (
              dependentesAtuais.map((d) => (
                <div key={d.id} className="py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-semibold text-gray-900">{d.nome} <span className="text-gray-400 font-normal">({d.parentesco})</span></p>
                  <p className="text-xs text-gray-500">Nascimento: {d.data_nascimento || "—"} {d.cpf ? `· CPF: ${d.cpf}` : ""}</p>
                  {d.nome_mae && <p className="text-xs text-gray-500">Mãe: {d.nome_mae}</p>}
                </div>
              ))
            )}
          </Secao>

          <Secao titulo="Vale Transporte">
            <div className="flex justify-end mb-1">
              {!editandoVT && (
                <button onClick={iniciarEdicaoVT} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                  Editar
                </button>
              )}
            </div>

            {editandoVT ? (
              <div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Opção</label>
                  <select value={formVT.opcao} onChange={(e) => atualizarCampoVT("opcao", e.target.value)} className="input-field text-sm">
                    <option value="">Selecione</option>
                    {Object.entries(OPCAO_VALE_TRANSPORTE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Dias na semana</label>
                  <input type="text" value={formVT.dias_semana} onChange={(e) => atualizarCampoVT("dias_semana", e.target.value)} className="input-field text-sm" />
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Local de trabalho (bairro/cidade)</label>
                  <input type="text" value={formVT.bairro_cidade_trabalho} onChange={(e) => atualizarCampoVT("bairro_cidade_trabalho", e.target.value)} className="input-field text-sm" />
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Termos aceitos?</label>
                  <select value={formVT.termos_aceitos} onChange={(e) => atualizarCampoVT("termos_aceitos", e.target.value)} className="input-field text-sm">
                    <option value="">Não alterar</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>

                {formVT.opcao === "vale_transporte" && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Linhas de ônibus (até 2)</p>
                    {formVT.linhas.map((l, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3 mb-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-gray-700">Linha {idx + 1}</span>
                          <button onClick={() => removerLinhaVT(idx)} className="text-red-600 text-xs font-semibold">Remover</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" placeholder="Ônibus/Viação" value={l.onibus_viacao} onChange={(e) => atualizarLinhaVT(idx, "onibus_viacao", e.target.value)} className="input-field text-sm" />
                          <input type="text" placeholder="Percurso" value={l.percurso} onChange={(e) => atualizarLinhaVT(idx, "percurso", e.target.value)} className="input-field text-sm" />
                          <input type="text" inputMode="decimal" placeholder="Valor unitário" value={l.valor_unitario} onChange={(e) => atualizarLinhaVT(idx, "valor_unitario", e.target.value)} className="input-field text-sm" />
                          <input type="text" inputMode="decimal" placeholder="Valor total diário" value={l.valor_total_diario} onChange={(e) => atualizarLinhaVT(idx, "valor_total_diario", e.target.value)} className="input-field text-sm" />
                        </div>
                      </div>
                    ))}
                    {formVT.linhas.length < 2 && (
                      <button onClick={adicionarLinhaVT} className="text-xs font-semibold" style={{ color: "#B45309" }}>+ Adicionar linha</button>
                    )}
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button onClick={cancelarEdicaoVT} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoVT}>
                    Cancelar
                  </button>
                  <button onClick={handleSalvarVT} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoVT}>
                    {salvandoVT ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            ) : valeTransporteAtual ? (
              <>
                <Linha label="Opção" value={valeTransporteAtual.opcao ? OPCAO_VALE_TRANSPORTE_LABEL[valeTransporteAtual.opcao] ?? valeTransporteAtual.opcao : null} />
                <Linha label="Dias na semana" value={valeTransporteAtual.dias_semana} />
                <Linha label="Local de trabalho" value={valeTransporteAtual.bairro_cidade_trabalho} />
                {valeTransporteAtual.opcao === "vale_transporte" && valeTransporteAtual.admissao_vt_linhas.length > 0 && (
                  <div className="mt-2">
                    {valeTransporteAtual.admissao_vt_linhas.map((l) => (
                      <div key={l.id} className="py-2 border-b border-gray-50 last:border-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {[l.onibus_viacao, l.percurso].filter(Boolean).join(" — ") || "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          Unitário: {l.valor_unitario != null ? l.valor_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                          {" · "}
                          Total diário: {l.valor_total_diario != null ? l.valor_total_diario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">Nenhum vale transporte registrado ainda.</p>
            )}
          </Secao>

          <Secao titulo="Autorização Sindical">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">Preenchido pelo analista</span>
              {!editandoAS && (
                <button onClick={iniciarEdicaoAS} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                  Editar
                </button>
              )}
            </div>

            {editandoAS ? (
              <div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Nome do sindicato</label>
                  <input
                    type="text" value={nomeSindicatoEdit}
                    onChange={(e) => setNomeSindicatoEdit(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Autoriza desconto das Contribuições Assistencial e Confederativa?</label>
                  <select value={autorizaAssistencialEdit} onChange={(e) => setAutorizaAssistencialEdit(e.target.value as "" | "sim" | "nao")} className="input-field text-sm">
                    <option value="">Selecione</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Autoriza desconto da Contribuição Sindical?</label>
                  <select value={autorizaSindicalEdit} onChange={(e) => setAutorizaSindicalEdit(e.target.value as "" | "sim" | "nao")} className="input-field text-sm">
                    <option value="">Selecione</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={cancelarEdicaoAS} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoAS}>
                    Cancelar
                  </button>
                  <button onClick={handleSalvarAS} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={salvandoAS}>
                    {salvandoAS ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            ) : autorizacaoSindicalAtual ? (
              <>
                <Linha label="Sindicato" value={autorizacaoSindicalAtual.nome_sindicato} />
                <Linha
                  label="Desconto assistencial/confederativa"
                  value={autorizacaoSindicalAtual.autoriza_assistencial_confederativa === true ? "Autorizado" : autorizacaoSindicalAtual.autoriza_assistencial_confederativa === false ? "Não autorizado" : null}
                />
                <Linha
                  label="Desconto sindical"
                  value={autorizacaoSindicalAtual.autoriza_sindical === true ? "Autorizado" : autorizacaoSindicalAtual.autoriza_sindical === false ? "Não autorizado" : null}
                />
              </>
            ) : (
              <p className="text-sm text-gray-400">Nenhuma autorização sindical registrada.</p>
            )}
          </Secao>
        </>
      )}

      {tab === "documentos" && (
        <div>
          {erroPacote && (
            <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
              ⚠️ {erroPacote}
            </div>
          )}
          {erroUpload && (
            <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
              ⚠️ {erroUpload}
            </div>
          )}
          <p className="text-sm font-semibold text-gray-700 mb-4">{docsAprovados} de {documentos.length} documentos aprovados</p>
          {DOCUMENTOS_ADMISSAO.map((def) => {
            const rows = documentos.filter((d) => d.tipo_documento === def.tipo_documento);
            if (rows.length === 0) return null;
            const aceitaMultiplos = def.condicional === "dependente";

            return (
              <div key={def.tipo_documento}>
                {rows.map((doc, idx) => {
                  const label = rows.length > 1 ? `${def.label} (${idx + 1})` : def.label;
                  const statusBadge: Record<string, { label: string; bg: string; text: string }> = {
                    pendente: { label: "Pendente", bg: "#F3F4F6", text: "#6B7280" },
                    enviado: { label: "Enviado", bg: "#DBEAFE", text: "#1D4ED8" },
                    aprovado: { label: "Aprovado ✅", bg: "#DCFCE7", text: "#15803D" },
                    rejeitado: { label: "Rejeitado ❌", bg: "#FEE2E2", text: "#991B1B" },
                  };
                  const sb = statusBadge[doc.status] ?? statusBadge.pendente;
                  const processando = processandoDocId === doc.id;
                  const enviandoEsta = enviandoUpload && uploadAlvo?.docId === doc.id;

                  return (
                    <div key={doc.id} className="card mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-gray-900">{label}</p>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: sb.bg, color: sb.text }}>
                          {sb.label}
                        </span>
                      </div>
                      {doc.motivo_rejeicao && <p className="text-xs text-red-600 mb-2">Motivo: {doc.motivo_rejeicao}</p>}

                      <div className="flex gap-2 flex-wrap mt-2">
                        {doc.storage_path && (
                          <button onClick={() => handleVisualizar(doc)} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>
                            Visualizar
                          </button>
                        )}
                        <button
                          onClick={() => iniciarUpload(def.tipo_documento, doc.id, label)}
                          disabled={enviandoEsta}
                          className="btn-outline" style={{ padding: "5px 12px", fontSize: 12, opacity: enviandoEsta ? 0.6 : 1 }}
                        >
                          {enviandoEsta ? "Enviando..." : doc.storage_path ? "Substituir arquivo" : "Enviar documento"}
                        </button>
                        {doc.status === "enviado" && (
                          <>
                            <button
                              onClick={() => handleAprovar(doc)} disabled={processando}
                              style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "1px solid #16A34A", background: "#F0FDF4", color: "#15803D", cursor: "pointer" }}
                            >
                              ✅ Aprovar
                            </button>
                            <button
                              onClick={() => { setRejeitandoId(rejeitandoId === doc.id ? null : doc.id); setMotivoSelecionado(""); setMotivoOutro(""); }}
                              disabled={processando}
                              style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "1px solid #DC2626", background: "#FEF2F2", color: "#991B1B", cursor: "pointer" }}
                            >
                              ❌ Rejeitar
                            </button>
                          </>
                        )}
                      </div>

                      {rejeitandoId === doc.id && (
                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motivo da rejeição *</label>
                          <select value={motivoSelecionado} onChange={(e) => setMotivoSelecionado(e.target.value)} className="input-field mb-2">
                            <option value="" disabled>Selecione o motivo...</option>
                            {MOTIVOS_REJEICAO_DOCUMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          {isOutroMotivo && (
                            <textarea
                              value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)}
                              placeholder="Descreva o motivo..." rows={2}
                              className="input-field resize-none mb-2"
                            />
                          )}
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setRejeitandoId(null)} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>Cancelar</button>
                            <button
                              onClick={() => handleConfirmarRejeicao(doc)}
                              disabled={!motivoValido || processando}
                              style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", opacity: !motivoValido || processando ? 0.6 : 1 }}
                            >
                              {processando ? "Salvando..." : "Confirmar rejeição"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {aceitaMultiplos && (
                  <button
                    onClick={() => iniciarUpload(def.tipo_documento, undefined, def.label)}
                    disabled={enviandoUpload && uploadAlvo?.tipo === def.tipo_documento && !uploadAlvo?.docId}
                    className="btn-outline mb-3" style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    {enviandoUpload && uploadAlvo?.tipo === def.tipo_documento && !uploadAlvo?.docId
                      ? "Enviando..."
                      : `+ Adicionar novo arquivo (${def.label})`}
                  </button>
                )}
              </div>
            );
          })}
          <input
            ref={uploadInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
            onChange={handleArquivoSelecionado}
          />
        </div>
      )}

      {tab === "notas" && (
        <div>
          <div className="card mb-4">
            <p className="section-title">Anotações Internas</p>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              onBlur={handleSalvarObservacoes}
              rows={5}
              placeholder="Observações da equipe sobre esta admissão..."
              className="input-field resize-none"
            />
            {salvandoObs && <p className="text-xs text-gray-400 mt-1">Salvando...</p>}
          </div>

          <div className="card">
            <p className="section-title">Histórico</p>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum registro ainda.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="font-semibold text-gray-800">{ACAO_LABEL[log.acao] ?? log.acao}</span>
                  <span className="text-gray-400"> — {log.usuario_nome ?? "Sistema"} — {formatarData(log.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="card mt-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={salvandoStatus}
            className="input-field"
          >
            {ADMISSAO_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <div className="flex items-center gap-2 justify-end flex-wrap">
            {podeAbrirContaSalario && (
              <button
                onClick={() => setModalContaSalarioAberto(true)}
                disabled={cartaBancoDesabilitada}
                title={tituloBotaoCartaBanco}
                className="btn-outline"
                style={{ opacity: cartaBancoDesabilitada ? 0.5 : 1 }}
              >
                🏦 Gerar e enviar carta de abertura de conta
              </button>
            )}
            <button
              onClick={handleGerarPdf}
              disabled={!podeGerarPdf || gerandoPdf}
              title={tituloBotaoPdf}
              className="btn-primary"
              style={{ opacity: !podeGerarPdf || gerandoPdf ? 0.5 : 1 }}
            >
              {gerandoPdf ? "Gerando PDF..." : "Gerar pacote para contabilidade"}
            </button>
          </div>
          {nomesDocsPendentes.length > 0 && (
            <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6, maxWidth: 320, textAlign: "right" }}>
              ⚠️ Aprove antes: {nomesDocsPendentes.join(", ")}
            </p>
          )}
          {!podeGerarPdf && !forcandoPacote && (
            <button
              onClick={() => setForcandoPacote(true)}
              className="text-xs font-semibold mt-2"
              style={{ color: "#DC2626", display: "block", marginLeft: "auto" }}
            >
              Forçar geração do pacote
            </button>
          )}
        </div>
      </div>

      {!podeGerarPdf && forcandoPacote && (
        <div className="card mt-3" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
          <p className="text-sm font-bold mb-1" style={{ color: "#991B1B" }}>⚠️ Forçar geração com documentos pendentes</p>
          <p className="text-xs mb-2" style={{ color: "#991B1B" }}>
            Pendentes: {nomesDocsPendentes.join(", ")}. Essa ação fica registrada no histórico de auditoria e marcada no próprio PDF.
          </p>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Justificativa (obrigatória) *
          </label>
          <textarea
            value={justificativaForcar}
            onChange={(e) => setJustificativaForcar(e.target.value)}
            rows={2}
            placeholder="Por que está gerando o pacote com documentos pendentes?"
            className="input-field resize-none mb-2"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setForcandoPacote(false); setJustificativaForcar(""); }}
              className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}
              disabled={gerandoPdfForcado}
            >
              Cancelar
            </button>
            <button
              onClick={handleForcarGeracaoPacote}
              disabled={!justificativaForcar.trim() || gerandoPdfForcado}
              className="btn-primary" style={{ padding: "5px 12px", fontSize: 12, background: "#DC2626", opacity: !justificativaForcar.trim() || gerandoPdfForcado ? 0.5 : 1 }}
            >
              {gerandoPdfForcado ? "Gerando..." : "Confirmar geração forçada"}
            </button>
          </div>
        </div>
      )}

      {documentos.some((d) => d.status === "rejeitado") && (
        <div className="card mt-3" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-bold" style={{ color: "#991B1B" }}>⚠️ Documento(s) rejeitado(s) pendente(s) de correção</p>
              <p className="text-xs mt-0.5" style={{ color: "#991B1B" }}>
                {STATUS_JA_ENVIADO.includes(status)
                  ? "O candidato não tem mais acesso de edição ao formulário — reabra o link antes de avisá-lo."
                  : "O candidato já tem acesso ao link para reenviar o documento."}
              </p>
            </div>
            {!solicitandoCorrecao && (
              <button onClick={() => setSolicitandoCorrecao(true)} className="btn-primary" style={{ background: "#DC2626" }}>
                Solicitar correção
              </button>
            )}
          </div>

          {solicitandoCorrecao && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "#FECACA" }}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Observação para a equipe (opcional)
              </label>
              <textarea
                value={notaCorrecao}
                onChange={(e) => setNotaCorrecao(e.target.value)}
                rows={2}
                placeholder="Ex: pedir pra reenviar o CPF dos dependentes, o anterior veio ilegível"
                className="input-field resize-none mb-2"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setSolicitandoCorrecao(false); setNotaCorrecao(""); }}
                  className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}
                  disabled={enviandoCorrecao}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSolicitarCorrecao}
                  className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}
                  disabled={enviandoCorrecao}
                >
                  {enviandoCorrecao ? "Enviando..." : "Confirmar e reabrir acesso"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {admissao.pdf_pacote_path && (
        <div className="card mt-3" style={admissao.pacote_gerado_forcado ? { borderColor: "#FECACA", background: "#FEF2F2" } : undefined}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pacote para contabilidade</p>
          <p className="text-sm text-gray-600 mb-2">
            Gerado em {admissao.pdf_pacote_gerado_em ? formatarData(admissao.pdf_pacote_gerado_em) : "—"}
            {logGeracaoPacote?.usuario_nome ? ` por ${logGeracaoPacote.usuario_nome}` : ""}
          </p>
          {admissao.pacote_gerado_forcado && (
            <p className="text-xs font-semibold mb-2" style={{ color: "#991B1B" }}>
              ⚠️ Gerado com pendências em {admissao.pdf_pacote_gerado_em ? formatarData(admissao.pdf_pacote_gerado_em) : "—"}
              {logGeracaoPacote?.usuario_nome ? ` por ${logGeracaoPacote.usuario_nome}` : ""}
              {admissao.pacote_gerado_justificativa ? ` — justificativa: ${admissao.pacote_gerado_justificativa}` : ""}
            </p>
          )}
          <button onClick={handleVerPacote} disabled={abrindoPacote} className="btn-outline">
            {abrindoPacote ? "Abrindo..." : "Ver pacote gerado"}
          </button>
        </div>
      )}

      {admissao.pdf_pacote_path && (
        <div className="card mt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assinatura eletrônica</p>
          {assinaturaConcluida ? (
            <>
              <p className="text-sm text-gray-600 mb-2">
                ✅ Documento assinado eletronicamente em {admissao.assinatura_em ? formatarData(admissao.assinatura_em) : "—"}
              </p>
              <button onClick={handleVerAssinatura} disabled={abrindoAssinatura} className="btn-outline">
                {abrindoAssinatura ? "Abrindo..." : "Ver documento assinado"}
              </button>
            </>
          ) : assinaturaEmAndamento ? (
            <p className="text-sm text-gray-600 mb-0">
              ⏳ Aguardando assinatura eletrônica
              {logAssinaturaCriada?.created_at ? ` — enviado em ${formatarData(logAssinaturaCriada.created_at)}` : ""}
              {logAssinaturaCriada?.usuario_nome ? ` por ${logAssinaturaCriada.usuario_nome}` : ""}
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">
                Envie o pacote gerado para assinatura eletrônica do candidato via Clicksign.
              </p>
              <button onClick={() => setModalAssinaturaAberto(true)} className="btn-outline">
                Enviar para assinatura eletrônica
              </button>
            </>
          )}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", maxWidth: 420, textAlign: "center", background: "#111827", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 60 }}>
          {toast}
        </div>
      )}

      {podeAbrirContaSalario && (
        <ModalContaSalario
          isOpen={modalContaSalarioAberto}
          onClose={() => setModalContaSalarioAberto(false)}
          admissaoId={admissao.id}
          jaEnviadaEm={admissao.carta_banco_enviada_em}
          jaEnviadaPorNome={logCartaBanco?.usuario_nome ?? null}
          jaEnviadaBancoNome={admissao.carta_banco_nome}
          onEnviado={() => {
            showToast("Carta de abertura de conta salário enviada com sucesso.");
            router.refresh();
          }}
        />
      )}

      {admissao.pdf_pacote_path && (
        <ModalAssinaturaEletronica
          isOpen={modalAssinaturaAberto}
          onClose={() => setModalAssinaturaAberto(false)}
          admissaoId={admissao.id}
          pdfPath={admissao.pdf_pacote_path}
          nomeInicial={dp?.nome_completo ?? ""}
          emailInicial={dp?.email ?? ""}
          onEnviado={() => {
            showToast("Enviado para assinatura eletrônica com sucesso.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
