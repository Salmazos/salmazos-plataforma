"use client";

import { useEffect, useState } from "react";
import { ENTIDADES_CONTRATANTES } from "@/lib/constants";

interface CandidatoElegivel {
  id: string;
  candidato_id: string;
  vaga_id: string;
  candidatos: { id: string; nome_completo: string; cargo_pretendido: string; telefone: string | null } | null;
  vagas: {
    id: string;
    titulo: string;
    tipo_servico: string;
    cliente_id: string | null;
    clientes: { nome: string; entidade_contratante: string | null } | null;
  } | null;
  // Modalidade "vigente" da candidatura (encaminhamento mais recente, com fallback pra
  // vagas.tipo_servico) — ver src/lib/tipoServicoVigente.ts. Usar em vez de
  // vagas.tipo_servico direto, que pode divergir do que foi combinado com o cliente.
  tipo_servico_vigente: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCriado: () => void;
}

interface AdicionalForm {
  tipo: string;
  valor: string;
  formato_valor: "percentual" | "fixo";
}

function modalidadeDefault(tipoServico: string | null | undefined): string {
  if (tipoServico === "mao_obra_temporaria") return "MOT";
  if (tipoServico === "terceirizacao") return "terceirizacao";
  return "MOT";
}

function formatSalarioBR(value: string): string {
  if (!value.trim()) return value;
  const digits = value.replace(/\s/g, "").replace(/^R\$/, "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(digits);
  if (isNaN(num)) return value;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseSalario(value: string): number {
  const digits = value.replace(/\s/g, "").replace(/^R\$/, "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(digits);
  return isNaN(num) ? 0 : num;
}

export default function ModalIniciarAdmissao({ isOpen, onClose, onCriado }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [elegiveis, setElegiveis] = useState<CandidatoElegivel[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<CandidatoElegivel | null>(null);
  const [modalidade, setModalidade] = useState("MOT");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{ url: string; whatsappUrl: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Etapa 2: dados da admissão (preenchidos pelo RH antes de gerar o token)
  const [etapaDados, setEtapaDados] = useState(false);
  const [funcao, setFuncao] = useState("");
  const [salario, setSalario] = useState("");
  const [horarioTrabalho, setHorarioTrabalho] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [entidadeContratante, setEntidadeContratante] = useState("");
  const [adicionais, setAdicionais] = useState<AdicionalForm[]>([]);
  const [nomeSindicato, setNomeSindicato] = useState("");
  const [autorizaAssistencial, setAutorizaAssistencial] = useState<"" | "sim" | "nao">("");
  const [autorizaSindical, setAutorizaSindical] = useState<"" | "sim" | "nao">("");

  useEffect(() => {
    if (!isOpen) return;
    setSelecionado(null);
    setResultado(null);
    setErro("");
    setBusca("");
    setEtapaDados(false);
    setFuncao("");
    setSalario("");
    setHorarioTrabalho("");
    setDataAdmissao("");
    setEntidadeContratante("");
    setAdicionais([]);
    setNomeSindicato("");
    setAutorizaAssistencial("");
    setAutorizaSindical("");
    setCarregando(true);
    fetch("/api/admissoes/candidatos-elegiveis")
      .then((r) => r.json())
      .then((json) => setElegiveis(json.data ?? []))
      .finally(() => setCarregando(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const filtrados = elegiveis.filter((e) =>
    (e.candidatos?.nome_completo ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  const handleSelecionar = (c: CandidatoElegivel) => {
    setSelecionado(c);
    setModalidade(modalidadeDefault(c.tipo_servico_vigente));
    setEntidadeContratante(c.vagas?.clientes?.entidade_contratante ?? "");
  };

  const dadosValidos = Boolean(
    funcao.trim() && parseSalario(salario) > 0 && horarioTrabalho.trim() && dataAdmissao && entidadeContratante
      && autorizaAssistencial && autorizaSindical
  );

  const adicionarLinhaAdicional = () => {
    setAdicionais((prev) => [...prev, { tipo: "", valor: "", formato_valor: "percentual" }]);
  };

  const removerLinhaAdicional = (idx: number) => {
    setAdicionais((prev) => prev.filter((_, i) => i !== idx));
  };

  const atualizarLinhaAdicional = <K extends keyof AdicionalForm>(idx: number, campo: K, valor: AdicionalForm[K]) => {
    setAdicionais((prev) => prev.map((a, i) => (i === idx ? { ...a, [campo]: valor } : a)));
  };

  const handleContinuar = () => {
    if (!selecionado) return;
    setErro("");
    setEtapaDados(true);
  };

  const handleVoltar = () => {
    setErro("");
    setEtapaDados(false);
  };

  const handleConfirmar = async () => {
    if (!selecionado || !dadosValidos) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/admissoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidato_id: selecionado.candidato_id,
          vaga_id: selecionado.vaga_id,
          modalidade,
          funcao: funcao.trim(),
          salario: parseSalario(salario),
          horario_trabalho: horarioTrabalho.trim(),
          data_admissao: dataAdmissao,
          entidade_contratante: entidadeContratante,
          adicionais: adicionais
            .filter((a) => a.tipo.trim() && parseSalario(a.valor) > 0)
            .map((a) => ({ tipo: a.tipo.trim(), formato_valor: a.formato_valor, valor: parseSalario(a.valor) })),
          autorizacao_sindical: {
            nome_sindicato: nomeSindicato.trim() || null,
            autoriza_assistencial_confederativa: autorizaAssistencial === "sim",
            autoriza_sindical: autorizaSindical === "sim",
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao criar admissão."); return; }
      setResultado({ url: json.url, whatsappUrl: json.whatsappUrl ?? null });
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const handleCopiar = () => {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado.url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Iniciar admissão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {resultado ? (
          <div>
            <div className="rounded-lg p-4 mb-4 text-sm" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" }}>
              ✅ Admissão criada! O candidato já recebeu o link por e-mail.
            </div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Link de admissão</label>
            <div className="flex gap-2 mb-4">
              <input readOnly value={resultado.url} className="input-field flex-1 text-xs" />
              <button onClick={handleCopiar} className="btn-outline whitespace-nowrap">{copiado ? "Copiado!" : "Copiar"}</button>
            </div>
            {resultado.whatsappUrl && (
              <a
                href={resultado.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-white mb-4"
                style={{ background: "#25D366", textDecoration: "none" }}
              >
                📱 Enviar via WhatsApp
              </a>
            )}
            <button onClick={onCriado} className="btn-primary w-full">Concluir</button>
          </div>
        ) : !etapaDados ? (
          <>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Candidato aprovado (MOT/Terceirização)</label>
            <input
              type="text" placeholder="Buscar por nome..." value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input-field mb-3"
            />

            {carregando ? (
              <p className="text-sm text-gray-400 py-6 text-center">Carregando candidatos...</p>
            ) : filtrados.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Nenhum candidato elegível encontrado. Certifique-se de que o candidato foi aprovado pelo cliente em uma vaga MOT ou Terceirização.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg mb-4 max-h-56 overflow-y-auto">
                {filtrados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelecionar(c)}
                    className="w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-0"
                    style={{ background: selecionado?.id === c.id ? "#FFFBEB" : "#fff" }}
                  >
                    <p className="text-sm font-semibold text-gray-900">{c.candidatos?.nome_completo ?? "—"}</p>
                    <p className="text-xs text-gray-500">{c.candidatos?.cargo_pretendido} · {c.vagas?.titulo}</p>
                  </button>
                ))}
              </div>
            )}

            {selecionado && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Modalidade</label>
                <select value={modalidade} onChange={(e) => setModalidade(e.target.value)} className="input-field">
                  <option value="MOT">Mão de Obra Temporária (MOT)</option>
                  <option value="terceirizacao">Terceirização</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Vaga: {selecionado.vagas?.titulo}</p>
              </div>
            )}

            {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>Cancelar</button>
              <button onClick={handleContinuar} disabled={!selecionado} className="btn-primary flex-1 disabled:opacity-50">
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg p-3 mb-4 text-sm bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">{selecionado?.candidatos?.nome_completo ?? "—"}</p>
              <p className="text-xs text-gray-500">{selecionado?.candidatos?.cargo_pretendido} · {selecionado?.vagas?.titulo}</p>
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Dados da admissão — preenchidos pelo RH antes de gerar o link
            </p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Função *</label>
              <input
                type="text" value={funcao}
                onChange={(e) => setFuncao(e.target.value)}
                placeholder="Ex: Auxiliar de Produção"
                className="input-field"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Salário *</label>
              <input
                type="text" value={salario}
                onChange={(e) => setSalario(e.target.value)}
                onBlur={() => setSalario(formatSalarioBR(salario))}
                placeholder="Ex: R$ 2.500,00"
                className="input-field"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Horário de trabalho *</label>
              <input
                type="text" value={horarioTrabalho}
                onChange={(e) => setHorarioTrabalho(e.target.value)}
                placeholder="Ex: 08h às 17h48, seg-sex"
                className="input-field"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de admissão *</label>
              <input
                type="date" value={dataAdmissao}
                onChange={(e) => setDataAdmissao(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Adicionais</label>
                <button type="button" onClick={adicionarLinhaAdicional} className="text-xs font-semibold" style={{ color: "#B45309" }}>
                  + Adicionar
                </button>
              </div>
              {adicionais.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum adicional. Opcional — ex: insalubridade, periculosidade, assiduidade.</p>
              ) : (
                adicionais.map((a, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-2">
                    <input
                      type="text" placeholder="Tipo (ex: Insalubridade)" value={a.tipo}
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
                      type="button" onClick={() => removerLinhaAdicional(idx)}
                      className="text-red-600 text-sm" style={{ padding: 6 }} aria-label="Remover adicional"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Autorização Sindical</label>
              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Nome do sindicato</label>
                <input
                  type="text" value={nomeSindicato}
                  onChange={(e) => setNomeSindicato(e.target.value)}
                  placeholder="Se souber — a Salmazos pode confirmar depois"
                  className="input-field"
                />
              </div>
              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">Autoriza desconto das Contribuições Assistencial e Confederativa? *</label>
                <select value={autorizaAssistencial} onChange={(e) => setAutorizaAssistencial(e.target.value as "" | "sim" | "nao")} className="input-field">
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Autoriza desconto da Contribuição Sindical? *</label>
                <select value={autorizaSindical} onChange={(e) => setAutorizaSindical(e.target.value as "" | "sim" | "nao")} className="input-field">
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Entidade Contratante (CNPJ) *</label>
              <select
                value={entidadeContratante}
                onChange={(e) => setEntidadeContratante(e.target.value)}
                className="input-field"
              >
                <option value="">Selecione</option>
                {ENTIDADES_CONTRATANTES.map((ent) => (
                  <option key={ent.value} value={ent.value}>
                    {ent.razaoSocial} — {ent.cnpj}
                  </option>
                ))}
              </select>
            </div>

            {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

            <div className="flex gap-3">
              <button onClick={handleVoltar} className="btn-outline flex-1" disabled={enviando}>Voltar</button>
              <button onClick={handleConfirmar} disabled={!dadosValidos || enviando} className="btn-primary flex-1 disabled:opacity-50">
                {enviando ? "Criando..." : "Criar admissão"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
