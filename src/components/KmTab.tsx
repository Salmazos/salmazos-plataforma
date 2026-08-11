"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import CampoMoeda from "@/components/ui/CampoMoeda";
import CampoTelefone from "@/components/ui/CampoTelefone";

// ── Constants ────────────────────────────────────────────────────────────────

const TIPOS_DESLOCAMENTO = [
  { id: "visita", label: "Visita (Comercial / Técnica / Supervisão)", color: "#3B82F6", bg: "#DBEAFE" },
  { id: "treinamento", label: "Treinamento", color: "#8B5CF6", bg: "#EDE9FE" },
  { id: "diretoria", label: "Diretoria", color: "#F59E0B", bg: "#FEF3C7" },
  { id: "outros", label: "Outros", color: "#6B7280", bg: "#F3F4F6" },
] as const;

const TIPOS_CUSTO = ["Alimentação", "Pedágio", "Estacionamento", "Outro"] as const;

const MOTIVOS_VISITA = ["Comercial", "Supervisão", "Serviços", "Outros"] as const;

const TIPOS_VISITA = [
  { id: "comercial", label: "Comercial" },
  { id: "supervisao", label: "Supervisão de posto" },
] as const;

const CHECKLIST_EQUIPE = [
  { value: "sim", label: "Sim" },
  { value: "parcial", label: "Parcial" },
  { value: "nao", label: "Não" },
] as const;
const CHECKLIST_EPI = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
  { value: "na", label: "N/A" },
] as const;
const CHECKLIST_SIM_NAO = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
] as const;
const CHECKLIST_AMBIENTE = [
  { value: "ok", label: "OK" },
  { value: "atencao", label: "Atenção" },
] as const;
const CHECKLIST_FEEDBACK = [
  { value: "positivo", label: "Positivo" },
  { value: "neutro", label: "Neutro" },
  { value: "negativo", label: "Negativo" },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface KmConfig {
  id?: string;
  analista_id: string;
  tipo_servico: string;
  valor_por_km: number;
}

interface OutroCustoDB {
  tipo: string;
  descricao: string;
  valor: number;
  comprovante_url?: string;
}

interface KmRegistro {
  id: string;
  analista_id: string;
  data: string;
  km_inicial: number;
  km_final: number;
  km_rodados: number;
  destino: string | null;
  cliente_visitado: string | null;
  motivo: string | null;
  resultado: string | null;
  tipo_servico: string | null;
  valor_por_km: number | null;
  valor_total: number | null;
  outros_custos: OutroCustoDB[] | null;
  status: "rascunho" | "enviado" | "incompleto";
}

interface KmVisita {
  id: string;
  registro_id: string;
  empresa: string;
  contato: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  motivo: string | null;
  resultado: string | null;
  ordem: number;
  tipo_visita: "supervisao" | "comercial";
  cliente_id: string | null;
  checklist_equipe_completa: string | null;
  checklist_epi: string | null;
  checklist_uniforme: string | null;
  checklist_pontualidade: string | null;
  checklist_ambiente: string | null;
  checklist_feedback_cliente: string | null;
  problema_identificado: boolean;
  problema_descricao: string | null;
  plano_acao: string | null;
  evidencias_fotos: string[] | null;
}

interface ClienteAtivo {
  id: string;
  nome: string;
}

interface EmpresaSugestao {
  id: string;
  nome: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  ultima_visita_em: string | null;
  ultimo_visitante_nome: string | null;
}

interface HistoricoVisita {
  id: string;
  data: string | null;
  analista_nome: string | null;
  motivo: string | null;
  resultado: string | null;
}

interface VisitaLocal {
  empresa: string;
  contato: string;
  contato_telefone: string;
  contato_email: string;
  motivo: string;
  resultado: string;
  tipo_visita: "supervisao" | "comercial";
  cliente_id: string | null;
  checklist_equipe_completa: string;
  checklist_epi: string;
  checklist_uniforme: string;
  checklist_pontualidade: string;
  checklist_ambiente: string;
  checklist_feedback_cliente: string;
  problema_identificado: boolean;
  problema_descricao: string;
  plano_acao: string;
  evidenciasExistentes: string[];
}

function novaVisitaLocal(): VisitaLocal {
  return {
    empresa: "", contato: "", contato_telefone: "", contato_email: "", motivo: "", resultado: "",
    tipo_visita: "comercial", cliente_id: null,
    checklist_equipe_completa: "", checklist_epi: "", checklist_uniforme: "",
    checklist_pontualidade: "", checklist_ambiente: "", checklist_feedback_cliente: "",
    problema_identificado: false, problema_descricao: "", plano_acao: "", evidenciasExistentes: [],
  };
}

interface OutroCustoLocal {
  tipo: string;
  descricao: string;
  valor: string;
  file: File | null;
}

interface Props {
  analistaId: string;
  isGestor: boolean;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1px solid #D1D5DB",
  borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", boxSizing: "border-box",
};
const thStyle: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, color: "#FFB800", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6", whiteSpace: "nowrap", textAlign: "left",
};
const sectionHeader: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#9CA3AF",
  textTransform: "uppercase", letterSpacing: "0.05em", margin: "20px 0 12px",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string): string {
  return d.split("-").reverse().join("/");
}

function getTipoConfig(tipo: string | null) {
  return TIPOS_DESLOCAMENTO.find((t) => t.id === tipo) ?? { id: tipo ?? "", label: tipo ?? "—", color: "#6B7280", bg: "#F3F4F6" };
}

function outrosCustosSum(custos: OutroCustoDB[] | null): number {
  if (!custos) return 0;
  return custos.reduce((s, c) => s + c.valor, 0);
}

// Bucket 'supervisao-fotos' é privado — evidencias_fotos guarda só o path no storage, nunca
// URL pública. Abrir a foto sempre passa por uma signed URL gerada sob demanda (mesmo
// padrão do bucket 'curriculos' / BotaoCurriculo.tsx).
function LinkFotoSupervisao({ path, label }: { path: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const abrir = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supervisao/foto-signed-url?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (res.ok && json.url) window.open(json.url, "_blank", "noopener,noreferrer");
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={abrir}
      disabled={loading}
      style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#3B82F6", fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
    >
      {loading ? "Abrindo..." : label}
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KmTab({ analistaId, isGestor }: Props) {
  // Data state
  const [configs, setConfigs] = useState<KmConfig[]>([]);
  const [registros, setRegistros] = useState<KmRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Config state
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ data: "", tipo_servico: "visita", km_inicial: "", km_final: "" });
  const [visitas, setVisitas] = useState<VisitaLocal[]>([]);
  const [outrosCustos, setOutrosCustos] = useState<OutroCustoLocal[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Table state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [rowVisitas, setRowVisitas] = useState<Record<string, KmVisita[]>>({});
  const [loadingVisitas, setLoadingVisitas] = useState<string | null>(null);

  // Autocomplete state (per-visita index)
  const [sugestoes, setSugestoes] = useState<Record<number, EmpresaSugestao[]>>({});
  const [sugestaoAberta, setSugestaoAberta] = useState<number | null>(null);
  const autocompleteTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Record<number, EmpresaSugestao>>({});
  const [visitaHistorico, setVisitaHistorico] = useState<Record<number, HistoricoVisita[]>>({});

  // Supervisão de posto (per-visita)
  const [clientesAtivos, setClientesAtivos] = useState<ClienteAtivo[]>([]);
  const [clienteBusca, setClienteBusca] = useState<Record<number, string>>({});
  const [clienteDropdownAberto, setClienteDropdownAberto] = useState<number | null>(null);
  const [fotosNovas, setFotosNovas] = useState<Record<number, File[]>>({});

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // ── Load data ──

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, regRes] = await Promise.all([
        fetch("/api/km/config?global=true"),
        fetch(`/api/km/registros?analista_id=${analistaId}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
      ]);
      const cfgJson = await cfgRes.json();
      const regJson = await regRes.json();
      const cfgs: KmConfig[] = cfgJson.data ?? [];
      setConfigs(cfgs);
      setRegistros(regJson.data ?? []);
      const vals: Record<string, string> = {};
      cfgs.forEach((c) => { vals[c.tipo_servico] = c.valor_por_km.toString(); });
      setConfigValues(vals);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [analistaId, from, to]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), toast.length > 60 ? 8000 : 3000); return () => clearTimeout(t); } }, [toast]);

  useEffect(() => {
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((json) => {
        const lista: { id: string; nome: string; ativo: boolean }[] = json.data ?? [];
        setClientesAtivos(lista.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })));
      })
      .catch(() => { /* ignore */ });
  }, []);

  // ── Config ──

  const saveConfig = async (tipo: string) => {
    const valor = configValues[tipo];
    if (!valor?.trim()) return;
    setSavingConfig(true);
    try {
      const res = await fetch("/api/km/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analista_id: analistaId, tipo_servico: tipo, valor_por_km: parseFloat(valor), is_global: true }),
      });
      if (res.ok) { setToast("Configuração salva!"); loadData(); }
    } catch { /* ignore */ } finally { setSavingConfig(false); }
  };

  const getValorPorKm = (tipo: string): number => configs.find((c) => c.tipo_servico === tipo)?.valor_por_km ?? 0;

  // ── Modal computed ──

  const kmRodados = formData.km_inicial && formData.km_final
    ? Math.max(0, Number(formData.km_final) - Number(formData.km_inicial))
    : 0;
  const valorKm = getValorPorKm(formData.tipo_servico);
  const reembolsoKm = kmRodados * valorKm;
  const custosTotal = outrosCustos.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
  const totalModal = reembolsoKm + custosTotal;

  // ── Modal handlers ──

  const openNewModal = () => {
    setEditingId(null);
    setFormData({ data: new Date().toISOString().split("T")[0], tipo_servico: "visita", km_inicial: "", km_final: "" });
    setSugestoes({});
    setSugestaoAberta(null);
    setDropdownPos(null);
    setEmpresaSelecionada({});
    setVisitaHistorico({});
    setClienteBusca({});
    setClienteDropdownAberto(null);
    setFotosNovas({});
    setVisitas([novaVisitaLocal()]);
    setOutrosCustos([]);
    setModalOpen(true);
  };

  const openEditModal = async (r: KmRegistro) => {
    setEditingId(r.id);
    setFormData({
      data: r.data,
      tipo_servico: r.tipo_servico ?? "visita",
      km_inicial: r.km_inicial.toString(),
      km_final: r.km_final.toString(),
    });
    setOutrosCustos(
      r.outros_custos
        ? r.outros_custos.map((c) => ({ tipo: c.tipo, descricao: c.descricao, valor: c.valor.toString(), file: null }))
        : []
    );
    try {
      const res = await fetch(`/api/km/visitas?registro_id=${r.id}`);
      const json = await res.json();
      const loaded: KmVisita[] = json.data ?? [];
      setSugestoes({});
      setSugestaoAberta(null);
      setDropdownPos(null);
      setEmpresaSelecionada({});
      setVisitaHistorico({});
      setClienteBusca({});
      setClienteDropdownAberto(null);
      setFotosNovas({});
      setVisitas(
        loaded.length > 0
          ? loaded.map((v) => ({
              empresa: v.empresa, contato: v.contato ?? "", contato_telefone: v.contato_telefone ?? "", contato_email: v.contato_email ?? "", motivo: v.motivo ?? "", resultado: v.resultado ?? "",
              tipo_visita: v.tipo_visita ?? "comercial", cliente_id: v.cliente_id ?? null,
              checklist_equipe_completa: v.checklist_equipe_completa ?? "", checklist_epi: v.checklist_epi ?? "",
              checklist_uniforme: v.checklist_uniforme ?? "", checklist_pontualidade: v.checklist_pontualidade ?? "",
              checklist_ambiente: v.checklist_ambiente ?? "", checklist_feedback_cliente: v.checklist_feedback_cliente ?? "",
              problema_identificado: v.problema_identificado ?? false, problema_descricao: v.problema_descricao ?? "", plano_acao: v.plano_acao ?? "",
              evidenciasExistentes: v.evidencias_fotos ?? [],
            }))
          : [novaVisitaLocal()]
      );
    } catch {
      setSugestoes({}); setSugestaoAberta(null); setDropdownPos(null); setEmpresaSelecionada({}); setVisitaHistorico({});
      setClienteBusca({}); setClienteDropdownAberto(null); setFotosNovas({});
      setVisitas([novaVisitaLocal()]);
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.data || !formData.km_inicial || !formData.km_final) {
      setToast("Preencha data, KM inicial e KM final."); return;
    }
    if (Number(formData.km_final) < Number(formData.km_inicial)) {
      setToast("KM final deve ser maior que KM inicial."); return;
    }
    const validVisitas = visitas
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => v.tipo_visita === "supervisao" ? !!(v.cliente_id && v.empresa.trim()) : v.empresa.trim());
    if (validVisitas.length === 0) {
      setToast("Adicione pelo menos 1 visita com empresa preenchida."); return;
    }
    const visitaSemDescricao = validVisitas.find(({ v }) => v.tipo_visita === "supervisao" && v.problema_identificado && !v.problema_descricao.trim());
    if (visitaSemDescricao) {
      setToast(`Descreva o problema reportado em "${visitaSemDescricao.v.empresa}".`); return;
    }
    const visitaSemPlano = validVisitas.find(({ v }) => v.tipo_visita === "supervisao" && v.problema_identificado && !v.plano_acao.trim());
    if (visitaSemPlano) {
      setToast(`Informe o plano de ação para o problema identificado em "${visitaSemPlano.v.empresa}".`); return;
    }
    setSubmitting(true);
    try {
      const custoEntries = outrosCustos
        .filter((c) => c.valor && parseFloat(c.valor) > 0)
        .map((c) => ({ tipo: c.tipo, descricao: c.descricao, valor: parseFloat(c.valor), file: c.file, comprovante_url: undefined as string | undefined }));

      const custosPayload = custoEntries.map(({ tipo, descricao, valor }) => ({ tipo, descricao, valor }));

      const url = editingId ? `/api/km/registros/${editingId}` : "/api/km/registros";
      const method = editingId ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        ...(!editingId ? { analista_id: analistaId } : {}),
        data: formData.data,
        tipo_servico: formData.tipo_servico,
        km_inicial: Number(formData.km_inicial),
        km_final: Number(formData.km_final),
        valor_por_km: valorKm,
        outros_custos: custosPayload.length > 0 ? custosPayload : null,
      };

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const json = await res.json(); setToast(json.error ?? "Erro ao salvar."); return; }
      const { data: registro } = await res.json();
      const registroId = registro.id;

      // Upload comprovantes
      const filesExist = custoEntries.some((e) => e.file);
      if (filesExist) {
        const supabase = createClient();
        for (const entry of custoEntries) {
          if (!entry.file) continue;
          const path = `${analistaId}/${registroId}/${Date.now()}_${entry.file.name}`;
          await supabase.storage.from("km-comprovantes").upload(path, entry.file);
          const { data: urlData } = supabase.storage.from("km-comprovantes").getPublicUrl(path);
          entry.comprovante_url = urlData.publicUrl;
        }
        const updatedCustos = custoEntries.map(({ tipo, descricao, valor, comprovante_url }) => ({
          tipo, descricao, valor, ...(comprovante_url ? { comprovante_url } : {}),
        }));
        await fetch(`/api/km/registros/${registroId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outros_custos: updatedCustos }),
        });
      }

      // Save visitas
      if (editingId) {
        await fetch(`/api/km/visitas?registro_id=${registroId}`, { method: "DELETE" });
      }
      const supabaseStorage = createClient();
      const visitaResults = await Promise.all(
        validVisitas.map(async ({ v, idx: origIdx }, ordemIdx) => {
          // Bucket 'supervisao-fotos' é privado — guarda só o path no storage (nunca URL
          // pública), mesmo padrão do bucket 'curriculos'. Exibição sempre via signed URL
          // gerada sob demanda (ver /api/supervisao/foto-signed-url).
          const evidenciasFotos = [...v.evidenciasExistentes];
          const novosArquivos = fotosNovas[origIdx] ?? [];
          for (const file of novosArquivos) {
            const path = `${analistaId}/${registroId}/${origIdx}_${Date.now()}_${file.name}`;
            const { error: upErr } = await supabaseStorage.storage.from("supervisao-fotos").upload(path, file);
            if (!upErr) evidenciasFotos.push(path);
          }
          const vRes = await fetch("/api/km/visitas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              registro_id: registroId,
              empresa: v.empresa,
              contato: v.contato || null,
              contato_telefone: v.contato_telefone || null,
              contato_email: v.contato_email || null,
              motivo: v.motivo || null,
              resultado: v.resultado || null,
              ordem: ordemIdx + 1,
              tipo_visita: v.tipo_visita,
              cliente_id: v.tipo_visita === "supervisao" ? v.cliente_id : null,
              checklist_equipe_completa: v.tipo_visita === "supervisao" ? (v.checklist_equipe_completa || null) : null,
              checklist_epi: v.tipo_visita === "supervisao" ? (v.checklist_epi || null) : null,
              checklist_uniforme: v.tipo_visita === "supervisao" ? (v.checklist_uniforme || null) : null,
              checklist_pontualidade: v.tipo_visita === "supervisao" ? (v.checklist_pontualidade || null) : null,
              checklist_ambiente: v.tipo_visita === "supervisao" ? (v.checklist_ambiente || null) : null,
              checklist_feedback_cliente: v.tipo_visita === "supervisao" ? (v.checklist_feedback_cliente || null) : null,
              problema_identificado: v.tipo_visita === "supervisao" ? v.problema_identificado : false,
              problema_descricao: v.tipo_visita === "supervisao" && v.problema_identificado ? v.problema_descricao : null,
              plano_acao: v.tipo_visita === "supervisao" && v.problema_identificado ? v.plano_acao : null,
              evidencias_fotos: v.tipo_visita === "supervisao" ? evidenciasFotos : [],
            }),
          });
          if (vRes.ok) return { empresa: v.empresa, ok: true as const };
          const vJson = await vRes.json().catch(() => ({}));
          return { empresa: v.empresa, ok: false as const, error: vJson.error ?? `Erro ${vRes.status}` };
        })
      );
      const falhas = visitaResults.filter((r) => !r.ok) as { empresa: string; ok: false; error: string }[];

      // Rebaixa o registro pra 'incompleto' quando 1+ visita falha — sem isso ele ficava
      // 'enviado' (pronto pra reembolso) mesmo com a visita perdida. Também promove de volta
      // pra 'enviado' se uma edição corrige tudo (falhas.length === 0 mas o registro já
      // estava 'incompleto' de uma tentativa anterior).
      await fetch(`/api/km/registros/${registroId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: falhas.length > 0 ? "incompleto" : "enviado" }),
      });

      if (falhas.length > 0) {
        setToast(
          `Registro salvo como INCOMPLETO — ${falhas.length} visita(s) NÃO foram salvas: ${falhas.map((f) => `${f.empresa} (${f.error})`).join("; ")}. Edite o registro pra tentar novamente; ele não entra nos totais de reembolso até isso ser corrigido.`
        );
      } else {
        setToast(editingId ? "Registro atualizado!" : "Registro criado!");
      }
      setModalOpen(false);
      setRowVisitas({});
      loadData();
    } catch {
      setToast("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro de KM?")) return;
    try {
      await fetch(`/api/km/visitas?registro_id=${id}`, { method: "DELETE" });
      const res = await fetch(`/api/km/registros/${id}`, { method: "DELETE" });
      if (res.ok) { setToast("Registro excluído!"); loadData(); }
    } catch { /* ignore */ }
  };

  const toggleExpand = async (registroId: string) => {
    if (expandedRow === registroId) { setExpandedRow(null); return; }
    setExpandedRow(registroId);
    if (!rowVisitas[registroId]) {
      setLoadingVisitas(registroId);
      try {
        const res = await fetch(`/api/km/visitas?registro_id=${registroId}`);
        const json = await res.json();
        setRowVisitas((prev) => ({ ...prev, [registroId]: json.data ?? [] }));
      } catch { /* ignore */ } finally {
        setLoadingVisitas(null);
      }
    }
  };

  // ── Visitas / Custos helpers ──

  const addVisita = () => setVisitas((prev) => [...prev, novaVisitaLocal()]);
  const removeVisita = (idx: number) => {
    setVisitas((prev) => prev.filter((_, i) => i !== idx));
    setSugestoes((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    if (sugestaoAberta === idx) { setSugestaoAberta(null); setDropdownPos(null); }
    setEmpresaSelecionada((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    setVisitaHistorico((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    setClienteBusca((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    if (clienteDropdownAberto === idx) setClienteDropdownAberto(null);
    setFotosNovas((prev) => { const n = { ...prev }; delete n[idx]; return n; });
  };
  const updateVisita = (idx: number, field: keyof VisitaLocal, value: string | boolean) =>
    setVisitas((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));

  const selecionarClienteSupervisao = (idx: number, c: ClienteAtivo) => {
    setVisitas((prev) => prev.map((v, i) => i === idx ? { ...v, cliente_id: c.id, empresa: c.nome } : v));
    setClienteDropdownAberto(null);
    setClienteBusca((prev) => ({ ...prev, [idx]: "" }));
  };

  const trocarTipoVisita = (idx: number, tipo: "supervisao" | "comercial") => {
    setVisitas((prev) => prev.map((v, i) => i === idx ? {
      ...v,
      tipo_visita: tipo,
      empresa: "",
      cliente_id: null,
    } : v));
    setClienteBusca((prev) => ({ ...prev, [idx]: "" }));
    setClienteDropdownAberto(null);
  };

  const handleEmpresaChange = (idx: number, value: string) => {
    updateVisita(idx, "empresa", value);
    setEmpresaSelecionada((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    setVisitaHistorico((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    if (autocompleteTimers.current[idx]) clearTimeout(autocompleteTimers.current[idx]);
    if (value.length < 2) {
      setSugestoes((prev) => ({ ...prev, [idx]: [] }));
      setSugestaoAberta(null);
      setDropdownPos(null);
      return;
    }
    autocompleteTimers.current[idx] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/km/empresas-visitadas?q=${encodeURIComponent(value)}&limit=6`);
        const json = await res.json();
        const results: EmpresaSugestao[] = json.data ?? [];
        setSugestoes((prev) => ({ ...prev, [idx]: results }));
        if (results.length > 0) {
          const el = inputRefs.current[idx];
          if (el) {
            const rect = el.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
          }
          setSugestaoAberta(idx);
        } else {
          setSugestaoAberta(null);
          setDropdownPos(null);
        }
      } catch { /* ignore */ }
    }, 300);
  };

  const selecionarSugestao = async (idx: number, s: EmpresaSugestao) => {
    setVisitas((prev) => prev.map((v, i) => i === idx ? {
      ...v,
      empresa: s.nome,
      contato: s.contato_nome ?? v.contato,
      contato_telefone: s.contato_telefone ?? v.contato_telefone,
      contato_email: s.contato_email ?? v.contato_email,
    } : v));
    setSugestaoAberta(null);
    setSugestoes((prev) => ({ ...prev, [idx]: [] }));
    setDropdownPos(null);
    setEmpresaSelecionada((prev) => ({ ...prev, [idx]: s }));
    try {
      const res = await fetch(`/api/km/empresas-visitadas?empresa_id=${s.id}`);
      const json = await res.json();
      setVisitaHistorico((prev) => ({ ...prev, [idx]: (json.data ?? []).slice(0, 3) }));
    } catch { /* ignore */ }
  };

  const addCusto = () => setOutrosCustos((prev) => [...prev, { tipo: "Alimentação", descricao: "", valor: "", file: null }]);
  const removeCusto = (idx: number) => setOutrosCustos((prev) => prev.filter((_, i) => i !== idx));
  const updateCusto = (idx: number, field: keyof OutroCustoLocal, value: string | File | null) =>
    setOutrosCustos((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));

  // ── Totals ──

  // Total KM continua somando tudo (o carro rodou de qualquer forma) — só os totais
  // monetários de reembolso excluem 'incompleto' (visita perdida, não pronto pra pagar).
  const totalKm = registros.reduce((s, r) => s + r.km_rodados, 0);
  const registrosCompletos = registros.filter((r) => r.status !== "incompleto");
  const totalReembolso = registrosCompletos.reduce((s, r) => s + (r.valor_total ?? 0), 0);
  const totalOutrosCustos = registrosCompletos.reduce((s, r) => s + outrosCustosSum(r.outros_custos), 0);
  const totalGeral = totalReembolso + totalOutrosCustos;

  if (loading) return <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando dados de quilometragem...</p>;

  return (
    <div>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, maxWidth: 420, background: toast.includes("NÃO foram salvas") ? "#DC2626" : "#059669", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      {/* ── Config Section ── */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Valor por KM
        </p>
        {!isGestor ? (
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 12px" }}>Valores definidos pela diretoria</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600 }}>
            {TIPOS_DESLOCAMENTO.map((tipo) => (
              <div key={tipo.id}>
                <label style={labelStyle}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: tipo.color, marginRight: 6 }} />
                  {tipo.label} (R$/km)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <CampoMoeda
                    style={inputStyle}
                    value={configValues[tipo.id] ?? ""}
                    onChange={(v) => setConfigValues((prev) => ({ ...prev, [tipo.id]: v > 0 ? String(v) : "" }))}
                    placeholder="0,00"
                  />
                  <button
                    onClick={() => saveConfig(tipo.id)}
                    disabled={savingConfig}
                    style={{ padding: "8px 14px", background: "#FFD700", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: savingConfig ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { title: "Total KM no Período", value: `${totalKm.toLocaleString("pt-BR")} km`, accent: "#FFD700" },
          { title: "Reembolso KM", value: formatCurrency(totalReembolso), accent: "#10B981" },
          { title: "Outros Custos no Período", value: formatCurrency(totalOutrosCustos), accent: "#3B82F6" },
          { title: "Total Geral a Reembolsar", value: formatCurrency(totalGeral), accent: "#FFD700" },
        ].map((card) => (
          <div key={card.title} style={{ background: "#F9FAFB", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{card.title}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>{card.value}</p>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: card.accent, borderRadius: "0 0 12px 12px" }} />
          </div>
        ))}
      </div>

      {/* ── Filter + Actions ── */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>De</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Até</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} style={{ background: "none", border: "none", color: "#FFB800", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "10px 0" }}>
            Limpar filtro
          </button>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={openNewModal} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: "#FFD700", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Novo Registro
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFAFA" }}>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Tipo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>KM Inicial</th>
              <th style={{ ...thStyle, textAlign: "right" }}>KM Final</th>
              <th style={{ ...thStyle, textAlign: "right" }}>KM Rodados</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Reembolso KM</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Outros Custos</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                  Nenhum registro de quilometragem encontrado.
                </td>
              </tr>
            ) : (
              registros.map((r) => {
                const tipoInfo = getTipoConfig(r.tipo_servico);
                const ocSum = outrosCustosSum(r.outros_custos);
                const rowTotal = (r.valor_total ?? 0) + ocSum;
                const isExpanded = expandedRow === r.id;

                return (
                  <RegistroRow
                    key={r.id}
                    r={r}
                    tipoInfo={tipoInfo}
                    ocSum={ocSum}
                    rowTotal={rowTotal}
                    isExpanded={isExpanded}
                    visitas={rowVisitas[r.id]}
                    loadingVisitas={loadingVisitas === r.id}
                    onToggle={() => toggleExpand(r.id)}
                    onEdit={() => openEditModal(r)}
                    onDelete={() => handleDelete(r.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <div
          // Não fecha ao clicar no backdrop — formulário de visita/checklist é longo e um
          // clique acidental fora da área perdia todo o preenchimento. Fechar só via botão
          // explícito (Cancelar / X). Padrão inline duplicado em cada modal do projeto, não
          // um componente compartilhado — essa mudança fica isolada neste modal.
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 680, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>
              {editingId ? "Editar Registro de KM" : "Novo Registro de KM"}
            </h2>

            {/* Section A: Deslocamento */}
            <p style={sectionHeader}>Deslocamento</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Data *</label>
                <input type="date" style={inputStyle} value={formData.data} onChange={(e) => setFormData((f) => ({ ...f, data: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Tipo de deslocamento *</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={formData.tipo_servico} onChange={(e) => setFormData((f) => ({ ...f, tipo_servico: e.target.value }))}>
                  {TIPOS_DESLOCAMENTO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>KM Inicial *</label>
                <input type="number" style={inputStyle} placeholder="Ex: 45230" value={formData.km_inicial} onChange={(e) => setFormData((f) => ({ ...f, km_inicial: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>KM Final *</label>
                <input type="number" style={inputStyle} placeholder="Ex: 45280" value={formData.km_final} onChange={(e) => setFormData((f) => ({ ...f, km_final: e.target.value }))} />
              </div>
            </div>
            {kmRodados > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#111827", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#FFD700", fontWeight: 700 }}>
                  {kmRodados.toLocaleString("pt-BR")} km rodados · {valorKm > 0 ? `${formatCurrency(valorKm)}/km` : "—"}
                </span>
                <span style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>→ {formatCurrency(reembolsoKm)} a reembolsar</span>
              </div>
            )}

            {/* Section B: Visitas do dia */}
            <p style={sectionHeader}>Visitas realizadas no dia</p>
            {visitas.map((v, idx) => {
              const hist = visitaHistorico[idx];
              return (
                <div key={idx} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 16, marginBottom: 12, position: "relative" }}>
                  {visitas.length > 1 && (
                    <button onClick={() => removeVisita(idx)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#DC2626" }}>
                      {"🗑"} Remover
                    </button>
                  )}

                  {/* Tipo de visita */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Tipo de visita</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {TIPOS_VISITA.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => trocarTipoVisita(idx, t.id)}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                            border: v.tipo_visita === t.id ? "1px solid #FFD700" : "1px solid #D1D5DB",
                            background: v.tipo_visita === t.id ? "#FFF8DC" : "#fff",
                            color: v.tipo_visita === t.id ? "#92400E" : "#374151",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {/* Empresa: texto livre (comercial) ou combobox de clientes ativos (supervisão) */}
                    <div>
                      <label style={labelStyle}>{v.tipo_visita === "supervisao" ? "Cliente *" : "Empresa visitada *"}</label>
                      {v.tipo_visita === "supervisao" ? (
                        v.cliente_id ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", background: "#fff" }}>
                            <span style={{ fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.empresa}</span>
                            <button
                              type="button"
                              onClick={() => setVisitas((prev) => prev.map((vv, i) => i === idx ? { ...vv, cliente_id: null, empresa: "" } : vv))}
                              title="Trocar cliente"
                              style={{ border: "none", background: "none", color: "#9CA3AF", fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 0, flexShrink: 0 }}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div style={{ position: "relative" }}>
                            <input
                              style={inputStyle}
                              placeholder="Buscar cliente..."
                              value={clienteBusca[idx] ?? ""}
                              onChange={(e) => { setClienteBusca((prev) => ({ ...prev, [idx]: e.target.value })); setClienteDropdownAberto(idx); }}
                              onFocus={() => setClienteDropdownAberto(idx)}
                              onBlur={() => setTimeout(() => setClienteDropdownAberto((cur) => (cur === idx ? null : cur)), 150)}
                              autoComplete="off"
                            />
                            {clienteDropdownAberto === idx && (() => {
                              const termo = (clienteBusca[idx] ?? "").trim().toLowerCase();
                              const filtrados = termo
                                ? clientesAtivos.filter((c) => c.nome.toLowerCase().includes(termo))
                                : clientesAtivos;
                              return (
                                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, maxHeight: 180, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8, marginTop: 4, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
                                  {filtrados.length === 0 ? (
                                    <div style={{ padding: "8px 12px", fontSize: 13, color: "#9CA3AF" }}>Nenhum cliente encontrado</div>
                                  ) : (
                                    filtrados.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onMouseDown={() => selecionarClienteSupervisao(idx, c)}
                                        style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #F3F4F6", fontSize: 13, color: "#111827" }}
                                      >
                                        {c.nome}
                                      </button>
                                    ))
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )
                      ) : (
                        <input
                          ref={(el) => { inputRefs.current[idx] = el; }}
                          style={inputStyle}
                          placeholder="Nome da empresa"
                          value={v.empresa}
                          onChange={(e) => handleEmpresaChange(idx, e.target.value)}
                          onFocus={() => {
                            if ((sugestoes[idx] ?? []).length > 0) {
                              const el = inputRefs.current[idx];
                              if (el) {
                                const rect = el.getBoundingClientRect();
                                setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
                              }
                              setSugestaoAberta(idx);
                            }
                          }}
                          onBlur={() => setTimeout(() => { setSugestaoAberta(null); setDropdownPos(null); }, 150)}
                          autoComplete="off"
                        />
                      )}
                    </div>

                    {/* Contato nome */}
                    <div>
                      <label style={labelStyle}>Nome do contato</label>
                      <input style={inputStyle} placeholder="Nome do contato" value={v.contato} onChange={(e) => updateVisita(idx, "contato", e.target.value)} />
                    </div>

                    {/* Telefone + E-mail */}
                    <div>
                      <label style={labelStyle}>Telefone do contato</label>
                      <CampoTelefone style={inputStyle} placeholder="(00) 00000-0000" value={v.contato_telefone} onChange={(valor) => updateVisita(idx, "contato_telefone", valor)} />
                    </div>
                    <div>
                      <label style={labelStyle}>E-mail do contato</label>
                      <input style={inputStyle} type="email" placeholder="contato@empresa.com" value={v.contato_email} onChange={(e) => updateVisita(idx, "contato_email", e.target.value)} />
                    </div>

                    {/* Motivo + Resumo */}
                    <div>
                      <label style={labelStyle}>Motivo da visita</label>
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={v.motivo}
                        onChange={(e) => updateVisita(idx, "motivo", e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {v.motivo && !(MOTIVOS_VISITA as readonly string[]).includes(v.motivo) && (
                          <option value={v.motivo}>{`(valor antigo) ${v.motivo}`}</option>
                        )}
                        {MOTIVOS_VISITA.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    {v.tipo_visita !== "supervisao" && (
                      <div>
                        <label style={labelStyle}>Resumo da visita</label>
                        <textarea
                          style={{ ...inputStyle, resize: "none", minHeight: 38 }}
                          placeholder="Resumo da visita..."
                          value={v.resultado}
                          onChange={(e) => updateVisita(idx, "resultado", e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Checklist de supervisão */}
                  {v.tipo_visita === "supervisao" && (
                    <div style={{ marginTop: 14, padding: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                        Checklist de supervisão
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={labelStyle}>Equipe completa</label>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={v.checklist_equipe_completa} onChange={(e) => updateVisita(idx, "checklist_equipe_completa", e.target.value)}>
                            <option value="">—</option>
                            {CHECKLIST_EQUIPE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Uso de EPI</label>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={v.checklist_epi} onChange={(e) => updateVisita(idx, "checklist_epi", e.target.value)}>
                            <option value="">—</option>
                            {CHECKLIST_EPI.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Uniforme</label>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={v.checklist_uniforme} onChange={(e) => updateVisita(idx, "checklist_uniforme", e.target.value)}>
                            <option value="">—</option>
                            {CHECKLIST_SIM_NAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Pontualidade</label>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={v.checklist_pontualidade} onChange={(e) => updateVisita(idx, "checklist_pontualidade", e.target.value)}>
                            <option value="">—</option>
                            {CHECKLIST_SIM_NAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Ambiente</label>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={v.checklist_ambiente} onChange={(e) => updateVisita(idx, "checklist_ambiente", e.target.value)}>
                            <option value="">—</option>
                            {CHECKLIST_AMBIENTE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Feedback do cliente</label>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={v.checklist_feedback_cliente} onChange={(e) => updateVisita(idx, "checklist_feedback_cliente", e.target.value)}>
                            <option value="">—</option>
                            {CHECKLIST_FEEDBACK.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={v.problema_identificado}
                            onChange={(e) => updateVisita(idx, "problema_identificado", e.target.checked)}
                          />
                          Problemas Reportados?
                        </label>
                        {v.problema_identificado && (
                          <div style={{ marginTop: 8 }}>
                            <label style={labelStyle}>Qual o problema? *</label>
                            <textarea
                              style={{ ...inputStyle, resize: "none", minHeight: 60 }}
                              placeholder="Descreva o que foi observado/reportado..."
                              value={v.problema_descricao}
                              onChange={(e) => updateVisita(idx, "problema_descricao", e.target.value)}
                            />
                          </div>
                        )}
                        {v.problema_identificado && (
                          <div style={{ marginTop: 8 }}>
                            <label style={labelStyle}>Plano de ação *</label>
                            <textarea
                              style={{ ...inputStyle, resize: "none", minHeight: 60 }}
                              placeholder="Descreva o plano de ação para resolver o problema..."
                              value={v.plano_acao}
                              onChange={(e) => updateVisita(idx, "plano_acao", e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <label style={labelStyle}>Resumo da visita</label>
                        <textarea
                          style={{ ...inputStyle, resize: "none", minHeight: 38 }}
                          placeholder="Resumo da visita..."
                          value={v.resultado}
                          onChange={(e) => updateVisita(idx, "resultado", e.target.value)}
                        />
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <label style={labelStyle}>Fotos (evidências, opcional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ fontSize: 12, color: "#6B7280" }}
                          onChange={(e) => setFotosNovas((prev) => ({ ...prev, [idx]: Array.from(e.target.files ?? []) }))}
                        />
                        {v.evidenciasExistentes.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {v.evidenciasExistentes.map((path, fi) => (
                              <LinkFotoSupervisao key={fi} path={path} label={`Foto ${fi + 1}`} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Inline history — only shown after selecting from autocomplete */}
                  {empresaSelecionada[idx] && hist && hist.length > 0 && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                        Últimas visitas registradas
                      </p>
                      {hist.map((h, hi) => (
                        <div key={hi} style={{ display: "flex", gap: 12, fontSize: 12, color: "#374151", padding: "4px 0", borderTop: hi > 0 ? "1px solid #E2E8F0" : "none" }}>
                          <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: "#1E293B", minWidth: 70 }}>
                            {h.data ? new Date(h.data).toLocaleDateString("pt-BR") : "—"}
                          </span>
                          <span style={{ color: "#64748B", whiteSpace: "nowrap", flex: "0 0 auto" }}>{h.analista_nome ?? "—"}</span>
                          {h.motivo && <span style={{ color: "#94A3B8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.motivo}</span>}
                          {h.resultado && <span style={{ color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>→ {h.resultado}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={addVisita} style={{ background: "none", border: "1px dashed #D1D5DB", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", width: "100%" }}>
              + Adicionar visita
            </button>

            {/* Section C: Outros custos */}
            <p style={sectionHeader}>Outros custos</p>
            {outrosCustos.map((c, idx) => (
              <div key={idx} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 16, marginBottom: 12, position: "relative" }}>
                <button onClick={() => removeCusto(idx)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#DC2626" }}>
                  {"🗑"} Remover
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Tipo</label>
                    <select style={{ ...inputStyle, cursor: "pointer" }} value={c.tipo} onChange={(e) => updateCusto(idx, "tipo", e.target.value)}>
                      {TIPOS_CUSTO.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Descrição</label>
                    <input style={inputStyle} placeholder="Opcional" value={c.descricao} onChange={(e) => updateCusto(idx, "descricao", e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Valor (R$)</label>
                    <CampoMoeda style={inputStyle} placeholder="0,00" value={c.valor} onChange={(v) => updateCusto(idx, "valor", v > 0 ? String(v) : "")} />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Anexar comprovante</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    style={{ fontSize: 12, color: "#6B7280" }}
                    onChange={(e) => updateCusto(idx, "file", e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            ))}
            <button onClick={addCusto} style={{ background: "none", border: "1px dashed #D1D5DB", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", width: "100%" }}>
              + Adicionar custo
            </button>
            {outrosCustos.length > 0 && (
              <p style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 8 }}>
                Total outros custos: {formatCurrency(custosTotal)}
              </p>
            )}

            {/* Section D: Summary */}
            <div style={{ marginTop: 20, padding: "16px 18px", background: "#111827", borderRadius: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>KM rodados</span>
                <span style={{ fontSize: 12, color: "#fff", textAlign: "right", fontWeight: 600 }}>{kmRodados.toLocaleString("pt-BR")}</span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>Reembolso KM</span>
                <span style={{ fontSize: 12, color: "#10B981", textAlign: "right", fontWeight: 600 }}>{formatCurrency(reembolsoKm)}</span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>Outros custos</span>
                <span style={{ fontSize: 12, color: "#3B82F6", textAlign: "right", fontWeight: 600 }}>{formatCurrency(custosTotal)}</span>
              </div>
              <div style={{ borderTop: "1px solid #374151", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, color: "#FFD700", fontWeight: 700 }}>TOTAL A REEMBOLSAR</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#FFD700" }}>{formatCurrency(totalModal)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.5 : 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: submitting ? "#a38600" : "#FFD700", color: "#000", fontSize: 13, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}
              >
                {submitting ? "Salvando..." : editingId ? "Salvar Alterações" : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown portal — escapes modal overflowY:auto clipping by rendering at document.body */}
      {typeof document !== "undefined" && sugestaoAberta !== null && dropdownPos && (sugestoes[sugestaoAberta] ?? []).length > 0 && createPortal(
        <div style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", overflow: "hidden" }}>
          {(sugestoes[sugestaoAberta] ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => selecionarSugestao(sugestaoAberta!, s)}
              style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #F3F4F6" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F9FAFB"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", display: "block" }}>{s.nome}</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                Última visita: {s.ultima_visita_em ? new Date(s.ultima_visita_em).toLocaleDateString("pt-BR") : "—"}
                {s.ultimo_visitante_nome ? ` • por ${s.ultimo_visitante_nome}` : ""}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Table Row Component ──────────────────────────────────────────────────────

function RegistroRow({
  r,
  tipoInfo,
  ocSum,
  rowTotal,
  isExpanded,
  visitas,
  loadingVisitas,
  onToggle,
  onEdit,
  onDelete,
}: {
  r: KmRegistro;
  tipoInfo: { label: string; color: string; bg: string };
  ocSum: number;
  rowTotal: number;
  isExpanded: boolean;
  visitas: KmVisita[] | undefined;
  loadingVisitas: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151" };

  return (
    <>
      <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #F3F4F6", cursor: "pointer", background: r.status === "incompleto" ? "#FFFBEB" : undefined }} onClick={onToggle}>
        <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>
          <span style={{ marginRight: 6, fontSize: 10, color: "#9CA3AF" }}>{isExpanded ? "▼" : "▶"}</span>
          {formatDate(r.data)}
        </td>
        <td style={tdStyle}>
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: tipoInfo.bg, color: tipoInfo.color }}>
            {tipoInfo.label}
          </span>
          {r.status === "incompleto" && (
            <span style={{ display: "inline-block", marginLeft: 6, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#FEE2E2", color: "#991B1B" }}>
              Incompleto
            </span>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: "right" }}>{r.km_inicial.toLocaleString("pt-BR")}</td>
        <td style={{ ...tdStyle, textAlign: "right" }}>{r.km_final.toLocaleString("pt-BR")}</td>
        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#111827" }}>{r.km_rodados.toLocaleString("pt-BR")}</td>
        <td style={{ ...tdStyle, textAlign: "right" }}>{r.valor_total != null ? formatCurrency(r.valor_total) : "—"}</td>
        <td style={{ ...tdStyle, textAlign: "right" }}>{ocSum > 0 ? formatCurrency(ocSum) : "—"}</td>
        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#111827" }}>{formatCurrency(rowTotal)}</td>
        <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            <button onClick={onEdit} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
              Editar
            </button>
            <button onClick={onDelete} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", fontSize: 11, fontWeight: 600, color: "#DC2626", cursor: "pointer" }}>
              Excluir
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
          <td colSpan={9} style={{ padding: "12px 24px 16px", background: "#FAFAFA" }}>
            {r.status === "incompleto" && (
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 13, color: "#92400E" }}>
                ⚠ Pelo menos 1 visita não foi salva neste registro. Clique em <strong>Editar</strong> e reenvie — o registro não entra nos totais de reembolso até isso ser corrigido.
              </div>
            )}
            {loadingVisitas ? (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Carregando visitas...</p>
            ) : visitas && visitas.length > 0 ? (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                  Visitas ({visitas.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {visitas.map((v, idx) => (
                    <div key={v.id} style={{ display: "flex", gap: 16, fontSize: 13, padding: "6px 0", borderBottom: idx < visitas.length - 1 ? "1px solid #E5E7EB" : "none", alignItems: "center" }}>
                      {v.tipo_visita === "supervisao" && (
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#EDE9FE", color: "#6D28D9", whiteSpace: "nowrap" }}>
                          Supervisão
                        </span>
                      )}
                      {v.problema_identificado && (
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#FEE2E2", color: "#991B1B", whiteSpace: "nowrap" }}>
                          Problema identificado
                        </span>
                      )}
                      <span style={{ fontWeight: 600, color: "#111827", minWidth: 160 }}>{v.empresa}</span>
                      {v.contato && <span style={{ color: "#6B7280" }}>Contato: {v.contato}</span>}
                      {v.contato_telefone && <span style={{ color: "#6B7280" }}>{v.contato_telefone}</span>}
                      {v.contato_email && <span style={{ color: "#6B7280" }}>{v.contato_email}</span>}
                      {v.motivo && <span style={{ color: "#6B7280" }}>Motivo: {v.motivo}</span>}
                      {v.resultado && <span style={{ color: "#374151" }}>→ {v.resultado}</span>}
                      {v.evidencias_fotos && v.evidencias_fotos.length > 0 && (
                        <span style={{ display: "flex", gap: 8 }}>
                          {v.evidencias_fotos.map((path, fi) => (
                            <LinkFotoSupervisao key={fi} path={path} label={`Foto ${fi + 1}`} />
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {r.outros_custos && r.outros_custos.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                      Outros custos ({r.outros_custos.length})
                    </p>
                    {r.outros_custos.map((c, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 16, fontSize: 13, padding: "4px 0" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{c.tipo}</span>
                        {c.descricao && <span style={{ color: "#6B7280" }}>{c.descricao}</span>}
                        <span style={{ color: "#111827", fontWeight: 700, marginLeft: "auto" }}>{formatCurrency(c.valor)}</span>
                        {c.comprovante_url && (
                          <a href={c.comprovante_url} target="_blank" rel="noopener noreferrer" style={{ color: "#3B82F6", fontSize: 12, fontWeight: 600 }}>
                            Ver comprovante
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Nenhuma visita registrada.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
