"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ANALISTAS, TIPOS_SERVICO, HABILIDADES, ESTADOS } from "@/lib/constants";
import type { Vaga } from "@/types";

interface ClienteOpcao {
  id: string;
  nome: string;
}

interface Props {
  isOpen: boolean;
  vaga?: Vaga | null;
  onClose: () => void;
  onSalvo: (vaga: Vaga) => void;
}

// ── chip data ─────────────────────────────────────────────────────────────────

const BENEFICIOS_OPCOES = [
  "Vale Transporte", "Vale Refeição", "Vale Alimentação", "Convênio Médico",
  "Convênio Odontológico", "Convênio Farmácia", "Seguro de Vida", "Fretado",
  "Auxílio Combustível", "Cesta Básica", "Gympass", "Day Off", "PLR",
  "Estacionamento", "Cesta de Natal", "Totalpass",
];

const HORARIO_TIPOS = [
  "Segunda a Sexta",
  "Escala 6x1",
  "Escala 12x36",
  "Disponibilidade para turnos",
  "Disponibilidade para fins de semana",
];

const REQUISITOS_EDUCACAO = [
  "Ensino Fundamental Completo",
  "Ensino Médio Completo",
  "Ensino Técnico Completo",
  "Graduação Completa",
  "Cursando Superior",
];

const REQUISITOS_COM_TEXTO = new Set([
  "Ensino Técnico Completo",
  "Graduação Completa",
  "Cursando Superior",
]);

const REQUISITOS_OUTROS_CHIPS = [
  "Experiência na função", "Experiência com trabalhos braçais",
  "CNH B", "CNH D", "CNH E",
  "NR11", "NR10", "NR11 atualizada",
  "Disponibilidade para hora extra", "Disponibilidade para viagens",
  "Veículo próprio",
  "Informática básica", "Pacote Office",
  "Inglês básico", "Inglês intermediário", "Inglês fluente",
  "Espanhol",
  "Excel intermediário", "Excel avançado",
];

// ── helpers ───────────────────────────────────────────────────────────────────

const CHIP_ON:  React.CSSProperties = { backgroundColor: "#000000", color: "#ffffff", border: "2px solid #000000" };
const CHIP_OFF: React.CSSProperties = { backgroundColor: "#ffffff", color: "#374151", border: "2px solid #D1D5DB" };

const CORES_TIPO: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#ffffff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000000" },
  terceirizacao:         { bg: "#1D9E75", color: "#ffffff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#ffffff" },
};

const FORM_VAZIO = {
  titulo: "", cliente_id: "", tipo_servico: "", num_posicoes: "",
  prazo: "", cidade: "", estado: "",
  salario: "", observacoes: "", responsavel: "",
  fee_rs_percentual: "", fee_rs_prazo_cobranca: "",
};

function parseBeneficios(raw: string): { chips: string[]; custom: string[] } {
  if (!raw) return { chips: [], custom: [] };
  const parts = raw.split(" * ").map((s) => s.trim());
  const chips: string[] = [];
  const custom: string[] = [];
  parts.forEach((p) => {
    if (BENEFICIOS_OPCOES.includes(p)) chips.push(p);
    else custom.push(p);
  });
  return { chips, custom };
}

function parseRequisitos(raw: string): { chips: string[]; texto: Record<string, string>; custom: string[] } {
  if (!raw) return { chips: [], texto: {}, custom: [] };
  const allChips = [...REQUISITOS_EDUCACAO, ...REQUISITOS_OUTROS_CHIPS];
  const parts = raw.split(" * ").map((s) => s.trim());
  const chips: string[] = [];
  const texto: Record<string, string> = {};
  const custom: string[] = [];
  parts.forEach((p) => {
    const emMatch = p.match(/^(.+?) em (.+)$/);
    if (emMatch && REQUISITOS_COM_TEXTO.has(emMatch[1])) {
      chips.push(emMatch[1]);
      texto[emMatch[1]] = emMatch[2];
    } else if (allChips.includes(p)) {
      chips.push(p);
    } else {
      custom.push(p);
    }
  });
  return { chips, texto, custom };
}

function maskHora(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}h${digits.slice(2)}`;
}

function formatSalarioBR(value: string): string {
  if (!value.trim()) return value;
  const cleaned = value.replace(/\s/g, "").replace(/^R\$/, "").trim();
  if (/[a-zA-ZÀ-ú]/.test(cleaned)) return value;
  const digits = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(digits);
  if (isNaN(num)) return value;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ModalNovaVaga({ isOpen, vaga, onClose, onSalvo }: Props) {
  const router = useRouter();
  const editando = !!vaga;

  const [form, setForm]           = useState(FORM_VAZIO);
  const [habilidades, setHabilidades] = useState<string[]>([]);
  const [clientes, setClientes]   = useState<ClienteOpcao[]>([]);
  const [salvando, setSalvando]   = useState(false);
  const [erro, setErro]           = useState("");

  // benefícios
  const [benChips, setBenChips]     = useState<string[]>([]);
  const [benCustom, setBenCustom]   = useState<string[]>([]);
  const [benInput, setBenInput]     = useState("");

  // horário
  const [horTipo, setHorTipo]     = useState("");
  const [horInicio, setHorInicio] = useState("");
  const [horFim, setHorFim]       = useState("");
  const [horOutros, setHorOutros] = useState("");

  // requisitos
  const [reqChips, setReqChips]   = useState<string[]>([]);
  const [reqTexto, setReqTexto]   = useState<Record<string, string>>({});
  const [reqCustom, setReqCustom] = useState<string[]>([]);
  const [reqInput, setReqInput]   = useState("");

  useEffect(() => {
    if (!isOpen) return;

    if (vaga) {
      setForm({
        titulo:       vaga.titulo,
        cliente_id:   vaga.cliente_id ?? "",
        tipo_servico: vaga.tipo_servico,
        num_posicoes: String(vaga.num_posicoes),
        prazo:        vaga.prazo ?? "",

        cidade:       vaga.cidade ?? "",
        estado:       vaga.estado ?? "",
        salario:      formatSalarioBR(vaga.salario ?? ""),
        observacoes:  vaga.observacoes ?? "",
        responsavel:  vaga.responsavel,
        fee_rs_percentual: vaga.fee_rs_percentual != null ? String(vaga.fee_rs_percentual) : "",
        fee_rs_prazo_cobranca: vaga.fee_rs_prazo_cobranca ?? "",
      });
      setHabilidades(vaga.habilidades_desejadas ?? []);

      const ben = parseBeneficios(vaga.beneficios ?? "");
      setBenChips(ben.chips);
      setBenCustom(ben.custom);
      setBenInput("");

      setHorTipo("");
      setHorInicio("");
      setHorFim("");
      setHorOutros(vaga.horario ?? "");

      const req = parseRequisitos(vaga.requisitos ?? "");
      setReqChips(req.chips);
      setReqTexto(req.texto);
      setReqCustom(req.custom);
      setReqInput("");
    } else {
      setForm(FORM_VAZIO);
      setHabilidades([]);
      setBenChips([]); setBenCustom([]); setBenInput("");
      setHorTipo(""); setHorInicio(""); setHorFim(""); setHorOutros("");
      setReqChips([]); setReqTexto({}); setReqCustom([]); setReqInput("");
    }
    setErro("");
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((j) => setClientes(j.data ?? []));
  }, [isOpen, vaga]);

  if (!isOpen) return null;

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleHabilidade = (h: string) =>
    setHabilidades((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);

  const toggleBen = (chip: string) =>
    setBenChips((prev) => prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]);

  const toggleReq = (chip: string) => {
    setReqChips((prev) => {
      if (prev.includes(chip)) {
        setReqTexto((t) => { const copy = { ...t }; delete copy[chip]; return copy; });
        return prev.filter((x) => x !== chip);
      }
      return [...prev, chip];
    });
  };

  // assembled field values
  const assembleBeneficios = (): string | null => {
    const parts = [...benChips, ...benCustom].filter(Boolean);
    return parts.length ? parts.join(" * ") : null;
  };

  const adicionarBenCustom = () => {
    const val = benInput.trim();
    if (!val || benCustom.includes(val)) return;
    setBenCustom((prev) => [...prev, val]);
    setBenInput("");
  };

  const assembleHorario = (): string | null => {
    if (horOutros.trim()) return horOutros.trim();
    if (!horTipo) return null;
    const suffix = horInicio || horFim ? ` das ${horInicio} às ${horFim}` : "";
    return horTipo + suffix;
  };

  const assembleRequisitos = (): string | null => {
    const parts = [
      ...reqChips.map((c) => {
        const txt = reqTexto[c]?.trim();
        return txt ? `${c} em ${txt}` : c;
      }),
      ...reqCustom,
    ].filter(Boolean);
    return parts.length ? parts.join(" * ") : null;
  };

  const adicionarReqCustom = () => {
    const val = reqInput.trim();
    if (!val || reqCustom.includes(val)) return;
    setReqCustom((prev) => [...prev, val]);
    setReqInput("");
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const url    = editando ? `/api/vagas/${vaga!.id}` : "/api/vagas";
      const method = editando ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          status:                editando ? undefined : "aberta",
          cliente_id:            form.cliente_id || null,
          num_posicoes:          Number(form.num_posicoes),
          habilidades_desejadas: habilidades,
          beneficios:            assembleBeneficios(),
          horario:               assembleHorario(),
          requisitos:            assembleRequisitos(),
          fee_rs_percentual:     form.fee_rs_percentual,
          fee_rs_prazo_cobranca: form.fee_rs_prazo_cobranca,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao salvar."); return; }
      onSalvo(json.data);
      router.refresh();
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg">{editando ? "Editar vaga" : "Nova vaga"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Título da vaga *
            </label>
            <input
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex: Analista de RH Pleno"
              className="input-field"
            />
          </div>

          {/* Cliente + Responsável */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Cliente vinculado
              </label>
              <select value={form.cliente_id} onChange={(e) => set("cliente_id", e.target.value)} className="input-field">
                <option value="">Banco de Talentos</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Responsável *
              </label>
              <select value={form.responsavel} onChange={(e) => set("responsavel", e.target.value)} className="input-field">
                <option value="">Selecione...</option>
                {ANALISTAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Tipo de serviço */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tipo de serviço *</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_SERVICO.map((tipo) => {
                const ativo = form.tipo_servico === tipo.id;
                const cores = CORES_TIPO[tipo.id];
                const btnStyle: React.CSSProperties = ativo
                  ? { backgroundColor: cores.bg, color: cores.color, border: `2px solid ${cores.bg}` }
                  : { backgroundColor: "#FFFFFF", color: "#374151", border: "2px solid #D1D5DB" };
                const checkColor = ativo ? cores.color : "#9CA3AF";
                return (
                  <button key={tipo.id} type="button" onClick={() => set("tipo_servico", tipo.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all"
                    style={btnStyle}>
                    <span className="flex items-center justify-center shrink-0 rounded-full"
                      style={{ width: 16, height: 16, border: `2px solid ${checkColor}`, color: checkColor }}>
                      {ativo && <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: checkColor, display: "block" }} />}
                    </span>
                    <span style={{ lineHeight: 1.3 }}>{tipo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Posições + Prazo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nº de posições *</label>
              <input type="number" min="1" value={form.num_posicoes} onChange={(e) => set("num_posicoes", e.target.value)} placeholder="1" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prazo</label>
              <input type="date" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} className="input-field" />
            </div>
          </div>

          {/* Cidade + Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cidade</label>
              <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Ex: São Paulo" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Estado</label>
              <select value={form.estado} onChange={(e) => set("estado", e.target.value)} className="input-field">
                <option value="">Selecione...</option>
                {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Salário */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Salário</label>
            <input
              value={form.salario}
              onChange={(e) => set("salario", e.target.value)}
              onBlur={() => set("salario", formatSalarioBR(form.salario))}
              placeholder="Ex: R$ 2.500,00 ou À combinar ou Enviar Pretensão Salarial"
              className="input-field"
            />
          </div>

          {/* Fee R&S (only for recrutamento_selecao) */}
          {form.tipo_servico === "recrutamento_selecao" && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fee Salmazos (R&S)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Fee Salmazos (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.fee_rs_percentual}
                    onChange={(e) => set("fee_rs_percentual", e.target.value)}
                    placeholder="Ex: 100"
                    className="input-field"
                  />
                  <p className="text-gray-400 text-xs mt-1">Percentual sobre o primeiro salário do candidato</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Prazo de Cobrança
                  </label>
                  <input
                    value={form.fee_rs_prazo_cobranca}
                    onChange={(e) => set("fee_rs_prazo_cobranca", e.target.value)}
                    placeholder="Ex: 30 dias após início do candidato"
                    className="input-field"
                  />
                  <p className="text-gray-400 text-xs mt-1">Prazo acordado com o cliente para pagamento do fee</p>
                </div>
              </div>
            </div>
          )}

          {/* ── HORÁRIO ─────────────────────────────────────────────────────── */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Horário de trabalho</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {HORARIO_TIPOS.map((t) => (
                <button key={t} type="button" onClick={() => setHorTipo((prev) => prev === t ? "" : t)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                  style={horTipo === t ? CHIP_ON : CHIP_OFF}>
                  {t}
                </button>
              ))}
            </div>
            {horTipo && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-500 shrink-0">Das</span>
                <input
                  value={horInicio}
                  onChange={(e) => setHorInicio(maskHora(e.target.value))}
                  placeholder="08h00"
                  maxLength={5}
                  className="input-field w-24"
                />
                <span className="text-sm text-gray-500 shrink-0">às</span>
                <input
                  value={horFim}
                  onChange={(e) => setHorFim(maskHora(e.target.value))}
                  placeholder="17h30"
                  maxLength={5}
                  className="input-field w-24"
                />
              </div>
            )}
            <input
              value={horOutros}
              onChange={(e) => setHorOutros(e.target.value)}
              placeholder="Outros (ex: Plantão noturno, horário a combinar...)"
              className="input-field text-sm"
            />
          </div>

          {/* ── REQUISITOS ──────────────────────────────────────────────────── */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Requisitos</p>

            {/* Escolaridade */}
            <p className="text-xs text-gray-400 mb-2">Escolaridade</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {REQUISITOS_EDUCACAO.map((chip) => {
                const ativo = reqChips.includes(chip);
                return (
                  <div key={chip} className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={() => toggleReq(chip)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                      style={ativo ? CHIP_ON : CHIP_OFF}>
                      {chip}
                    </button>
                    {ativo && REQUISITOS_COM_TEXTO.has(chip) && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">em</span>
                        <input
                          value={reqTexto[chip] ?? ""}
                          onChange={(e) => setReqTexto((t) => ({ ...t, [chip]: e.target.value }))}
                          placeholder="ex: Administração"
                          className="input-field text-xs h-7 py-1 w-36"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Outros requisitos */}
            <p className="text-xs text-gray-400 mb-2">Outros requisitos</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {REQUISITOS_OUTROS_CHIPS.map((chip) => {
                const ativo = reqChips.includes(chip);
                return (
                  <button key={chip} type="button" onClick={() => toggleReq(chip)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                    style={ativo ? CHIP_ON : CHIP_OFF}>
                    {chip}
                  </button>
                );
              })}
            </div>

            {/* Custom chips already added */}
            {reqCustom.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {reqCustom.map((chip) => (
                  <span
                    key={chip}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ backgroundColor: "#000000", color: "#ffffff" }}
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={() => setReqCustom((prev) => prev.filter((c) => c !== chip))}
                      className="opacity-60 hover:opacity-100 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add custom requisito */}
            <p className="text-xs text-gray-400 mb-2">Adicionar requisito</p>
            <div className="flex gap-2">
              <input
                value={reqInput}
                onChange={(e) => setReqInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarReqCustom())}
                placeholder="Ex: CRQ ativo, MOPP, NR35..."
                className="input-field text-sm flex-1"
              />
              <button
                type="button"
                onClick={adicionarReqCustom}
                className="btn-outline text-sm shrink-0"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* ── BENEFÍCIOS ──────────────────────────────────────────────────── */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Benefícios</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {BENEFICIOS_OPCOES.map((chip) => {
                const ativo = benChips.includes(chip);
                return (
                  <button key={chip} type="button" onClick={() => toggleBen(chip)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                    style={ativo ? CHIP_ON : CHIP_OFF}>
                    {chip}
                  </button>
                );
              })}
            </div>
            {/* Custom chips already added */}
            {benCustom.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {benCustom.map((chip) => (
                  <span
                    key={chip}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ backgroundColor: "#000000", color: "#ffffff" }}
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={() => setBenCustom((prev) => prev.filter((c) => c !== chip))}
                      className="opacity-60 hover:opacity-100 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add custom benefício */}
            <p className="text-xs text-gray-400 mb-2">Adicionar benefício</p>
            <div className="flex gap-2">
              <input
                value={benInput}
                onChange={(e) => setBenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarBenCustom())}
                placeholder="Ex: Auxílio creche, Psicologia Viva, Conexa Saúde..."
                className="input-field text-sm flex-1"
              />
              <button
                type="button"
                onClick={adicionarBenCustom}
                className="btn-outline text-sm shrink-0"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* Habilidades desejadas */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Habilidades desejadas</p>
            <div className="flex flex-wrap gap-2">
              {HABILIDADES.map((h) => {
                const ativo = habilidades.includes(h);
                return (
                  <button key={h} type="button" onClick={() => toggleHabilidade(h)}
                    className="text-xs px-3 py-1.5 rounded-full border transition-all font-medium"
                    style={ativo
                      ? { backgroundColor: "#000000", color: "#FFD700", borderColor: "#000000" }
                      : { backgroundColor: "#FFFFFF", color: "#374151", borderColor: "#D1D5DB" }}>
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Observações internas */}
          <div className="border-t pt-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Observações internas
            </label>
            <textarea
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              placeholder="Anotações internas sobre a vaga..."
              rows={2}
              className="input-field resize-none"
            />
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={onClose} className="btn-outline" disabled={salvando}>Cancelar</button>
            <button onClick={handleSalvar} disabled={salvando} className="btn-primary disabled:opacity-50">
              {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar vaga"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
