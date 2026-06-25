"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  Search,
  X,
  Eye,
  EyeOff,
  Shield,
  Pencil,
  KeyRound,
  UserX,
  UserCheck,
  Trash2,
} from "lucide-react";
import type { AnalistaPerfil } from "@/app/painel/usuarios/page";

interface Props {
  analistas: AnalistaPerfil[];
}

type FilterTab = "todos" | "ativos" | "inativos";

const NIVEL_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  superuser: { label: "Superuser", bg: "bg-black", text: "text-white" },
  diretoria: { label: "Diretoria", bg: "bg-blue-100", text: "text-blue-800" },
  supervisor: { label: "Supervisor", bg: "bg-purple-100", text: "text-purple-800" },
  analista: { label: "Analista", bg: "bg-green-100", text: "text-green-800" },
};

const AVATAR_COLORS: Record<string, string> = {
  superuser: "#000",
  diretoria: "#2563eb",
  supervisor: "#7c3aed",
  analista: "#16a34a",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PasswordStrength({ password }: { password: string }) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  const labels = ["Fraca", "Razoável", "Boa", "Forte"];
  const colors = ["bg-red-400", "bg-yellow-400", "bg-blue-400", "bg-green-500"];
  const idx = Math.max(0, strength - 1);

  if (!password) return null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= idx ? colors[idx] : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{labels[idx]}</p>
    </div>
  );
}

export default function UsuariosPageClient({ analistas }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<FilterTab>("todos");
  const [search, setSearch] = useState("");
  const [modalNovo, setModalNovo] = useState(false);
  const [modalEditar, setModalEditar] = useState<AnalistaPerfil | null>(null);
  const [modalSenha, setModalSenha] = useState<AnalistaPerfil | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<AnalistaPerfil | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AnalistaPerfil | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    let list = analistas;
    if (tab === "ativos") list = list.filter((a) => a.ativo);
    if (tab === "inativos") list = list.filter((a) => !a.ativo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.nome_completo.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [analistas, tab, search]);

  const counts = useMemo(() => ({
    todos: analistas.length,
    ativos: analistas.filter((a) => a.ativo).length,
    inativos: analistas.filter((a) => !a.ativo).length,
  }), [analistas]);

  async function handleToggleAtivo(user: AnalistaPerfil) {
    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !user.ativo }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao atualizar");
      }
      router.refresh();
    } finally {
      setLoading(false);
      setConfirmToggle(null);
    }
  }

  async function handleDelete(user: AnalistaPerfil) {
    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao excluir");
      }
      router.refresh();
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 11,
    color: "#FFB800",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    borderBottom: "2px solid #F3F4F6",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #F3F4F6",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} /> Gestão de Usuários
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Gerencie os acessos da equipe Salmazos
          </p>
        </div>
        <button
          onClick={() => setModalNovo(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: "#FFD700", color: "#000" }}
        >
          <Plus size={16} /> Novo Usuário
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(["todos", "ativos", "inativos"] as FilterTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: tab === t ? "#000" : "transparent",
                color: tab === t ? "#FFD700" : "#6B7280",
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                <th style={thStyle}>Usuário</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Cargo</th>
                <th style={thStyle}>Nível de acesso</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Atualização</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#9CA3AF", padding: 32 }}>
                    Nenhum usuário encontrado
                  </td>
                </tr>
              )}
              {filtered.map((a) => {
                const nivel = a.nivel_acesso || "analista";
                const badge = NIVEL_BADGE[nivel] || NIVEL_BADGE.analista;
                const avatarBg = AVATAR_COLORS[nivel] || "#6B7280";
                return (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td style={tdStyle}>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex items-center justify-center rounded-full text-white text-xs font-bold shrink-0"
                          style={{ width: 32, height: 32, background: avatarBg }}
                        >
                          {getInitials(a.nome_completo)}
                        </div>
                        <span className="font-medium text-gray-900">{a.nome_completo}</span>
                      </div>
                    </td>
                    <td style={tdStyle}>{a.email}</td>
                    <td style={tdStyle}>{a.cargo || "—"}</td>
                    <td style={tdStyle}>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                        <Shield size={10} />
                        {badge.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {a.ativo ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {a.updated_at
                        ? new Date(a.updated_at).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModalEditar(a)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setModalSenha(a)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                          title="Redefinir senha"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmToggle(a)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                          title={a.ativo ? "Desativar" : "Reativar"}
                        >
                          {a.ativo ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        {!a.ativo && (a.nivel_acesso || "analista") !== "superuser" && (
                          <button
                            onClick={() => setConfirmDelete(a)}
                            className="p-1.5 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                            title="Excluir permanentemente"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Usuário */}
      {modalNovo && (
        <ModalNovoUsuario
          onClose={() => setModalNovo(false)}
          onSuccess={() => { setModalNovo(false); router.refresh(); }}
        />
      )}

      {/* Modal Editar Usuário */}
      {modalEditar && (
        <ModalEditarUsuario
          user={modalEditar}
          onClose={() => setModalEditar(null)}
          onSuccess={() => { setModalEditar(null); router.refresh(); }}
        />
      )}

      {/* Modal Redefinir Senha */}
      {modalSenha && (
        <ModalResetSenha
          user={modalSenha}
          onClose={() => setModalSenha(null)}
          onSuccess={() => { setModalSenha(null); router.refresh(); }}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <Trash2 size={40} className="mx-auto text-red-500 mb-3" />
              <h3 className="font-bold text-lg text-gray-900 mb-1">
                Excluir usuário permanentemente
              </h3>
              <p className="text-sm text-gray-500 mb-5">
                Esta ação não pode ser desfeita. O usuário{" "}
                <strong>{confirmDelete.nome_completo}</strong> será removido
                permanentemente da plataforma.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: "#ef4444" }}
                  disabled={loading}
                >
                  {loading ? "Excluindo..." : "Excluir permanentemente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm toggle ativo */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              {confirmToggle.ativo ? (
                <UserX size={40} className="mx-auto text-red-500 mb-3" />
              ) : (
                <UserCheck size={40} className="mx-auto text-green-500 mb-3" />
              )}
              <h3 className="font-bold text-lg text-gray-900 mb-1">
                {confirmToggle.ativo ? "Desativar" : "Reativar"} usuário?
              </h3>
              <p className="text-sm text-gray-500 mb-5">
                {confirmToggle.ativo
                  ? `${confirmToggle.nome_completo} perderá acesso ao sistema.`
                  : `${confirmToggle.nome_completo} terá o acesso restaurado.`}
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setConfirmToggle(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleToggleAtivo(confirmToggle)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: confirmToggle.ativo ? "#ef4444" : "#16a34a" }}
                  disabled={loading}
                >
                  {loading ? "Salvando..." : confirmToggle.ativo ? "Desativar" : "Reativar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Modal Novo Usuário ───── */
function ModalNovoUsuario({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    nome_completo: "",
    email: "",
    cargo: "",
    departamento: "",
    nivel_acesso: "analista",
    senha: "",
    confirmar_senha: "",
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.senha.length < 8) { setError("Senha deve ter no mínimo 8 caracteres"); return; }
    if (form.senha !== form.confirmar_senha) { setError("As senhas não coincidem"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao criar usuário"); return; }
      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Novo Usuário</h2>
            <p className="text-[#FFD700] text-sm mt-0.5">Cadastrar novo membro da equipe</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nome completo *</label>
            <input
              required
              value={form.nome_completo}
              onChange={(e) => set("nome_completo", e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cargo</label>
              <input
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Departamento</label>
              <input
                value={form.departamento}
                onChange={(e) => set("departamento", e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nível de acesso</label>
            <select
              value={form.nivel_acesso}
              onChange={(e) => set("nivel_acesso", e.target.value)}
              className="input-field w-full"
            >
              <option value="analista">Analista</option>
              <option value="supervisor">Supervisor</option>
              <option value="diretoria">Diretoria</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Senha inicial *</label>
            <div className="relative">
              <input
                required
                type={showPass ? "text" : "password"}
                value={form.senha}
                onChange={(e) => set("senha", e.target.value)}
                className="input-field w-full pr-9"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordStrength password={form.senha} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Confirmar senha *</label>
            <input
              required
              type="password"
              value={form.confirmar_senha}
              onChange={(e) => set("confirmar_senha", e.target.value)}
              className="input-field w-full"
              minLength={8}
            />
            {form.confirmar_senha && form.senha !== form.confirmar_senha && (
              <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#FFD700", color: "#000" }}
              disabled={loading}
            >
              {loading ? "Criando..." : "Criar Usuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───── Modal Editar Usuário ───── */
function ModalEditarUsuario({
  user,
  onClose,
  onSuccess,
}: {
  user: AnalistaPerfil;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    nome_completo: user.nome_completo,
    cargo: user.cargo || "",
    departamento: user.departamento || "",
    nivel_acesso: user.nivel_acesso || "analista",
    ativo: user.ativo,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (field: string, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao atualizar"); return; }
      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Editar Usuário</h2>
            <p className="text-[#FFD700] text-sm mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nome completo</label>
            <input
              required
              value={form.nome_completo}
              onChange={(e) => set("nome_completo", e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input
              value={user.email}
              disabled
              className="input-field w-full bg-gray-50 text-gray-400 cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cargo</label>
              <input
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Departamento</label>
              <input
                value={form.departamento}
                onChange={(e) => set("departamento", e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nível de acesso</label>
            <select
              value={form.nivel_acesso}
              onChange={(e) => set("nivel_acesso", e.target.value)}
              className="input-field w-full"
            >
              <option value="analista">Analista</option>
              <option value="supervisor">Supervisor</option>
              <option value="diretoria">Diretoria</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Status do usuário</p>
              <p className="text-xs text-gray-500">
                {form.ativo ? "Usuário com acesso ao sistema" : "Usuário sem acesso ao sistema"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => set("ativo", !form.ativo)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: form.ativo ? "#16a34a" : "#d1d5db" }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
                style={{ transform: form.ativo ? "translateX(24px)" : "translateX(4px)" }}
              />
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#FFD700", color: "#000" }}
              disabled={loading}
            >
              {loading ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───── Modal Redefinir Senha ───── */
function ModalResetSenha({
  user,
  onClose,
  onSuccess,
}: {
  user: AnalistaPerfil;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (senha.length < 8) { setError("Senha deve ter no mínimo 8 caracteres"); return; }
    if (senha !== confirmar) { setError("As senhas não coincidem"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios/${user.id}/reset-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao redefinir senha"); return; }
      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <KeyRound size={18} /> Redefinir Senha
            </h2>
            <p className="text-[#FFD700] text-sm mt-0.5">{user.nome_completo}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nova senha</label>
            <div className="relative">
              <input
                required
                type={showPass ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="input-field w-full pr-9"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordStrength password={senha} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Confirmar senha</label>
            <input
              required
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="input-field w-full"
              minLength={8}
            />
            {confirmar && senha !== confirmar && (
              <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#FFD700", color: "#000" }}
              disabled={loading}
            >
              {loading ? "Salvando..." : "Redefinir Senha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
