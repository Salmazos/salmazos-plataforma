"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const TIPOS = [
  { id: "recrutamento_selecao", icon: "🎯", label: "Recrutamento e Seleção", desc: "Contratação direta pelo cliente" },
  { id: "mao_obra_temporaria", icon: "⏱", label: "Mão de Obra Temporária", desc: "Funcionário Salmazos, contrato temporário" },
  { id: "terceirizacao", icon: "🏢", label: "Terceirização", desc: "Funcionário Salmazos, prazo indeterminado" },
] as const;

const HORARIO_TIPOS = [
  { id: "seg_sex", label: "Segunda a Sexta" },
  { id: "6x1", label: "Escala 6x1" },
  { id: "12x36", label: "Escala 12x36" },
  { id: "turno_fixo", label: "Turno Fixo" },
  { id: "a_combinar", label: "A combinar" },
  { id: "personalizado", label: "Personalizado" },
] as const;

const REQ_ESCOLARIDADE = ["Ensino Fundamental Completo", "Ensino Médio Completo", "Ensino Técnico", "Ensino Superior"];
const REQ_COM_CURSO = new Set(["Ensino Técnico", "Ensino Superior"]);
const REQ_EXPERIENCIA = ["Experiência na função", "Experiência em atendimento ao público", "Experiência em liderança/gestão", "Experiência em vendas"];
const REQ_CNH = ["CNH B", "CNH C", "CNH D", "CNH E"];
const REQ_NR = ["NR-6", "NR-10", "NR-11", "NR-12", "NR-35"];
const REQ_CONHECIMENTOS = ["Pacote Office", "Informática básica", "Excel avançado"];

const BEN_TRANSPORTE = ["Vale Transporte", "Fretado", "Auxílio Combustível", "Estacionamento"];
const BEN_ALIMENTACAO = ["Vale Alimentação", "Vale Refeição", "Refeição no Local", "Cesta Básica"];
const BEN_SAUDE = ["Convênio Médico", "Convênio Odontológico", "Convênio Farmácia", "Seguro de Vida"];
const BEN_QUALIDADE = ["Gympass / Totalpass", "Day Off", "PLR", "Bonificação Anual"];

type HorarioTipo = typeof HORARIO_TIPOS[number]["id"];

const CHIP_ON: React.CSSProperties = { backgroundColor: "#16a34a", color: "#fff", border: "2px solid #16a34a" };
const CHIP_OFF: React.CSSProperties = { backgroundColor: "#fff", color: "#374151", border: "2px solid #D1D5DB" };

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.05em",
  display: "block", marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 8,
  padding: "9px 12px", fontSize: 14, color: "#111827",
  outline: "none", width: "100%", boxSizing: "border-box",
};

export default function SolicitarVagaPage() {
  const [cargo, setCargo] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [numPosicoes, setNumPosicoes] = useState("1");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [salario, setSalario] = useState("");
  const [previsaoInicio, setPrevisaoInicio] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [horarioTipo, setHorarioTipo] = useState<HorarioTipo | "">("");
  const [horEntrada, setHorEntrada] = useState("");
  const [horSaida, setHorSaida] = useState("");
  const [horIntervalo, setHorIntervalo] = useState("");
  const [hor1236, setHor1236] = useState<"diurno" | "noturno">("diurno");
  const [horTurno, setHorTurno] = useState<"a" | "b" | "c" | "custom">("a");
  const [horTurnoEntrada, setHorTurnoEntrada] = useState("");
  const [horTurnoSaida, setHorTurnoSaida] = useState("");
  const [horCustom, setHorCustom] = useState("");

  const [reqChips, setReqChips] = useState<Record<string, boolean>>({});
  const [reqCursos, setReqCursos] = useState<Record<string, string>>({});
  const [reqCustom, setReqCustom] = useState<string[]>([]);
  const [reqInput, setReqInput] = useState("");

  const [benChips, setBenChips] = useState<Record<string, boolean>>({});
  const [benCustom, setBenCustom] = useState<string[]>([]);
  const [benInput, setBenInput] = useState("");
  const [benPadraoLoaded, setBenPadraoLoaded] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/portal/solicitar-vaga")
      .then((r) => r.json())
      .then((json) => {
        if (json.beneficios_padrao && typeof json.beneficios_padrao === "object") {
          setBenChips(json.beneficios_padrao);
          setBenPadraoLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  const toggleReq = (chip: string) =>
    setReqChips((prev) => ({ ...prev, [chip]: !prev[chip] }));

  const toggleBen = (chip: string) =>
    setBenChips((prev) => ({ ...prev, [chip]: !prev[chip] }));

  const addReqCustom = () => {
    const v = reqInput.trim();
    if (!v || reqCustom.includes(v)) return;
    setReqCustom((prev) => [...prev, v]);
    setReqInput("");
  };

  const addBenCustom = () => {
    const v = benInput.trim();
    if (!v || benCustom.includes(v)) return;
    setBenCustom((prev) => [...prev, v]);
    setBenInput("");
  };

  const gerarHorarioTexto = (): string => {
    if (!horarioTipo) return "";
    if (horarioTipo === "a_combinar") return "A combinar";
    if (horarioTipo === "personalizado") return horCustom.trim();
    if (horarioTipo === "seg_sex") {
      const base = `Segunda a Sexta, ${horEntrada || "—"} às ${horSaida || "—"}`;
      return horIntervalo ? `${base} (intervalo: ${horIntervalo})` : base;
    }
    if (horarioTipo === "6x1") return `Escala 6x1, ${horEntrada || "—"} às ${horSaida || "—"}`;
    if (horarioTipo === "12x36") return hor1236 === "diurno" ? "Escala 12x36, 06h às 18h (Diurno)" : "Escala 12x36, 18h às 06h (Noturno)";
    if (horarioTipo === "turno_fixo") {
      if (horTurno === "a") return "Turno A — 06h às 14h";
      if (horTurno === "b") return "Turno B — 14h às 22h";
      if (horTurno === "c") return "Turno C — 22h às 06h";
      return `Turno Fixo, ${horTurnoEntrada || "—"} às ${horTurnoSaida || "—"}`;
    }
    return "";
  };

  const gerarRequisitosTexto = (): string => {
    const items: string[] = [];
    for (const chip of [...REQ_ESCOLARIDADE, ...REQ_EXPERIENCIA, ...REQ_CNH, ...REQ_NR, ...REQ_CONHECIMENTOS]) {
      if (reqChips[chip]) {
        const curso = reqCursos[chip]?.trim();
        items.push(curso ? `${chip} em ${curso}` : chip);
      }
    }
    items.push(...reqCustom);
    return items.map((i) => `• ${i}`).join("\n");
  };

  const gerarBeneficiosTexto = (): string => {
    const items: string[] = [];
    for (const chip of [...BEN_TRANSPORTE, ...BEN_ALIMENTACAO, ...BEN_SAUDE, ...BEN_QUALIDADE]) {
      if (benChips[chip]) items.push(chip);
    }
    items.push(...benCustom);
    return items.map((i) => `• ${i}`).join("\n");
  };

  const gerarBeneficiosChips = (): Record<string, boolean> => {
    const result: Record<string, boolean> = {};
    for (const chip of [...BEN_TRANSPORTE, ...BEN_ALIMENTACAO, ...BEN_SAUDE, ...BEN_QUALIDADE]) {
      if (benChips[chip]) result[chip] = true;
    }
    for (const c of benCustom) result[c] = true;
    return result;
  };

  const horarioTexto = useMemo(gerarHorarioTexto, [horarioTipo, horEntrada, horSaida, horIntervalo, hor1236, horTurno, horTurnoEntrada, horTurnoSaida, horCustom]);
  const requisitosTexto = useMemo(gerarRequisitosTexto, [reqChips, reqCursos, reqCustom]);
  const beneficiosTexto = useMemo(gerarBeneficiosTexto, [benChips, benCustom]);

  const handleSubmit = async () => {
    setError("");
    if (!cargo.trim()) { setError("Cargo é obrigatório."); return; }
    if (!tipoServico) { setError("Tipo de serviço é obrigatório."); return; }
    if (!cidade.trim()) { setError("Cidade é obrigatória."); return; }
    if (!estado) { setError("Estado é obrigatório."); return; }

    setSubmitting(true);
    try {
      const reqChipsList: string[] = [];
      for (const chip of [...REQ_ESCOLARIDADE, ...REQ_EXPERIENCIA, ...REQ_CNH, ...REQ_NR, ...REQ_CONHECIMENTOS]) {
        if (reqChips[chip]) {
          const curso = reqCursos[chip]?.trim();
          reqChipsList.push(curso ? `${chip} em ${curso}` : chip);
        }
      }
      reqChipsList.push(...reqCustom);

      const res = await fetch("/api/portal/solicitar-vaga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cargo: cargo.trim(),
          tipo_servico: tipoServico,
          num_posicoes: Number(numPosicoes) || 1,
          cidade: cidade.trim(),
          estado,
          salario: salario.trim() || null,
          horario_tipo: horarioTipo || null,
          horario_texto: horarioTexto || null,
          previsao_inicio: previsaoInicio || null,
          requisitos: requisitosTexto || null,
          requisitos_chips: reqChipsList.length > 0 ? reqChipsList : null,
          beneficios: beneficiosTexto || null,
          beneficios_chips: gerarBeneficiosChips(),
          observacoes: observacoes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao enviar."); return; }
      setSuccess(true);
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="text-5xl mb-4">{"✅"}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Solicitação enviada!</h2>
          <p className="text-sm text-gray-500 mb-6">
            Sua solicitação foi recebida e será analisada pela equipe Salmazos.
            Você receberá uma notificação quando a vaga for criada.
          </p>
          <Link
            href="/portal"
            className="inline-block px-6 py-2.5 bg-black text-[#FFD700] rounded-xl font-semibold text-sm"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Solicitar Nova Vaga</h1>

      <div className="space-y-6">

        {/* ── SECTION 1: Dados da Vaga ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Dados da Vaga</p>

          <div>
            <label style={labelStyle}>Cargo / Função *</label>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Operador de Produção" style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} />
          </div>

          <div>
            <label style={labelStyle}>Tipo de Serviço *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TIPOS.map((t) => {
                const ativo = tipoServico === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setTipoServico(t.id)}
                    className="text-left rounded-xl p-4 transition-all"
                    style={{
                      border: ativo ? "2px solid #000" : "2px solid #E5E7EB",
                      background: ativo ? "#000" : "#fff",
                      color: ativo ? "#FFD700" : "#374151",
                    }}
                  >
                    <span className="text-lg">{t.icon}</span>
                    <p className="font-semibold text-sm mt-1" style={{ color: ativo ? "#FFD700" : "#111827" }}>{t.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: ativo ? "#FFD700" : "#6B7280", opacity: ativo ? 0.8 : 1 }}>{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Nº de Posições</label>
              <input type="number" min="1" value={numPosicoes} onChange={(e) => setNumPosicoes(e.target.value)} placeholder="1" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Previsão de Início</label>
              <input type="date" value={previsaoInicio} onChange={(e) => setPrevisaoInicio(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Salário</label>
              <input value={salario} onChange={(e) => setSalario(e.target.value)} placeholder="Ex: R$ 2.000,00" style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Cidade *</label>
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São Paulo" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Estado *</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ ...inputStyle, background: "#fff", cursor: "pointer" }}>
                <option value="">Selecione...</option>
                {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Horário ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Horário de Trabalho</p>

          <div className="flex flex-wrap gap-2">
            {HORARIO_TIPOS.map((h) => (
              <button key={h.id} type="button" onClick={() => setHorarioTipo(horarioTipo === h.id ? "" : h.id)}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                style={horarioTipo === h.id ? { backgroundColor: "#000", color: "#fff", border: "2px solid #000" } : CHIP_OFF}>
                {h.label}
              </button>
            ))}
          </div>

          {horarioTipo === "seg_sex" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div><label style={labelStyle}>Entrada</label><input type="time" value={horEntrada} onChange={(e) => setHorEntrada(e.target.value)} style={{ ...inputStyle, width: 120 }} /></div>
              <div><label style={labelStyle}>Saída</label><input type="time" value={horSaida} onChange={(e) => setHorSaida(e.target.value)} style={{ ...inputStyle, width: 120 }} /></div>
              <div>
                <label style={labelStyle}>Intervalo</label>
                <select value={horIntervalo} onChange={(e) => setHorIntervalo(e.target.value)} style={{ ...inputStyle, width: 150, background: "#fff", cursor: "pointer" }}>
                  <option value="">Selecione...</option>
                  <option value="1h">1 hora</option>
                  <option value="45min">45 minutos</option>
                  <option value="30min">30 minutos</option>
                  <option value="sem intervalo">Sem intervalo</option>
                </select>
              </div>
            </div>
          )}

          {horarioTipo === "6x1" && (
            <div className="flex items-center gap-3">
              <div><label style={labelStyle}>Entrada</label><input type="time" value={horEntrada} onChange={(e) => setHorEntrada(e.target.value)} style={{ ...inputStyle, width: 120 }} /></div>
              <div><label style={labelStyle}>Saída</label><input type="time" value={horSaida} onChange={(e) => setHorSaida(e.target.value)} style={{ ...inputStyle, width: 120 }} /></div>
            </div>
          )}

          {horarioTipo === "12x36" && (
            <div className="flex gap-3">
              {(["diurno", "noturno"] as const).map((o) => (
                <button key={o} type="button" onClick={() => setHor1236(o)}
                  className="text-sm px-4 py-2 rounded-lg font-medium transition-all"
                  style={hor1236 === o ? { background: "#000", color: "#FFD700", border: "2px solid #000" } : { background: "#fff", color: "#374151", border: "2px solid #E5E7EB" }}>
                  {o === "diurno" ? "☀️ Diurno (06h às 18h)" : "🌙 Noturno (18h às 06h)"}
                </button>
              ))}
            </div>
          )}

          {horarioTipo === "turno_fixo" && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {([["a", "Turno A — 06h às 14h"], ["b", "Turno B — 14h às 22h"], ["c", "Turno C — 22h às 06h"], ["custom", "Personalizado"]] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setHorTurno(id)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                    style={horTurno === id ? { backgroundColor: "#000", color: "#fff", border: "2px solid #000" } : CHIP_OFF}>
                    {label}
                  </button>
                ))}
              </div>
              {horTurno === "custom" && (
                <div className="flex items-center gap-3">
                  <div><label style={labelStyle}>Entrada</label><input type="time" value={horTurnoEntrada} onChange={(e) => setHorTurnoEntrada(e.target.value)} style={{ ...inputStyle, width: 120 }} /></div>
                  <div><label style={labelStyle}>Saída</label><input type="time" value={horTurnoSaida} onChange={(e) => setHorTurnoSaida(e.target.value)} style={{ ...inputStyle, width: 120 }} /></div>
                </div>
              )}
            </div>
          )}

          {horarioTipo === "personalizado" && (
            <textarea value={horCustom} onChange={(e) => setHorCustom(e.target.value)} placeholder="Descreva o horário..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          )}

          {horarioTexto && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Horário</p>
              <p className="text-sm text-gray-700 font-medium">{horarioTexto}</p>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Requisitos ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Requisitos</p>
          <p className="text-xs text-gray-400">Clique para adicionar requisitos</p>

          <ChipGroup label="Escolaridade" chips={REQ_ESCOLARIDADE} selected={reqChips} onToggle={toggleReq} cursos={reqCursos} onCursoChange={(k, v) => setReqCursos((p) => ({ ...p, [k]: v }))} comCurso={REQ_COM_CURSO} />
          <ChipGroup label="Experiência" chips={REQ_EXPERIENCIA} selected={reqChips} onToggle={toggleReq} />
          <ChipGroup label="Habilitação" chips={REQ_CNH} selected={reqChips} onToggle={toggleReq} />
          <ChipGroup label="Normas Regulamentadoras" chips={REQ_NR} selected={reqChips} onToggle={toggleReq} />
          <ChipGroup label="Conhecimentos" chips={REQ_CONHECIMENTOS} selected={reqChips} onToggle={toggleReq} />

          {reqCustom.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {reqCustom.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: "#16a34a", color: "#fff" }}>
                  {c}
                  <button type="button" onClick={() => setReqCustom((p) => p.filter((x) => x !== c))} className="opacity-70 hover:opacity-100">×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input value={reqInput} onChange={(e) => setReqInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addReqCustom())}
              placeholder="Digite um requisito e pressione Enter" style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={addReqCustom} className="shrink-0 text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-black hover:text-black transition-colors font-medium">Adicionar</button>
          </div>

          {requisitosTexto && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Requisitos selecionados</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{requisitosTexto}</pre>
            </div>
          )}
        </div>

        {/* ── SECTION 4: Benefícios ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Benefícios</p>
          <p className="text-xs text-gray-400">
            {benPadraoLoaded ? "Estes são os benefícios do seu cadastro. Clique para marcar/desmarcar." : "Selecione os benefícios que serão oferecidos"}
          </p>

          <ChipGroup label="Transporte" chips={BEN_TRANSPORTE} selected={benChips} onToggle={toggleBen} />
          <ChipGroup label="Alimentação" chips={BEN_ALIMENTACAO} selected={benChips} onToggle={toggleBen} />
          <ChipGroup label="Saúde" chips={BEN_SAUDE} selected={benChips} onToggle={toggleBen} />
          <ChipGroup label="Qualidade de Vida" chips={BEN_QUALIDADE} selected={benChips} onToggle={toggleBen} />

          {benCustom.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {benCustom.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: "#16a34a", color: "#fff" }}>
                  {c}
                  <button type="button" onClick={() => setBenCustom((p) => p.filter((x) => x !== c))} className="opacity-70 hover:opacity-100">×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input value={benInput} onChange={(e) => setBenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBenCustom())}
              placeholder="Adicionar benefício personalizado..." style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={addBenCustom} className="shrink-0 text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-black hover:text-black transition-colors font-medium">Adicionar</button>
          </div>

          {beneficiosTexto && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Benefícios selecionados</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{beneficiosTexto}</pre>
            </div>
          )}
        </div>

        {/* ── SECTION 5: Observações ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <label style={labelStyle}>Observações (opcional)</label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Informações adicionais, detalhes específicos da vaga..."
            rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* ── Submit ── */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 rounded-xl font-bold text-base transition-all disabled:opacity-60"
          style={{ backgroundColor: "#000", color: "#FFD700" }}
        >
          {submitting ? "Enviando..." : "Enviar Solicitação →"}
        </button>
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  chips,
  selected,
  onToggle,
  cursos,
  onCursoChange,
  comCurso,
}: {
  label: string;
  chips: string[];
  selected: Record<string, boolean>;
  onToggle: (chip: string) => void;
  cursos?: Record<string, string>;
  onCursoChange?: (chip: string, value: string) => void;
  comCurso?: Set<string>;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const ativo = !!selected[chip];
          return (
            <div key={chip} className="flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => onToggle(chip)}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                style={ativo ? CHIP_ON : CHIP_OFF}>
                {chip}
              </button>
              {ativo && comCurso?.has(chip) && onCursoChange && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">em</span>
                  <input
                    value={cursos?.[chip] ?? ""}
                    onChange={(e) => onCursoChange(chip, e.target.value)}
                    placeholder="ex: Administração"
                    style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 140, outline: "none" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
