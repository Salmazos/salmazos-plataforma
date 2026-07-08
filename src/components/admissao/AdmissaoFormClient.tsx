"use client";

import { useEffect, useState, useCallback } from "react";
import type { AdmissaoDependente } from "@/types";
import ProgressBar from "./ProgressBar";
import PassoBoasVindas from "./PassoBoasVindas";
import PassoDadosPessoais from "./PassoDadosPessoais";
import PassoDocumentosProfissionais from "./PassoDocumentosProfissionais";
import PassoEndereco from "./PassoEndereco";
import PassoDadosBancarios from "./PassoDadosBancarios";
import PassoSituacaoTrabalhista from "./PassoSituacaoTrabalhista";
import PassoDependentes from "./PassoDependentes";
import PassoValeTransporte from "./PassoValeTransporte";
import PassoUploadDocumentos from "./PassoUploadDocumentos";
import PassoRevisao from "./PassoRevisao";
import { botaoPrimarioStyle, botaoSecundarioStyle } from "./styles";
import { WHATSAPP_SUPORTE } from "@/lib/admissaoConstants";
import { STATUS_JA_ENVIADO } from "@/lib/admissaoStatus";

const TOTAL_PASSOS = 9;

export interface FormState {
  nome_completo: string;
  data_nascimento: string;
  sexo: string;
  estado_civil: string;
  nacionalidade: string;
  naturalidade: string;
  pais_nascimento: string;
  cor_raca: string;
  cpf: string;
  rg_numero: string;
  rg_orgao_emissor: string;
  rg_uf: string;
  rg_data_emissao: string;
  titulo_eleitor: string;
  zona_eleitoral: string;
  secao_eleitoral: string;
  pis_pasep: string;
  pis_data_cadastramento: string;
  carteira_trabalho_numero: string;
  carteira_trabalho_serie: string;
  carteira_trabalho_uf: string;
  ctps_data_emissao: string;
  possui_ctps_digital: boolean;
  cnh_numero: string;
  cnh_categoria: string;
  cnh_validade: string;
  cnh_data_emissao: string;
  cnh_uf: string;
  reservista: string;
  nome_mae: string;
  nacionalidade_mae: string;
  nome_pai: string;
  nacionalidade_pai: string;
  grau_instrucao: string;
  endereco_cep: string;
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  telefone: string;
  email: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
  pix: string;
}

const FORM_VAZIO: FormState = {
  nome_completo: "", data_nascimento: "", sexo: "", estado_civil: "", nacionalidade: "Brasileira",
  naturalidade: "", pais_nascimento: "Brasil", cor_raca: "",
  cpf: "", rg_numero: "", rg_orgao_emissor: "", rg_uf: "", rg_data_emissao: "",
  titulo_eleitor: "", zona_eleitoral: "", secao_eleitoral: "", pis_pasep: "", pis_data_cadastramento: "",
  carteira_trabalho_numero: "", carteira_trabalho_serie: "", carteira_trabalho_uf: "", ctps_data_emissao: "",
  possui_ctps_digital: false,
  cnh_numero: "", cnh_categoria: "", cnh_validade: "", cnh_data_emissao: "", cnh_uf: "", reservista: "",
  nome_mae: "", nacionalidade_mae: "", nome_pai: "", nacionalidade_pai: "", grau_instrucao: "",
  endereco_cep: "", endereco_logradouro: "", endereco_numero: "", endereco_complemento: "",
  endereco_bairro: "", endereco_cidade: "", endereco_uf: "", telefone: "", email: "",
  banco: "", agencia: "", conta: "", tipo_conta: "", pix: "",
};

export interface SituacaoTrabalhistaState {
  recebendo_seguro_desemprego: string; // "sim" | "nao" | ""
  primeiro_emprego: string;
  trabalhou_empresa_antes: string;
  aposentado: string;
  dependente_ir: string;
  dependente_salario_familia: string;
  tera_adiantamento: string;
}

const SITUACAO_TRABALHISTA_VAZIO: SituacaoTrabalhistaState = {
  recebendo_seguro_desemprego: "", primeiro_emprego: "", trabalhou_empresa_antes: "", aposentado: "",
  dependente_ir: "", dependente_salario_familia: "", tera_adiantamento: "",
};

export interface ValeTransporteLinha {
  onibus_viacao: string;
  percurso: string;
  valor_unitario: string;
  valor_total_diario: string;
}

export interface ValeTransporteState {
  opcao: string;
  dias_semana: string;
  bairro_cidade_trabalho: string;
  linhas: ValeTransporteLinha[];
  termos_aceitos: boolean;
}

const VALE_TRANSPORTE_VAZIO: ValeTransporteState = {
  opcao: "", dias_semana: "", bairro_cidade_trabalho: "", linhas: [], termos_aceitos: false,
};

// Autocomplete entre passos: se o campo já tem um valor salvo, mantém — senão usa a
// sugestão vinda de outro passo já preenchido (ex: bairro/cidade do endereço residencial
// sugerindo o local de trabalho). Continua editável; a sugestão só entra quando o campo
// está genuinamente vazio.
function sugerirSeVazio(valorSalvo: string | null | undefined, sugestao: string): string {
  return valorSalvo && valorSalvo.trim() ? valorSalvo : sugestao;
}

export interface DocumentoToken {
  id: string;
  tipo_documento: string;
  status: string;
  obrigatorio: boolean;
  condicional: string | null;
  motivo_rejeicao: string | null;
  storage_path: string | null;
}

interface AdmissaoTokenData {
  id: string;
  modalidade: string;
  status: string;
  candidatos: { nome_completo: string; cargo_pretendido: string } | null;
  vagas: { titulo: string } | null;
}

// Campos vazios precisam virar null (não "") antes de ir pro backend: os campos de
// enum (sexo, estado_civil, grau_instrucao, tipo_conta) rejeitam "" no zod, e os campos
// de data (data_nascimento, rg_data_emissao, cnh_validade) rejeitam "" no Postgres (DATE).
function sanitizarForm(form: FormState): Record<string, string | boolean | null> {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? (v.trim() === "" ? null : v) : v])
  );
}

function sanitizarValeTransporte(vt: ValeTransporteState): Record<string, unknown> {
  return {
    opcao: vt.opcao || null,
    dias_semana: vt.dias_semana.trim() || null,
    bairro_cidade_trabalho: vt.bairro_cidade_trabalho.trim() || null,
    // Linhas totalmente vazias não valem a pena persistir — mas mantém as parcialmente
    // preenchidas (progresso do candidato não se perde mesmo que ele não termine a linha).
    linhas: vt.linhas
      .filter((l) => l.onibus_viacao.trim() || l.percurso.trim() || l.valor_unitario.trim() || l.valor_total_diario.trim())
      .map((l) => ({
        onibus_viacao: l.onibus_viacao.trim() || null,
        percurso: l.percurso.trim() || null,
        valor_unitario: l.valor_unitario.trim() || null,
        valor_total_diario: l.valor_total_diario.trim() || null,
      })),
    termos_aceitos: vt.termos_aceitos,
  };
}

function sanitizarSituacaoTrabalhista(st: SituacaoTrabalhistaState): Record<string, boolean | null> {
  const simNao = (v: string) => (v === "sim" ? true : v === "nao" ? false : null);
  return {
    recebendo_seguro_desemprego: simNao(st.recebendo_seguro_desemprego),
    primeiro_emprego: simNao(st.primeiro_emprego),
    trabalhou_empresa_antes: simNao(st.trabalhou_empresa_antes),
    aposentado: simNao(st.aposentado),
    dependente_ir: simNao(st.dependente_ir),
    dependente_salario_familia: simNao(st.dependente_salario_familia),
    tera_adiantamento: simNao(st.tera_adiantamento),
  };
}

function validarPasso(
  passo: number, form: FormState, isMotorista: boolean, possuiDependentes: boolean, dependentesCount: number,
  valeTransporte: ValeTransporteState,
  situacaoTrabalhista: SituacaoTrabalhistaState,
): string[] {
  const faltando: string[] = [];
  const req = (campo: keyof FormState) => {
    const v = form[campo];
    if (typeof v === "string" ? !v.trim() : !v) faltando.push(campo);
  };

  if (passo === 1) {
    req("nome_completo"); req("data_nascimento"); req("sexo"); req("estado_civil");
    req("naturalidade"); req("cpf"); req("rg_numero"); req("rg_orgao_emissor");
    req("rg_uf"); req("rg_data_emissao"); req("nome_mae"); req("grau_instrucao");
  } else if (passo === 2) {
    req("pis_pasep"); req("titulo_eleitor");
    if (form.sexo === "M") req("reservista");
    if (isMotorista) { req("cnh_numero"); req("cnh_categoria"); req("cnh_validade"); }
  } else if (passo === 3) {
    req("endereco_cep"); req("endereco_logradouro"); req("endereco_numero");
    req("endereco_bairro"); req("endereco_cidade"); req("endereco_uf");
    req("telefone"); req("email");
  } else if (passo === 4) {
    req("banco"); req("agencia"); req("conta"); req("tipo_conta");
  } else if (passo === 5) {
    const reqSt = (campo: keyof SituacaoTrabalhistaState) => { if (!situacaoTrabalhista[campo]) faltando.push(campo); };
    reqSt("recebendo_seguro_desemprego"); reqSt("primeiro_emprego"); reqSt("trabalhou_empresa_antes");
    reqSt("aposentado"); reqSt("dependente_ir"); reqSt("dependente_salario_familia"); reqSt("tera_adiantamento");
  } else if (passo === 6) {
    if (possuiDependentes && dependentesCount === 0) faltando.push("dependentes");
  } else if (passo === 7) {
    if (!valeTransporte.opcao) faltando.push("vt_opcao");
    if (!valeTransporte.dias_semana.trim()) faltando.push("vt_dias_semana");
    if (!valeTransporte.bairro_cidade_trabalho.trim()) faltando.push("vt_bairro_cidade");
    if (valeTransporte.opcao === "vale_transporte") {
      const linhaValida = valeTransporte.linhas.some((l) => l.onibus_viacao.trim() && l.percurso.trim() && l.valor_unitario.trim());
      if (!linhaValida) faltando.push("vt_linhas");
      if (!valeTransporte.termos_aceitos) faltando.push("vt_termos_aceitos");
    }
  }
  return faltando;
}

// Ponto de entrada ao reabrir o link: em vez de sempre recomeçar do Passo 1, calcula o
// primeiro passo que realmente precisa de atenção. Documento rejeitado tem prioridade
// máxima (o candidato já passou pelos passos 1-7 antes pra ter chegado no upload, então
// não faz sentido mandá-lo de volta pro início só porque um documento foi rejeitado depois).
function calcularPassoInicial(
  form: FormState, isMotorista: boolean, possuiDependentes: boolean, dependentesCount: number,
  valeTransporte: ValeTransporteState, situacaoTrabalhista: SituacaoTrabalhistaState,
  documentos: DocumentoToken[],
): number {
  if (documentos.some((d) => d.status === "rejeitado")) return 8;

  for (let p = 1; p <= 7; p++) {
    if (validarPasso(p, form, isMotorista, possuiDependentes, dependentesCount, valeTransporte, situacaoTrabalhista).length > 0) {
      return p;
    }
  }

  const obrigatoriosVisiveis = documentos.filter((d) => {
    if (!d.obrigatorio) return false;
    if (d.condicional === "masculino") return form.sexo === "M";
    if (d.condicional === "motorista") return isMotorista;
    if (d.condicional === "dependente") return possuiDependentes;
    return true;
  });
  if (obrigatoriosVisiveis.some((d) => d.status === "pendente")) return 8;

  return 9;
}

export default function AdmissaoFormClient({ token }: { token: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState("");
  const [admissao, setAdmissao] = useState<AdmissaoTokenData | null>(null);
  const [jaEnviado, setJaEnviado] = useState(false);
  const [envioConcluido, setEnvioConcluido] = useState(false);

  const [iniciado, setIniciado] = useState(false);
  const [passo, setPasso] = useState(1);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [isMotorista, setIsMotorista] = useState(false);
  const [possuiDependentes, setPossuiDependentes] = useState(false);
  const [dependentes, setDependentes] = useState<AdmissaoDependente[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoToken[]>([]);
  const [valeTransporte, setValeTransporte] = useState<ValeTransporteState>(VALE_TRANSPORTE_VAZIO);
  const [situacaoTrabalhista, setSituacaoTrabalhista] = useState<SituacaoTrabalhistaState>(SITUACAO_TRABALHISTA_VAZIO);
  const [lgpdAceite, setLgpdAceite] = useState(false);

  const [errosVisiveis, setErrosVisiveis] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [toastVisivel, setToastVisivel] = useState(false);
  const [avisoFalhaSalvar, setAvisoFalhaSalvar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admissoes/token/${token}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setErroCarregamento(json.error || "Este link não é válido ou expirou. Entre em contato com a Salmazos pelo WhatsApp.");
          return;
        }
        const { data } = await res.json();
        setAdmissao(data.admissao);

        if (STATUS_JA_ENVIADO.includes(data.admissao.status)) {
          setJaEnviado(true);
          return;
        }

        let formCompleto = FORM_VAZIO;
        let isMotoristaCalc = false;
        let situacaoTrabalhistaCalc = SITUACAO_TRABALHISTA_VAZIO;
        if (data.dados_pessoais) {
          formCompleto = {
            ...FORM_VAZIO,
            ...Object.fromEntries(
              Object.entries(data.dados_pessoais)
                .filter(([k, v]) => k in FORM_VAZIO && v != null && k !== "possui_ctps_digital")
                .map(([k, v]) => [k, String(v)])
            ),
            possui_ctps_digital: !!data.dados_pessoais.possui_ctps_digital,
          };
          setForm(formCompleto);
          isMotoristaCalc = !!data.dados_pessoais.cnh_numero;
          setIsMotorista(isMotoristaCalc);

          const simNao = (v: boolean | null | undefined) => (v === true ? "sim" : v === false ? "nao" : "");
          situacaoTrabalhistaCalc = {
            recebendo_seguro_desemprego: simNao(data.dados_pessoais.recebendo_seguro_desemprego),
            primeiro_emprego: simNao(data.dados_pessoais.primeiro_emprego),
            trabalhou_empresa_antes: simNao(data.dados_pessoais.trabalhou_empresa_antes),
            aposentado: simNao(data.dados_pessoais.aposentado),
            dependente_ir: simNao(data.dados_pessoais.dependente_ir),
            dependente_salario_familia: simNao(data.dados_pessoais.dependente_salario_familia),
            tera_adiantamento: simNao(data.dados_pessoais.tera_adiantamento),
          };
          setSituacaoTrabalhista(situacaoTrabalhistaCalc);
        }
        const dependentesCalc: AdmissaoDependente[] = data.dependentes ?? [];
        const possuiDependentesCalc = dependentesCalc.length > 0;
        setDependentes(dependentesCalc);
        setPossuiDependentes(possuiDependentesCalc);
        const documentosCalc: DocumentoToken[] = data.documentos ?? [];
        setDocumentos(documentosCalc);

        // Autocomplete: bairro/cidade do local de trabalho sugerido a partir do
        // endereço residencial, só quando o campo ainda não foi salvo antes.
        const bairroCidadeResidencial = [data.dados_pessoais?.endereco_bairro, data.dados_pessoais?.endereco_cidade]
          .filter(Boolean).join(", ");
        const vt = data.vale_transporte;
        const valeTransporteCalc: ValeTransporteState = {
          opcao: vt?.opcao ?? "",
          dias_semana: vt?.dias_semana ?? "",
          bairro_cidade_trabalho: sugerirSeVazio(vt?.bairro_cidade_trabalho, bairroCidadeResidencial),
          linhas: ((vt?.admissao_vt_linhas ?? []) as { onibus_viacao: string | null; percurso: string | null; valor_unitario: number | null; valor_total_diario: number | null }[])
            .map((l) => ({
              onibus_viacao: l.onibus_viacao ?? "",
              percurso: l.percurso ?? "",
              valor_unitario: l.valor_unitario != null ? String(l.valor_unitario) : "",
              valor_total_diario: l.valor_total_diario != null ? String(l.valor_total_diario) : "",
            })),
          termos_aceitos: vt?.termos_aceitos === true,
        };
        setValeTransporte(valeTransporteCalc);

        // Reabrindo o link (status já saiu de "aguardando_candidato" em algum momento):
        // pula direto pro primeiro passo com pendência real em vez de recomeçar do 1.
        if (data.admissao.status !== "aguardando_candidato") {
          setPasso(calcularPassoInicial(
            formCompleto, isMotoristaCalc, possuiDependentesCalc, dependentesCalc.length,
            valeTransporteCalc, situacaoTrabalhistaCalc, documentosCalc,
          ));
          setIniciado(true);
        }
      } catch {
        setErroCarregamento("Não foi possível carregar seus dados. Verifique sua conexão e tente novamente.");
      } finally {
        setCarregando(false);
      }
    })();
  }, [token]);

  const setCampo = useCallback(<K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  const setCampoVt = useCallback(<K extends keyof ValeTransporteState>(campo: K, valor: ValeTransporteState[K]) => {
    setValeTransporte((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  const setCampoSt = useCallback(<K extends keyof SituacaoTrabalhistaState>(campo: K, valor: SituacaoTrabalhistaState[K]) => {
    setSituacaoTrabalhista((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  const salvarProgresso = useCallback(async (): Promise<boolean> => {
    setSalvando(true);
    setAvisoFalhaSalvar(false);
    try {
      const res = await fetch(`/api/admissoes/token/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dados_pessoais: { ...sanitizarForm(form), ...sanitizarSituacaoTrabalhista(situacaoTrabalhista) },
          vale_transporte: sanitizarValeTransporte(valeTransporte),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error("[admissao] Falha ao salvar progresso:", json.error || res.status);
        setAvisoFalhaSalvar(true);
        return false;
      }
      setToastVisivel(true);
      setTimeout(() => setToastVisivel(false), 2500);
      return true;
    } catch (err) {
      console.error("[admissao] Erro de conexão ao salvar progresso:", err);
      setAvisoFalhaSalvar(true);
      return false;
    } finally {
      setSalvando(false);
    }
  }, [token, form, valeTransporte, situacaoTrabalhista]);

  const avancar = async () => {
    const faltando = validarPasso(passo, form, isMotorista, possuiDependentes, dependentes.length, valeTransporte, situacaoTrabalhista);
    if (faltando.length > 0) {
      setErrosVisiveis(new Set(faltando));
      return;
    }
    setErrosVisiveis(new Set());
    await salvarProgresso();
    setPasso((p) => Math.min(p + 1, TOTAL_PASSOS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const voltar = () => {
    setErrosVisiveis(new Set());
    setPasso((p) => Math.max(p - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const enviarParaAnalise = async () => {
    setEnviando(true);
    setErroEnvio("");
    try {
      const res = await fetch(`/api/admissoes/token/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dados_pessoais: { ...sanitizarForm(form), ...sanitizarSituacaoTrabalhista(situacaoTrabalhista) },
          vale_transporte: sanitizarValeTransporte(valeTransporte),
          submit: true,
          lgpd_aceite: lgpdAceite,
        }),
      });
      if (res.ok) {
        setEnvioConcluido(true);
        return;
      }
      const json = await res.json().catch(() => ({}));
      console.error("[admissao] Falha ao enviar para análise:", json.error || res.status);
      setErroEnvio(json.error || "Não foi possível enviar seus dados agora. Tente novamente em instantes.");
    } catch (err) {
      console.error("[admissao] Erro de conexão ao enviar para análise:", err);
      setErroEnvio("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #FFD700", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (erroCarregamento) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.6, marginBottom: 20 }}>{erroCarregamento}</p>
          <a
            href={`https://wa.me/${WHATSAPP_SUPORTE}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...botaoPrimarioStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
          >
            📱 Falar no WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (jaEnviado) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Recebemos seus dados!</p>
          <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.6 }}>
            Sua admissão já está com a equipe da Salmazos para análise. Em caso de dúvidas, fale conosco pelo WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  if (envioConcluido) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Documentos enviados com sucesso!</p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.6, marginBottom: 20 }}>
            A equipe da Salmazos entrará em contato em breve para confirmar sua admissão.
          </p>
          <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, fontSize: 12, color: "#6B7280", lineHeight: 1.6, marginBottom: 20, textAlign: "left" }}>
            Seus dados serão utilizados exclusivamente para fins admissionais e mantidos de forma segura em
            conformidade com a LGPD. Você tem direito ao acesso, correção e exclusão dos seus dados a qualquer
            momento através do e-mail: <strong>privacidade@salmazos.com.br</strong>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP_SUPORTE}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...botaoSecundarioStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
          >
            📱 Alguma dúvida? Fale conosco
          </a>
        </div>
      </div>
    );
  }

  const nome = admissao?.candidatos?.nome_completo ?? "";
  const cargo = admissao?.candidatos?.cargo_pretendido ?? admissao?.vagas?.titulo ?? "";

  if (!iniciado) {
    return (
      <div style={{ minHeight: "100vh", background: "#F9FAFB", paddingBottom: 32 }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Olá, {nome || "candidato(a)"}!</p>
            {cargo && <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Vaga: {cargo}</p>}
          </div>
          <PassoBoasVindas onIniciar={() => setIniciado(true)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", paddingBottom: 32 }}>
      <ProgressBar passoAtual={passo} />

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Olá, {nome || "candidato(a)"}!</p>
          {cargo && <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Vaga: {cargo}</p>}
        </div>

        {passo === 1 && <PassoDadosPessoais form={form} setCampo={setCampo} errosVisiveis={errosVisiveis} />}
        {passo === 2 && (
          <PassoDocumentosProfissionais
            form={form} setCampo={setCampo} errosVisiveis={errosVisiveis}
            isMotorista={isMotorista} setIsMotorista={setIsMotorista}
          />
        )}
        {passo === 3 && <PassoEndereco form={form} setCampo={setCampo} errosVisiveis={errosVisiveis} />}
        {passo === 4 && <PassoDadosBancarios form={form} setCampo={setCampo} errosVisiveis={errosVisiveis} />}
        {passo === 5 && (
          <PassoSituacaoTrabalhista
            situacaoTrabalhista={situacaoTrabalhista} setCampo={setCampoSt} errosVisiveis={errosVisiveis}
          />
        )}
        {passo === 6 && (
          <PassoDependentes
            token={token}
            possuiDependentes={possuiDependentes} setPossuiDependentes={setPossuiDependentes}
            dependentes={dependentes} setDependentes={setDependentes}
            errosVisiveis={errosVisiveis}
          />
        )}
        {passo === 7 && (
          <PassoValeTransporte
            valeTransporte={valeTransporte} setCampo={setCampoVt} errosVisiveis={errosVisiveis}
          />
        )}
        {passo === 8 && (
          <PassoUploadDocumentos
            token={token}
            documentos={documentos} setDocumentos={setDocumentos}
            sexo={form.sexo} isMotorista={isMotorista} possuiDependentes={possuiDependentes}
          />
        )}
        {passo === 9 && (
          <PassoRevisao
            form={form} dependentes={dependentes} documentos={documentos}
            valeTransporte={valeTransporte}
            situacaoTrabalhista={situacaoTrabalhista}
            sexo={form.sexo} isMotorista={isMotorista} possuiDependentes={possuiDependentes}
            lgpdAceite={lgpdAceite} setLgpdAceite={setLgpdAceite}
            onEnviar={enviarParaAnalise} enviando={enviando}
          />
        )}

        {avisoFalhaSalvar && (
          <p style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>
            ⚠️ Não conseguimos salvar seu progresso agora, mas você pode continuar preenchendo.
          </p>
        )}

        {passo === TOTAL_PASSOS && erroEnvio && (
          <p style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>
            ⚠️ {erroEnvio}
          </p>
        )}

        {passo < TOTAL_PASSOS && (
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            {passo > 1 && (
              <button onClick={voltar} style={botaoSecundarioStyle}>Voltar</button>
            )}
            <button onClick={avancar} disabled={salvando} style={{ ...botaoPrimarioStyle, opacity: salvando ? 0.7 : 1 }}>
              {salvando ? "Salvando..." : "Próximo"}
            </button>
          </div>
        )}
        {passo === TOTAL_PASSOS && (
          <div style={{ marginTop: 16 }}>
            <button onClick={voltar} style={botaoSecundarioStyle}>Voltar</button>
          </div>
        )}
      </div>

      {toastVisivel && (
        <div
          style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            background: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 10,
            fontSize: 14, fontWeight: 600, zIndex: 60, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          ✓ Progresso salvo
        </div>
      )}
    </div>
  );
}
