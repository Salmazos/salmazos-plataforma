"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import CampoMoeda from "@/components/ui/CampoMoeda";

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

const REQ_ESCOLARIDADE = ["Ensino Fundamental", "Ensino Médio", "Ensino Técnico", "Ensino Superior"];
const REQ_COM_CURSO = new Set(["Ensino Técnico", "Ensino Superior"]);
const REQ_COM_CONDICAO_SIMPLES = new Set(["Ensino Fundamental", "Ensino Médio"]);
const REQ_EXPERIENCIA = ["Experiência na função", "Experiência em atendimento ao público", "Experiência em liderança/gestão", "Experiência em vendas"];
const REQ_CNH = ["CNH B", "CNH C", "CNH D", "CNH E"];
const REQ_NR = ["NR-6", "NR-10", "NR-11", "NR-12", "NR-35"];
const REQ_CONHECIMENTOS = ["Pacote Office", "Informática básica", "Excel avançado"];

const BEN_TRANSPORTE = ["Vale Transporte", "Fretado", "Auxílio Combustível", "Estacionamento"];
const BEN_ALIMENTACAO = ["Vale Alimentação", "Vale Refeição", "Refeição no Local", "Cesta Básica"];
const BEN_SAUDE = ["Convênio Médico", "Convênio Odontológico", "Convênio Farmácia", "Seguro de Vida"];
const BEN_QUALIDADE = ["Gympass / Totalpass", "Day Off", "PLR", "Bonificação Anual"];

type HorarioTipo = typeof HORARIO_TIPOS[number]["id"];

const TIPO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  recrutamento_selecao: { label: "R&S", bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria: { label: "MOT", bg: "#FFD700", color: "#000" },
  terceirizacao: { label: "Terceirização", bg: "#1D9E75", color: "#fff" },
};

interface VagaTemplate {
  id: string;
  nome: string;
  cargo: string;
  tipo_servico: string;
  cidade: string | null;
  estado: string | null;
  salario: string | null;
  horario_tipo: string | null;
  horario_texto: string | null;
  horario_padrao: { modelo?: string; entrada?: string; saida?: string; intervalo?: string; intervalo_inicio?: string; intervalo_fim?: string; diurno_noturno?: string; turno?: string } | null;
  requisitos: string | null;
  requisitos_chips: string[] | null;
  beneficios: string | null;
  beneficios_chips: Record<string, boolean> | null;
  observacoes: string | null;
  total_usos: number;
  ultimo_uso_em: string | null;
}

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
  const [view, setView] = useState<"loading" | "templates" | "form">("loading");
  const [templates, setTemplates] = useState<VagaTemplate[]>([]);
  const [usandoTemplate, setUsandoTemplate] = useState<VagaTemplate | null>(null);
  const [usarHorarioPadrao, setUsarHorarioPadrao] = useState(true);
  const [salvarComoTemplate, setSalvarComoTemplate] = useState(false);
  const [nomeTemplate, setNomeTemplate] = useState("");

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
  const [horIntervaloInicio, setHorIntervaloInicio] = useState("");
  const [horIntervaloFim, setHorIntervaloFim] = useState("");
  const [hor1236, setHor1236] = useState<"diurno" | "noturno">("diurno");
  const [horTurnoNome, setHorTurnoNome] = useState("");
  const [horCustom, setHorCustom] = useState("");
  const [horPadraoLoaded, setHorPadraoLoaded] = useState(false);

  const [reqChips, setReqChips] = useState<Record<string, boolean>>({});
  const [reqCursos, setReqCursos] = useState<Record<string, string>>({});
  const [reqCondicoes, setReqCondicoes] = useState<Record<string, string>>({});
  const [reqCustom, setReqCustom] = useState<string[]>([]);
  const [reqInput, setReqInput] = useState("");

  const [benChips, setBenChips] = useState<Record<string, boolean>>({});
  const [benCustom, setBenCustom] = useState<string[]>([]);
  const [benInput, setBenInput] = useState("");
  const [benPadraoLoaded, setBenPadraoLoaded] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const applyDefaults = (json: { beneficios_padrao?: Record<string, boolean>; horario_padrao?: Record<string, string> }) => {
    if (json.beneficios_padrao && typeof json.beneficios_padrao === "object") {
      setBenChips(json.beneficios_padrao);
      setBenPadraoLoaded(true);
    }
    if (json.horario_padrao && typeof json.horario_padrao === "object") {
      const hp = json.horario_padrao;
      if (hp.modelo) setHorarioTipo(hp.modelo as HorarioTipo);
      if (hp.entrada) setHorEntrada(hp.entrada);
      if (hp.saida) setHorSaida(hp.saida);
      if (hp.intervalo) setHorIntervalo(hp.intervalo);
      if (hp.intervalo_inicio) setHorIntervaloInicio(hp.intervalo_inicio);
      if (hp.intervalo_fim) setHorIntervaloFim(hp.intervalo_fim);
      if (hp.diurno_noturno) setHor1236(hp.diurno_noturno as "diurno" | "noturno");
      if (hp.turno) setHorTurnoNome(hp.turno);
      setHorPadraoLoaded(true);
    }
  };

  const applyTemplate = (tpl: VagaTemplate) => {
    setCargo(tpl.cargo);
    setTipoServico(tpl.tipo_servico);
    setCidade(tpl.cidade ?? "");
    setEstado(tpl.estado ?? "");
    setSalario(tpl.salario ?? "");
    setObservacoes(tpl.observacoes ?? "");
    if (tpl.horario_padrao) {
      const hp = tpl.horario_padrao;
      if (hp.modelo) setHorarioTipo(hp.modelo as HorarioTipo);
      if (hp.entrada) setHorEntrada(hp.entrada);
      if (hp.saida) setHorSaida(hp.saida);
      if (hp.intervalo) setHorIntervalo(hp.intervalo);
      if (hp.intervalo_inicio) setHorIntervaloInicio(hp.intervalo_inicio);
      if (hp.intervalo_fim) setHorIntervaloFim(hp.intervalo_fim);
      if (hp.diurno_noturno) setHor1236(hp.diurno_noturno as "diurno" | "noturno");
      if (hp.turno) setHorTurnoNome(hp.turno);
    } else if (tpl.horario_tipo) {
      setHorarioTipo(tpl.horario_tipo as HorarioTipo);
    }
    if (tpl.beneficios_chips) setBenChips(tpl.beneficios_chips);
    if (tpl.requisitos_chips) {
      const rc: Record<string, boolean> = {};
      const cursos: Record<string, string> = {};
      const conds: Record<string, string> = {};
      for (const chip of tpl.requisitos_chips) {
        const fullMatch = chip.match(/^(.+?) em (.+?) — (.+)$/);
        if (fullMatch) {
          rc[fullMatch[1]] = true;
          cursos[fullMatch[1]] = fullMatch[2];
          conds[fullMatch[1]] = fullMatch[3];
        } else {
          const condMatch = chip.match(/^(.+?) — (.+)$/);
          if (condMatch) {
            rc[condMatch[1]] = true;
            conds[condMatch[1]] = condMatch[2];
          } else {
            const emMatch = chip.match(/^(.+?) em (.+)$/);
            if (emMatch) {
              rc[emMatch[1]] = true;
              cursos[emMatch[1]] = emMatch[2];
            } else {
              rc[chip] = true;
            }
          }
        }
      }
      setReqChips(rc);
      setReqCursos((p) => ({ ...p, ...cursos }));
      setReqCondicoes((p) => ({ ...p, ...conds }));
    }
    setUsarHorarioPadrao(true);
    setUsandoTemplate(tpl);
    setNumPosicoes("1");
    setPrevisaoInicio("");
    setView("form");
    void fetch(`/api/portal/templates/${tpl.id}/usar`, { method: "POST" });
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/solicitar-vaga").then((r) => r.json()),
      fetch("/api/portal/templates").then((r) => r.json()),
    ]).then(([defaults, tplJson]) => {
      applyDefaults(defaults);
      const tpls = tplJson.data ?? [];
      setTemplates(tpls);
      setView(tpls.length > 0 ? "templates" : "form");
    }).catch(() => setView("form"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fmtTime = (t: string) => {
    if (!t) return "—";
    const [h, m] = t.split(":");
    return `${h}h${m}`;
  };

  const intervaloSufixo = (): string => {
    if (horIntervalo === "personalizado") {
      if (!horIntervaloInicio || !horIntervaloFim) return "";
      return `intervalo de ${fmtTime(horIntervaloInicio)} às ${fmtTime(horIntervaloFim)}`;
    }
    if (!horIntervalo) return "";
    if (horIntervalo === "sem intervalo") return "sem intervalo";
    return `intervalo de ${horIntervalo}`;
  };

  const gerarHorarioTexto = (): string => {
    if (!horarioTipo) return "";
    if (horarioTipo === "a_combinar") return "A combinar";
    if (horarioTipo === "personalizado") return horCustom.trim();
    const times = `${fmtTime(horEntrada)} às ${fmtTime(horSaida)}`;
    const intervalo = intervaloSufixo();
    const comIntervalo = (base: string) => intervalo ? `${base} (${intervalo})` : base;
    if (horarioTipo === "seg_sex") return comIntervalo(`Segunda a Sexta, ${times}`);
    if (horarioTipo === "6x1") return comIntervalo(`Escala 6x1, ${times}`);
    if (horarioTipo === "12x36") {
      const label = hor1236 === "diurno" ? "Turno Diurno" : "Turno Noturno";
      const base = horEntrada || horSaida ? `Escala 12x36 — ${label}, ${times}` : `Escala 12x36 — ${label}`;
      return comIntervalo(base);
    }
    if (horarioTipo === "turno_fixo") {
      const nome = horTurnoNome.trim() || "Turno Fixo";
      return comIntervalo(`${nome}, ${times}`);
    }
    return "";
  };

  const gerarRequisitosTexto = (): string => {
    const items: string[] = [];
    for (const chip of [...REQ_ESCOLARIDADE, ...REQ_EXPERIENCIA, ...REQ_CNH, ...REQ_NR, ...REQ_CONHECIMENTOS]) {
      if (reqChips[chip]) {
        const curso = reqCursos[chip]?.trim();
        const condicao = reqCondicoes[chip]?.trim();
        let text = chip;
        if (curso) text += ` em ${curso}`;
        if (condicao) text += ` — ${condicao}`;
        items.push(text);
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

  const horarioTexto = useMemo(gerarHorarioTexto, [horarioTipo, horEntrada, horSaida, horIntervalo, horIntervaloInicio, horIntervaloFim, hor1236, horTurnoNome, horCustom]);

  const montarHorarioPadrao = () => horarioTipo ? {
    modelo: horarioTipo,
    entrada: horEntrada || null,
    saida: horSaida || null,
    intervalo: horIntervalo || null,
    intervalo_inicio: horIntervalo === "personalizado" ? (horIntervaloInicio || null) : null,
    intervalo_fim: horIntervalo === "personalizado" ? (horIntervaloFim || null) : null,
    diurno_noturno: horarioTipo === "12x36" ? hor1236 : null,
    turno: horarioTipo === "turno_fixo" ? horTurnoNome || null : null,
    texto: horarioTexto,
  } : null;
  const requisitosTexto = useMemo(gerarRequisitosTexto, [reqChips, reqCursos, reqCondicoes, reqCustom]);
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
          const condicao = reqCondicoes[chip]?.trim();
          let text = chip;
          if (curso) text += ` em ${curso}`;
          if (condicao) text += ` — ${condicao}`;
          reqChipsList.push(text);
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
          horario_padrao: montarHorarioPadrao(),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao enviar."); return; }

      if (salvarComoTemplate && nomeTemplate.trim()) {
        const horPadrao = montarHorarioPadrao();
        void fetch("/api/portal/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: nomeTemplate.trim(),
            cargo: cargo.trim(),
            tipo_servico: tipoServico,
            cidade: cidade.trim() || null,
            estado: estado || null,
            salario: salario.trim() || null,
            horario_tipo: horarioTipo || null,
            horario_texto: horarioTexto || null,
            horario_padrao: horPadrao,
            requisitos: requisitosTexto || null,
            requisitos_chips: reqChipsList.length > 0 ? reqChipsList : null,
            beneficios: beneficiosTexto || null,
            beneficios_chips: gerarBeneficiosChips(),
            observacoes: observacoes.trim() || null,
          }),
        });
      }

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

  if (view === "loading") {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    );
  }

  if (view === "templates") {
    return (
      <div className="max-w-2xl mx-auto">
        <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Solicitar Nova Vaga</h1>
        <p className="text-xs text-gray-400 mb-6">Templates salvam tempo — use para vagas recorrentes</p>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Seus templates salvos</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {templates.map((tpl) => {
            const badge = TIPO_BADGE[tpl.tipo_servico] ?? { label: tpl.tipo_servico, bg: "#6B7280", color: "#fff" };
            return (
              <div key={tpl.id} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col">
                <p className="font-bold text-gray-900 text-base">{tpl.nome}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-sm text-gray-600">{tpl.cargo}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: badge.bg, color: badge.color }}>{badge.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {[tpl.cidade, tpl.estado].filter(Boolean).join("/") || "—"}
                  {tpl.salario && ` · ${tpl.salario}`}
                </p>
                <p className="text-[10px] text-gray-300 mt-2">
                  Usado {tpl.total_usos}x
                  {tpl.ultimo_uso_em && ` · Último: ${new Date(tpl.ultimo_uso_em).toLocaleDateString("pt-BR")}`}
                </p>
                <button
                  onClick={() => applyTemplate(tpl)}
                  className="mt-3 w-full py-2 rounded-lg text-sm font-bold"
                  style={{ backgroundColor: "#000", color: "#FFD700" }}
                >
                  Usar template
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setView("form")}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
          style={{ border: "2px solid #E5E7EB", backgroundColor: "#fff", color: "#374151" }}
        >
          + Criar nova solicitação do zero
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={templates.length > 0 ? "#" : "/portal"} onClick={(e) => { if (templates.length > 0) { e.preventDefault(); setView("templates"); setUsandoTemplate(null); } }} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {templates.length > 0 ? "Voltar aos templates" : "Voltar"}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Solicitar Nova Vaga</h1>
      {usandoTemplate && (
        <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
          {"📋"} Usando template: <strong>{usandoTemplate.nome}</strong> — ajuste o necessário abaixo.
        </p>
      )}

      <div className="space-y-6">

        {/* Quick-fill for template */}
        {usandoTemplate && (
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#FFFBEB", border: "2px solid #FCD34D" }}>
            <p className="text-sm font-bold text-amber-800">{"✏️"} Ajuste o necessário para esta solicitação:</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label style={labelStyle}>Nº de Posições *</label>
                <input type="number" min="1" value={numPosicoes} onChange={(e) => setNumPosicoes(e.target.value)} placeholder="1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Previsão de Início</label>
                <input type="date" value={previsaoInicio} onChange={(e) => setPrevisaoInicio(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Salário</label>
                <CampoMoeda value={salario} onChange={(v) => setSalario(v > 0 ? String(v) : "")} placeholder="Ex: 2.000,00" style={inputStyle} />
              </div>
            </div>
            {usandoTemplate.horario_texto && (
              <div>
                <label className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer">
                  <input type="checkbox" checked={usarHorarioPadrao} onChange={(e) => setUsarHorarioPadrao(e.target.checked)} className="rounded" />
                  Usar horário padrão: <strong>{usandoTemplate.horario_texto}</strong>
                </label>
              </div>
            )}
          </div>
        )}

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
              <CampoMoeda value={salario} onChange={(v) => setSalario(v > 0 ? String(v) : "")} placeholder="Ex: 2.000,00" style={inputStyle} />
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
        {!(usandoTemplate && usarHorarioPadrao) && <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Horário de Trabalho</p>

          {horPadraoLoaded && (
            <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              Horário baseado no seu cadastro. Ajuste se necessário.
            </p>
          )}

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
            <div className="flex items-start gap-3 flex-wrap">
              <div><label style={labelStyle}>Entrada</label><input type="time" value={horEntrada} onChange={(e) => setHorEntrada(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
              <div><label style={labelStyle}>Saída</label><input type="time" value={horSaida} onChange={(e) => setHorSaida(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
              <IntervaloField value={horIntervalo} onChange={setHorIntervalo} inicio={horIntervaloInicio} fim={horIntervaloFim} onInicioChange={setHorIntervaloInicio} onFimChange={setHorIntervaloFim} />
            </div>
          )}

          {horarioTipo === "6x1" && (
            <div className="flex items-start gap-3 flex-wrap">
              <div><label style={labelStyle}>Entrada</label><input type="time" value={horEntrada} onChange={(e) => setHorEntrada(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
              <div><label style={labelStyle}>Saída</label><input type="time" value={horSaida} onChange={(e) => setHorSaida(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
              <IntervaloField value={horIntervalo} onChange={setHorIntervalo} inicio={horIntervaloInicio} fim={horIntervaloFim} onInicioChange={setHorIntervaloInicio} onFimChange={setHorIntervaloFim} />
            </div>
          )}

          {horarioTipo === "12x36" && (
            <div className="space-y-3">
              <div className="flex gap-3">
                {(["diurno", "noturno"] as const).map((o) => (
                  <button key={o} type="button" onClick={() => setHor1236(o)}
                    className="text-sm px-4 py-2 rounded-lg font-medium transition-all"
                    style={hor1236 === o ? { background: "#000", color: "#FFD700", border: "2px solid #000" } : { background: "#fff", color: "#374151", border: "2px solid #E5E7EB" }}>
                    {o === "diurno" ? "☀️ Diurno" : "🌙 Noturno"}
                  </button>
                ))}
              </div>
              <div className="flex items-start gap-3 flex-wrap">
                <div><label style={labelStyle}>Entrada</label><input type="time" value={horEntrada} onChange={(e) => setHorEntrada(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
                <div><label style={labelStyle}>Saída</label><input type="time" value={horSaida} onChange={(e) => setHorSaida(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
                <IntervaloField value={horIntervalo} onChange={setHorIntervalo} inicio={horIntervaloInicio} fim={horIntervaloFim} onInicioChange={setHorIntervaloInicio} onFimChange={setHorIntervaloFim} />
              </div>
            </div>
          )}

          {horarioTipo === "turno_fixo" && (
            <div className="flex items-start gap-3 flex-wrap">
              <div><label style={labelStyle}>Nome do Turno</label><input value={horTurnoNome} onChange={(e) => setHorTurnoNome(e.target.value)} placeholder="Ex: Turno A, Turno B..." style={{ ...inputStyle, width: 160 }} /></div>
              <div><label style={labelStyle}>Entrada</label><input type="time" value={horEntrada} onChange={(e) => setHorEntrada(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
              <div><label style={labelStyle}>Saída</label><input type="time" value={horSaida} onChange={(e) => setHorSaida(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
              <IntervaloField value={horIntervalo} onChange={setHorIntervalo} inicio={horIntervaloInicio} fim={horIntervaloFim} onInicioChange={setHorIntervaloInicio} onFimChange={setHorIntervaloFim} />
            </div>
          )}

          {horarioTipo === "personalizado" && (
            <textarea value={horCustom} onChange={(e) => setHorCustom(e.target.value)} placeholder="Descreva o horário livremente..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          )}

          {horarioTexto && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Horário</p>
              <p className="text-sm text-gray-700 font-medium">{horarioTexto}</p>
            </div>
          )}
        </div>}

        {/* ── SECTION 3: Requisitos ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Requisitos</p>
          <p className="text-xs text-gray-400">Clique para adicionar requisitos</p>

          <ChipGroup label="Escolaridade" chips={REQ_ESCOLARIDADE} selected={reqChips} onToggle={toggleReq} cursos={reqCursos} onCursoChange={(k, v) => setReqCursos((p) => ({ ...p, [k]: v }))} condicoes={reqCondicoes} onCondicaoChange={(k, v) => setReqCondicoes((p) => ({ ...p, [k]: v }))} comCurso={REQ_COM_CURSO} comCondicaoSimples={REQ_COM_CONDICAO_SIMPLES} />
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

        {/* ── Save as template ── */}
        {!usandoTemplate && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={salvarComoTemplate} onChange={(e) => setSalvarComoTemplate(e.target.checked)} className="rounded" />
              Salvar como template para uso futuro
            </label>
            {salvarComoTemplate && (
              <div className="mt-3">
                <label style={labelStyle}>Nome do template *</label>
                <input value={nomeTemplate} onChange={(e) => setNomeTemplate(e.target.value)} placeholder="Ex: Operador de Produção — Unidade SP" style={inputStyle} />
              </div>
            )}
          </div>
        )}

        {/* ── Submit ── */}
        <button
          onClick={handleSubmit}
          disabled={submitting || (salvarComoTemplate && !nomeTemplate.trim())}
          className="w-full py-3.5 rounded-xl font-bold text-base transition-all disabled:opacity-60"
          style={{ backgroundColor: "#000", color: "#FFD700" }}
        >
          {submitting ? "Enviando..." : "Enviar Solicitação →"}
        </button>
      </div>
    </div>
  );
}

const CONDICOES_TECNICO = ["Completo", "Cursando", "Completo ou Cursando"];
const CONDICOES_SUPERIOR = ["Completo", "Cursando", "Completo ou Cursando", "A partir do 6º semestre", "A partir do 3º semestre"];
const CONDICOES_SIMPLES = ["Completo", "Cursando"];

function IntervaloField({
  value,
  onChange,
  inicio,
  fim,
  onInicioChange,
  onFimChange,
}: {
  value: string;
  onChange: (value: string) => void;
  inicio: string;
  fim: string;
  onInicioChange: (value: string) => void;
  onFimChange: (value: string) => void;
}) {
  return (
    <>
      <div>
        <label style={labelStyle}>Intervalo</label>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, width: 160, background: "#fff", cursor: "pointer" }}>
          <option value="">Selecione...</option>
          <option value="sem intervalo">Sem intervalo</option>
          <option value="15min">15 minutos</option>
          <option value="30min">30 minutos</option>
          <option value="45min">45 minutos</option>
          <option value="1h">1 hora</option>
          <option value="1h15">1h15</option>
          <option value="1h30">1h30</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </div>
      {value === "personalizado" && (
        <>
          <div><label style={labelStyle}>Intervalo de:</label><input type="time" value={inicio} onChange={(e) => onInicioChange(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
          <div><label style={labelStyle}>até:</label><input type="time" value={fim} onChange={(e) => onFimChange(e.target.value)} style={{ ...inputStyle, width: 130 }} /></div>
        </>
      )}
    </>
  );
}

function ChipGroup({
  label,
  chips,
  selected,
  onToggle,
  cursos,
  onCursoChange,
  condicoes,
  onCondicaoChange,
  comCurso,
  comCondicaoSimples,
}: {
  label: string;
  chips: string[];
  selected: Record<string, boolean>;
  onToggle: (chip: string) => void;
  cursos?: Record<string, string>;
  onCursoChange?: (chip: string, value: string) => void;
  condicoes?: Record<string, string>;
  onCondicaoChange?: (chip: string, value: string) => void;
  comCurso?: Set<string>;
  comCondicaoSimples?: Set<string>;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const ativo = !!selected[chip];
          const showCursoECondicao = ativo && comCurso?.has(chip);
          const showCondicaoSimples = ativo && comCondicaoSimples?.has(chip);
          const condicaoOpts = showCondicaoSimples ? CONDICOES_SIMPLES : chip === "Ensino Superior" ? CONDICOES_SUPERIOR : CONDICOES_TECNICO;
          return (
            <div key={chip} className="flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => onToggle(chip)}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                style={ativo ? CHIP_ON : CHIP_OFF}>
                {chip}
              </button>
              {showCursoECondicao && onCursoChange && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">em</span>
                  <input
                    value={cursos?.[chip] ?? ""}
                    onChange={(e) => onCursoChange(chip, e.target.value)}
                    placeholder="ex: Administração"
                    style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 130, outline: "none" }}
                  />
                </div>
              )}
              {(showCursoECondicao || showCondicaoSimples) && onCondicaoChange && (
                <select
                  value={condicoes?.[chip] ?? ""}
                  onChange={(e) => onCondicaoChange(chip, e.target.value)}
                  style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "3px 6px", fontSize: 12, outline: "none", color: condicoes?.[chip] ? "#111827" : "#9CA3AF", background: "#fff", cursor: "pointer" }}
                >
                  <option value="">Condição...</option>
                  {condicaoOpts.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
