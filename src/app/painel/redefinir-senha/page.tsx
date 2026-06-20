"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      setHasToken(true);
    } else {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        setHasToken(!!session);
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setErro("As senhas não conferem.");
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: novaSenha });

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    setSucesso(true);
    setTimeout(() => router.push("/login"), 3000);
  };

  if (hasToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Verificando link...</p>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="card" style={{ padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Link inválido ou expirado</h2>
            <p className="text-gray-500 text-sm mb-6">
              Este link de redefinição de senha não é mais válido. Solicite um novo link na página de login.
            </p>
            <a
              href="/login"
              className="btn-primary inline-block px-6 py-2.5 text-sm"
            >
              Voltar ao login
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="card" style={{ padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Senha redefinida com sucesso!</h2>
            <p className="text-gray-500 text-sm">Redirecionando para o login em 3 segundos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="bg-black rounded-2xl p-3 inline-flex items-center justify-center mb-4 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png.png" alt="Salmazos RH" className="h-12 w-auto" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Redefinir Senha</h1>
          <p className="text-gray-500 text-sm mt-1">Escolha uma nova senha para sua conta</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nova senha (mínimo 8 caracteres)</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                autoComplete="new-password"
              />
              <PasswordStrength password={novaSenha} />
            </div>

            <div>
              <label className="label">Confirmar nova senha</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                autoComplete="new-password"
              />
              {confirmar && novaSenha !== confirmar && (
                <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 600 }}>As senhas não conferem</span>
              )}
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={salvando}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              style={{ opacity: salvando ? 0.6 : 1 }}
            >
              {salvando ? "Redefinindo..." : "Redefinir Senha"}
            </button>
          </form>
        </div>

        <p className="text-center mt-4">
          <a href="/login" className="text-blue-500 text-sm font-medium hover:underline">
            Voltar ao login
          </a>
        </p>
      </div>
    </div>
  );
}
