"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import KmTab from "@/components/KmTab";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Perfil {
  id: string;
  user_id: string;
  email: string;
  nome_completo: string;
  cargo: string | null;
  departamento: string | null;
  nivel_acesso: string;
  data_admissao: string | null;
  telefone: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  contato_emergencia_nome: string | null;
  contato_emergencia_telefone: string | null;
  avatar_url: string | null;
  ativo: boolean;
  tipo_contrato: string | null;
  salario_base: number | null;
  beneficios: Record<string, unknown> | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chave_pix: string | null;
  ferias_proximo_periodo: string | null;
}

interface Props {
  perfil: Perfil | null;
  userEmail: string;
  userId: string;
}

interface Metricas {
  triados: number;
  vagas: number;
  contratados: number;
  taxa: number;
}

// ── Masks ─────────────────────────────────────────────────────────────────────

function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function NivelBadge({ nivel }: { nivel: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    superuser: { bg: "#111827", color: "#FFD700", label: "⚡ Super Admin" },
    diretoria: { bg: "#1E3A5F", color: "#93C5FD", label: "👔 Diretoria" },
    supervisor: { bg: "#7C2D12", color: "#FDBA74", label: "🎯 Supervisor" },
    analista: { bg: "#1E40AF", color: "#BFDBFE", label: "👤 Analista" },
  };
  const c = config[nivel] ?? config.analista;
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        display: "inline-block",
      }}
    >
      {c.label}
    </span>
  );
}

// ── Password Strength ─────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: "Fraca", color: "#EF4444", width: "25%" },
    { label: "Fraca", color: "#EF4444", width: "25%" },
    { label: "Média", color: "#F59E0B", width: "50%" },
    { label: "Boa", color: "#3B82F6", width: "75%" },
    { label: "Forte", color: "#10B981", width: "100%" },
  ];
  const l = levels[score];

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2 }}>
        <div style={{ height: "100%", width: l.width, background: l.color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color: l.color, fontWeight: 600 }}>{l.label}</span>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        background: type === "success" ? "#059669" : "#DC2626",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        animation: "fadeIn 0.3s",
      }}
    >
      {message}
    </div>
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 18px",
        borderRadius: "10px 10px 0 0",
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 13,
        transition: "all 0.15s",
        background: active ? "#fff" : "transparent",
        color: active ? "#111827" : "#9CA3AF",
        boxShadow: active ? "0 -2px 6px rgba(0,0,0,0.06)" : "none",
        borderBottom: active ? "2px solid #FFD700" : "2px solid transparent",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MeuPerfilClient({ perfil, userEmail, userId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(perfil?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Form state — Dados Pessoais ──
  const [form, setForm] = useState({
    nome_completo: perfil?.nome_completo ?? "",
    telefone: perfil?.telefone ?? "",
    cpf: perfil?.cpf ?? "",
    data_nascimento: perfil?.data_nascimento ?? "",
    cep: perfil?.cep ?? "",
    endereco: perfil?.endereco ?? "",
    cidade: perfil?.cidade ?? "",
    estado: perfil?.estado ?? "",
    contato_emergencia_nome: perfil?.contato_emergencia_nome ?? "",
    contato_emergencia_telefone: perfil?.contato_emergencia_telefone ?? "",
  });
  const [savingDados, setSavingDados] = useState(false);

  // ── Form state — Segurança ──
  const [senhaForm, setSenhaForm] = useState({ current: "", nova: "", confirmar: "" });
  const [savingSenha, setSavingSenha] = useState(false);

  // ── Métricas ──
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [metricaPeriodo, setMetricaPeriodo] = useState("tudo");
  const [loadingMetricas, setLoadingMetricas] = useState(false);

  const displayName = perfil?.nome_completo ?? userEmail;
  const cpfLocked = !!perfil?.cpf;

  // ── Avatar Upload ──
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setToast({ message: "Use JPG ou PNG.", type: "error" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast({ message: "Imagem muito grande. Máximo 2MB.", type: "error" });
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/meu-perfil/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, contentType: file.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAvatarUrl(json.avatar_url);
      setToast({ message: "Foto atualizada!", type: "success" });
      router.refresh();
    } catch (err) {
      setToast({ message: (err as Error).message, type: "error" });
    } finally {
      setUploading(false);
    }
  };

  // ── ViaCEP ──
  const buscarCep = async () => {
    const cepDigits = form.cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await res.json();
      if (data.erro) return;
      setForm((f) => ({
        ...f,
        endereco: data.logradouro || f.endereco,
        cidade: data.localidade || f.cidade,
        estado: data.uf || f.estado,
      }));
    } catch {
      // ignore
    }
  };

  // ── Salvar dados pessoais ──
  const salvarDados = async () => {
    if (!form.nome_completo.trim()) {
      setToast({ message: "Nome completo é obrigatório.", type: "error" });
      return;
    }
    setSavingDados(true);
    try {
      const payload: Record<string, string> = {
        nome_completo: form.nome_completo,
        telefone: form.telefone,
        data_nascimento: form.data_nascimento || "",
        cep: form.cep,
        endereco: form.endereco,
        cidade: form.cidade,
        estado: form.estado,
        contato_emergencia_nome: form.contato_emergencia_nome,
        contato_emergencia_telefone: form.contato_emergencia_telefone,
      };
      const res = await fetch("/api/meu-perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setToast({ message: "Dados salvos com sucesso!", type: "success" });
    } catch (err) {
      setToast({ message: (err as Error).message, type: "error" });
    } finally {
      setSavingDados(false);
    }
  };

  // ── Alterar senha ──
  const alterarSenha = async () => {
    if (!senhaForm.current || !senhaForm.nova) {
      setToast({ message: "Preencha todos os campos.", type: "error" });
      return;
    }
    if (senhaForm.nova.length < 8) {
      setToast({ message: "A nova senha deve ter pelo menos 8 caracteres.", type: "error" });
      return;
    }
    if (senhaForm.nova !== senhaForm.confirmar) {
      setToast({ message: "As senhas não conferem.", type: "error" });
      return;
    }
    setSavingSenha(true);
    try {
      const res = await fetch("/api/meu-perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: senhaForm.current, newPassword: senhaForm.nova }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSenhaForm({ current: "", nova: "", confirmar: "" });
      setToast({ message: "Senha alterada com sucesso!", type: "success" });
    } catch (err) {
      setToast({ message: (err as Error).message, type: "error" });
    } finally {
      setSavingSenha(false);
    }
  };

  const enviarResetSenha = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
    if (error) {
      setToast({ message: error.message, type: "error" });
    } else {
      setToast({ message: "Email de redefinição enviado!", type: "success" });
    }
  };

  // ── Métricas ──
  const carregarMetricas = useCallback(async () => {
    if (!perfil) return;
    setLoadingMetricas(true);
    try {
      const supabase = createClient();

      let fromDate: string | null = null;
      const now = new Date();
      if (metricaPeriodo === "mes") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (metricaPeriodo === "3meses") {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
      } else if (metricaPeriodo === "ano") {
        fromDate = new Date(now.getFullYear(), 0, 1).toISOString();
      }

      let query = supabase
        .from("candidatos")
        .select("id, etapa_kanban, responsavel, created_at")
        .eq("responsavel", perfil.nome_completo);

      if (fromDate) query = query.gte("created_at", fromDate);
      const { data: cands } = await query;
      const c = cands ?? [];

      let vagaQuery = supabase
        .from("candidatos_vagas")
        .select("vaga_id, candidato_id, etapa, created_at");
      if (fromDate) vagaQuery = vagaQuery.gte("created_at", fromDate);
      const { data: cv } = await vagaQuery;
      const candidatoIds = new Set(c.map((x) => x.id));
      const meusCV = (cv ?? []).filter((x) => candidatoIds.has(x.candidato_id));

      const vagasSet = new Set(meusCV.map((x) => x.vaga_id));
      const contratados = c.filter((x) => x.etapa_kanban === "contratado").length;
      const triados = c.length;

      setMetricas({
        triados,
        vagas: vagasSet.size,
        contratados,
        taxa: triados > 0 ? Math.round((contratados / triados) * 100) : 0,
      });
    } catch {
      // ignore
    } finally {
      setLoadingMetricas(false);
    }
  }, [perfil, metricaPeriodo]);

  useEffect(() => {
    if (tab === 2) carregarMetricas();
  }, [tab, carregarMetricas]);

  // ── Styles ──
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s",
    background: "#fff",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 4,
  };
  const btnPrimary: React.CSSProperties = {
    padding: "10px 24px",
    background: "#FFD700",
    color: "#000",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "opacity 0.15s",
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "#9CA3AF",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 12,
    marginTop: 24,
  };

  if (!perfil) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <p style={{ fontSize: 16, color: "#6B7280" }}>Perfil não encontrado. Contate o administrador.</p>
      </div>
    );
  }

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={handleAvatarUpload} />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Meu Perfil</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Gerencie seus dados pessoais e configurações</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        {/* ── LEFT CARD ── */}
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          {/* Avatar */}
          <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "3px solid #FFD700",
                }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: "#FFD700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 36,
                  fontWeight: 800,
                  color: "#000",
                  margin: "0 auto",
                }}
              >
                {initials}
              </div>
            )}
          </div>

          {/* Upload button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              display: "block",
              margin: "0 auto 20px",
              padding: "6px 16px",
              background: uploading ? "#E5E7EB" : "transparent",
              border: "1px solid #D1D5DB",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "#374151",
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="#9CA3AF" strokeWidth="3" fill="none" strokeDasharray="31" strokeLinecap="round" />
                </svg>
                Enviando...
              </span>
            ) : (
              "Alterar foto"
            )}
          </button>

          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>{displayName}</p>
          {perfil.cargo && <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 4px" }}>{perfil.cargo}</p>}
          {perfil.departamento && <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 12px" }}>{perfil.departamento}</p>}

          <div style={{ marginBottom: 16 }}>
            <NivelBadge nivel={perfil.nivel_acesso} />
          </div>

          {perfil.data_admissao && (
            <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 4px" }}>
              Admissão: {new Date(perfil.data_admissao + "T00:00:00").toLocaleDateString("pt-BR")}
            </p>
          )}
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0, wordBreak: "break-all" }}>{userEmail}</p>
        </div>

        {/* ── RIGHT TABS ── */}
        <div>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #E5E7EB" }}>
            <TabBtn
              active={tab === 0}
              label="Dados Pessoais"
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
              onClick={() => setTab(0)}
            />
            <TabBtn
              active={tab === 1}
              label="Segurança"
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
              onClick={() => setTab(1)}
            />
            <TabBtn
              active={tab === 2}
              label="Minhas Métricas"
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              onClick={() => setTab(2)}
            />
            <TabBtn
              active={tab === 3}
              label="Dados Contratuais"
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              onClick={() => setTab(3)}
            />
            <TabBtn
              active={tab === 4}
              label="Quilometragem"
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
              onClick={() => setTab(4)}
            />
          </div>

          {/* Tab content */}
          <div className="card" style={{ borderTopLeftRadius: 0, padding: 28, minHeight: 400 }}>
            {/* ── TAB 0: Dados Pessoais ── */}
            {tab === 0 && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Nome completo *</label>
                    <input
                      style={inputStyle}
                      value={form.nome_completo}
                      onChange={(e) => setForm((f) => ({ ...f, nome_completo: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Telefone</label>
                    <input
                      style={inputStyle}
                      value={form.telefone}
                      onChange={(e) => setForm((f) => ({ ...f, telefone: maskTelefone(e.target.value) }))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>CPF</label>
                    <input
                      style={{ ...inputStyle, background: cpfLocked ? "#F3F4F6" : "#fff" }}
                      value={form.cpf}
                      onChange={(e) => {
                        if (!cpfLocked) setForm((f) => ({ ...f, cpf: maskCpf(e.target.value) }));
                      }}
                      readOnly={cpfLocked}
                      placeholder="000.000.000-00"
                    />
                    {cpfLocked && <span style={{ fontSize: 11, color: "#9CA3AF" }}>Gerenciado pelo RH</span>}
                  </div>
                  <div>
                    <label style={labelStyle}>Data de nascimento</label>
                    <input
                      type="date"
                      style={inputStyle}
                      value={form.data_nascimento}
                      onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Endereço */}
                <p style={sectionTitle}>Endereço</p>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>CEP</label>
                    <input
                      style={inputStyle}
                      value={form.cep}
                      onChange={(e) => setForm((f) => ({ ...f, cep: maskCep(e.target.value) }))}
                      onBlur={buscarCep}
                      placeholder="00000-000"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Endereço</label>
                    <input
                      style={inputStyle}
                      value={form.endereco}
                      onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cidade</label>
                    <input
                      style={inputStyle}
                      value={form.cidade}
                      onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Estado</label>
                    <input
                      style={inputStyle}
                      value={form.estado}
                      onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Contato de Emergência */}
                <p style={sectionTitle}>Contato de Emergência</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Nome</label>
                    <input
                      style={inputStyle}
                      value={form.contato_emergencia_nome}
                      onChange={(e) => setForm((f) => ({ ...f, contato_emergencia_nome: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Telefone</label>
                    <input
                      style={inputStyle}
                      value={form.contato_emergencia_telefone}
                      onChange={(e) => setForm((f) => ({ ...f, contato_emergencia_telefone: maskTelefone(e.target.value) }))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={salvarDados} disabled={savingDados} style={{ ...btnPrimary, opacity: savingDados ? 0.6 : 1 }}>
                    {savingDados ? "Salvando..." : "Salvar Dados Pessoais"}
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB 1: Segurança ── */}
            {tab === 1 && (
              <div style={{ maxWidth: 420 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Senha atual</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={senhaForm.current}
                    onChange={(e) => setSenhaForm((f) => ({ ...f, current: e.target.value }))}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Nova senha (mínimo 8 caracteres)</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={senhaForm.nova}
                    onChange={(e) => setSenhaForm((f) => ({ ...f, nova: e.target.value }))}
                  />
                  <PasswordStrength password={senhaForm.nova} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Confirmar nova senha</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={senhaForm.confirmar}
                    onChange={(e) => setSenhaForm((f) => ({ ...f, confirmar: e.target.value }))}
                  />
                  {senhaForm.confirmar && senhaForm.nova !== senhaForm.confirmar && (
                    <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 600 }}>As senhas não conferem</span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <button onClick={alterarSenha} disabled={savingSenha} style={{ ...btnPrimary, opacity: savingSenha ? 0.6 : 1 }}>
                    {savingSenha ? "Alterando..." : "Alterar Senha"}
                  </button>
                  <button
                    onClick={enviarResetSenha}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#3B82F6",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB 2: Minhas Métricas ── */}
            {tab === 2 && (
              <div>
                {/* Period filter */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  {[
                    { key: "mes", label: "Este mês" },
                    { key: "3meses", label: "Últimos 3 meses" },
                    { key: "ano", label: "Este ano" },
                    { key: "tudo", label: "Tudo" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setMetricaPeriodo(p.key)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: "1px solid #D1D5DB",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        background: metricaPeriodo === p.key ? "#FFD700" : "#fff",
                        color: metricaPeriodo === p.key ? "#000" : "#374151",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {loadingMetricas ? (
                  <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando métricas...</p>
                ) : metricas ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                      { title: "Candidatos Triados", value: metricas.triados, accent: "#FFD700" },
                      { title: "Vagas Trabalhadas", value: metricas.vagas, accent: "#3B82F6" },
                      { title: "Contratações", value: metricas.contratados, accent: "#10B981" },
                      { title: "Taxa de Conversão", value: `${metricas.taxa}%`, accent: "#8B5CF6" },
                    ].map((m) => (
                      <div
                        key={m.title}
                        style={{
                          background: "#F9FAFB",
                          borderRadius: 12,
                          padding: 20,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                          {m.title}
                        </p>
                        <p style={{ fontSize: 32, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>
                          {m.value}
                        </p>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: m.accent, borderRadius: "0 0 12px 12px" }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhum dado disponível.</p>
                )}
              </div>
            )}

            {/* ── TAB 3: Dados Contratuais ── */}
            {tab === 3 && (
              <div>
                <div
                  style={{
                    background: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    borderRadius: 10,
                    padding: "12px 16px",
                    marginBottom: 24,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <svg width="18" height="18" fill="none" stroke="#D97706" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={{ fontSize: 13, color: "#92400E", fontWeight: 600 }}>Em desenvolvimento — módulo de gestão contratual</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, opacity: 0.6 }}>
                  <div>
                    <label style={labelStyle}>Tipo de contrato</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.tipo_contrato ?? ""} readOnly />
                  </div>
                  <div>
                    <label style={labelStyle}>Banco</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.banco ?? ""} readOnly />
                  </div>
                  <div>
                    <label style={labelStyle}>Agência</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.agencia ?? ""} readOnly />
                  </div>
                  <div>
                    <label style={labelStyle}>Conta</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.conta ?? ""} readOnly />
                  </div>
                  <div>
                    <label style={labelStyle}>Chave PIX</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.chave_pix ?? ""} readOnly />
                  </div>
                  <div>
                    <label style={labelStyle}>Próximas férias</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.ferias_proximo_periodo ?? ""} readOnly />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Benefícios</label>
                    <input style={{ ...inputStyle, background: "#F3F4F6" }} value={perfil.beneficios ? JSON.stringify(perfil.beneficios) : ""} readOnly />
                  </div>
                </div>

                <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 20, textAlign: "center" }}>
                  Estes dados são gerenciados pelo RH da Salmazos
                </p>
              </div>
            )}

            {/* ── TAB 4: Quilometragem ── */}
            {tab === 4 && (
              <KmTab
                analistaId={perfil.id}
                isGestor={perfil.nivel_acesso === "superuser" || perfil.nivel_acesso === "diretoria"}
              />
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
