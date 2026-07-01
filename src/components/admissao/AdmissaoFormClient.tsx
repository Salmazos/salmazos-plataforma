"use client";

import { useEffect, useState, useCallback } from "react";
import type { AdmissaoDependente } from "@/types";
import ProgressBar from "./ProgressBar";
import PassoDadosPessoais from "./PassoDadosPessoais";
import PassoDocumentosProfissionais from "./PassoDocumentosProfissionais";
import PassoEndereco from "./PassoEndereco";
import PassoDadosBancarios from "./PassoDadosBancarios";
import PassoDependentes from "./PassoDependentes";
import PassoUploadDocumentos from "./PassoUploadDocumentos";
import PassoRevisao from "./PassoRevisao";
import { botaoPrimarioStyle, botaoSecundarioStyle } from "./styles";
import { WHATSAPP_SUPORTE } from "@/lib/admissaoConstants";

export interface FormState {
  nome_completo: string;
  data_nascimento: string;
  sexo: string;
  estado_civil: string;
  nacionalidade: string;
  naturalidade: string;
  cpf: string;
  rg_numero: string;
  rg_orgao_emissor: string;
  rg_uf: string;
  rg_data_emissao: string;
  titulo_eleitor: string;
  zona_eleitoral: string;
  secao_eleitoral: string;
  pis_pasep: string;
  carteira_trabalho_numero: string;
  carteira_trabalho_serie: string;
  carteira_trabalho_uf: string;
  cnh_numero: string;
  cnh_categoria: string;
  cnh_validade: string;
  reservista: string;
  nome_mae: string;
  nome_pai: string;
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
}

const FORM_VAZIO: FormState = {
  nome_completo: "", data_nascimento: "", sexo: "", estado_civil: "", nacionalidade: "Brasileira",
  naturalidade: "", cpf: "", rg_numero: "", rg_orgao_emissor: "", rg_uf: "", rg_data_emissao: "",
  titulo_eleitor: "", zona_eleitoral: "", secao_eleitoral: "", pis_pasep: "",
  carteira_trabalho_numero: "", carteira_trabalho_serie: "", carteira_trabalho_uf: "",
  cnh_numero: "", cnh_categoria: "", cnh_validade: "", reservista: "",
  nome_mae: "", nome_pai: "", grau_instrucao: "",
  endereco_cep: "", endereco_logradouro: "", endereco_numero: "", endereco_complemento: "",
  endereco_bairro: "", endereco_cidade: "", endereco_uf: "", telefone: "", email: "",
  banco: "", agencia: "", conta: "", tipo_conta: "",
};

export interface DocumentoToken {
  id: string;
  tipo_documento: string;
  status: string;
  obrigatorio: boolean;
  condicional: string | null;
  motivo_rejeicao: string | null;
}

interface AdmissaoTokenData {
  id: string;
  modalidade: string;
  status: string;
  candidatos: { nome_completo: string; cargo_pretendido: string } | null;
  vagas: { titulo: string } | null;
}

const STATUS_JA_ENVIADO = ["aguardando_analise", "em_analise", "aprovado", "enviado_contabilidade"];

// Campos vazios precisam virar null (não "") antes de ir pro backend: os campos de
// enum (sexo, estado_civil, grau_instrucao, tipo_conta) rejeitam "" no zod, e os campos
// de data (data_nascimento, rg_data_emissao, cnh_validade) rejeitam "" no Postgres (DATE).
function sanitizarForm(form: FormState): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v])
  );
}

function validarPasso(passo: number, form: FormState, isMotorista: boolean, possuiDependentes: boolean, dependentesCount: number): string[] {
  const faltando: string[] = [];
  const req = (campo: keyof FormState) => { if (!form[campo]?.trim()) faltando.push(campo); };

  if (passo === 1) {
    req("nome_completo"); req("data_nascimento"); req("sexo"); req("estado_civil");
    req("naturalidade"); req("cpf"); req("rg_numero"); req("rg_orgao_emissor");
    req("rg_uf"); req("rg_data_emissao"); req("nome_mae"); req("grau_instrucao");
  } else if (passo === 2) {
    req("pis_pasep"); req("carteira_trabalho_numero"); req("carteira_trabalho_serie");
    req("carteira_trabalho_uf"); req("titulo_eleitor");
    if (form.sexo === "M") req("reservista");
    if (isMotorista) { req("cnh_numero"); req("cnh_categoria"); req("cnh_validade"); }
  } else if (passo === 3) {
    req("endereco_cep"); req("endereco_logradouro"); req("endereco_numero");
    req("endereco_bairro"); req("endereco_cidade"); req("endereco_uf");
    req("telefone"); req("email");
  } else if (passo === 4) {
    req("banco"); req("agencia"); req("conta"); req("tipo_conta");
  } else if (passo === 5) {
    if (possuiDependentes && dependentesCount === 0) faltando.push("dependentes");
  }
  return faltando;
}

export default function AdmissaoFormClient({ token }: { token: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState("");
  const [admissao, setAdmissao] = useState<AdmissaoTokenData | null>(null);
  const [jaEnviado, setJaEnviado] = useState(false);
  const [envioConcluido, setEnvioConcluido] = useState(false);

  const [passo, setPasso] = useState(1);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [isMotorista, setIsMotorista] = useState(false);
  const [possuiDependentes, setPossuiDependentes] = useState(false);
  const [dependentes, setDependentes] = useState<AdmissaoDependente[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoToken[]>([]);
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

        if (data.dados_pessoais) {
          setForm((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(data.dados_pessoais).filter(([k, v]) => k in prev && v != null).map(([k, v]) => [k, String(v)])
            ),
          }));
          setIsMotorista(!!data.dados_pessoais.cnh_numero);
        }
        setDependentes(data.dependentes ?? []);
        setPossuiDependentes((data.dependentes ?? []).length > 0);
        setDocumentos(data.documentos ?? []);
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

  const salvarProgresso = useCallback(async (): Promise<boolean> => {
    setSalvando(true);
    setAvisoFalhaSalvar(false);
    try {
      const res = await fetch(`/api/admissoes/token/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados_pessoais: sanitizarForm(form) }),
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
  }, [token, form]);

  const avancar = async () => {
    const faltando = validarPasso(passo, form, isMotorista, possuiDependentes, dependentes.length);
    if (faltando.length > 0) {
      setErrosVisiveis(new Set(faltando));
      return;
    }
    setErrosVisiveis(new Set());
    await salvarProgresso();
    setPasso((p) => Math.min(p + 1, 7));
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
        body: JSON.stringify({ dados_pessoais: sanitizarForm(form), submit: true }),
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
          <PassoDependentes
            token={token}
            possuiDependentes={possuiDependentes} setPossuiDependentes={setPossuiDependentes}
            dependentes={dependentes} setDependentes={setDependentes}
            errosVisiveis={errosVisiveis}
          />
        )}
        {passo === 6 && (
          <PassoUploadDocumentos
            token={token}
            documentos={documentos} setDocumentos={setDocumentos}
            sexo={form.sexo} isMotorista={isMotorista} possuiDependentes={possuiDependentes}
          />
        )}
        {passo === 7 && (
          <PassoRevisao
            form={form} dependentes={dependentes} documentos={documentos}
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

        {passo === 7 && erroEnvio && (
          <p style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>
            ⚠️ {erroEnvio}
          </p>
        )}

        {passo < 7 && (
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            {passo > 1 && (
              <button onClick={voltar} style={botaoSecundarioStyle}>Voltar</button>
            )}
            <button onClick={avancar} disabled={salvando} style={{ ...botaoPrimarioStyle, opacity: salvando ? 0.7 : 1 }}>
              {salvando ? "Salvando..." : "Próximo"}
            </button>
          </div>
        )}
        {passo === 7 && (
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
