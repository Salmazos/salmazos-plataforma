"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  candidato_id: string | null;
  lida: boolean;
  created_at: string;
}

interface NotificacoesContextValue {
  notificacoes: Notificacao[];
  naoLidas: number;
  abrirNotificacao: (n: Notificacao) => void;
}

const NotificacoesContext = createContext<NotificacoesContextValue | null>(null);

export function useNotificacoes() {
  const ctx = useContext(NotificacoesContext);
  if (!ctx) throw new Error("useNotificacoes precisa estar dentro de um NotificacoesProvider");
  return ctx;
}

export default function NotificacoesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [toasts, setToasts] = useState<Notificacao[]>([]);

  const fetchNotificacoes = useCallback(async () => {
    try {
      const res = await fetch("/api/notificacoes");
      if (!res.ok) return;
      const json = await res.json();
      setNotificacoes(json.data ?? []);
    } catch {
      // silently ignore — notificações não são críticas pro resto da página
    }
  }, []);

  useEffect(() => {
    fetchNotificacoes();
    const id = setInterval(fetchNotificacoes, 30000);
    return () => clearInterval(id);
  }, [fetchNotificacoes]);

  // Realtime é o caminho "instantâneo"; o polling acima continua como rede de
  // segurança (reconexão de rede, aba que ficou em background, etc.) — RLS na
  // tabela já restringe o que chega aqui a notificações do próprio usuário ou
  // de broadcast (user_id nulo), então não precisamos (nem podemos, o filtro
  // do postgres_changes não suporta OR) repetir esse filtro na subscription.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    (async () => {
      // createClient() (cliente @supabase/ssr) hidrata a sessão dos cookies de
      // forma assíncrona. Se o canal se inscrever ANTES disso, ele entra no
      // socket do Realtime sem o JWT — e o Realtime não reautoriza um canal já
      // conectado quando a sessão chega depois, então ele fica "surdo" pro
      // resto da vida da página (postgres_changes nunca dispara, silenciosamente,
      // sem nenhum erro visível). Esperar a sessão aqui evita essa corrida.
      await supabase.auth.getSession();
      if (cancelado) return;

      channel = supabase
        .channel("notificacoes-analista-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notificacoes_analista" },
          (payload) => {
            const nova = payload.new as Notificacao;
            setNotificacoes((prev) => (prev.some((n) => n.id === nova.id) ? prev : [nova, ...prev]));
            setToasts((prev) => [...prev, nova]);
          }
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[NotificacoesProvider] Falha na subscription de realtime:", status, err);
          }
        });
    })();

    return () => {
      cancelado = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const marcarComoLida = useCallback((id: string) => {
    setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    fetch(`/api/notificacoes/${id}`, { method: "PATCH" }).catch(() => {});
  }, []);

  const abrirNotificacao = useCallback((n: Notificacao) => {
    if (!n.lida) marcarComoLida(n.id);
    if (n.candidato_id) router.push(`/painel/candidato/${n.candidato_id}`);
  }, [marcarComoLida, router]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const abrirToast = useCallback((n: Notificacao) => {
    dismissToast(n.id);
    abrirNotificacao(n);
  }, [dismissToast, abrirNotificacao]);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <NotificacoesContext.Provider value={{ notificacoes, naoLidas, abrirNotificacao }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} onOpen={abrirToast} />
    </NotificacoesContext.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: Notificacao[];
  onDismiss: (id: string) => void;
  onOpen: (n: Notificacao) => void;
}) {
  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 320,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} onOpen={() => onOpen(t)} />
      ))}
    </div>,
    document.body
  );
}

function ToastCard({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: Notificacao;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        background: "#fff",
        borderRadius: 10,
        borderLeft: "3px solid #FFD700",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        cursor: "pointer",
        animation: "notificacao-toast-in 0.2s ease",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#FFD700",
          marginTop: 5,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.4 }}>
          {toast.titulo}
        </p>
        <p
          style={{
            fontSize: 12,
            color: "#6b7280",
            margin: "3px 0 0",
            lineHeight: 1.4,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {toast.mensagem}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Fechar notificação"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#9ca3af",
          fontSize: 16,
          lineHeight: 1,
          padding: 2,
          flexShrink: 0,
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes notificacao-toast-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
