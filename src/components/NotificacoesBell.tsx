"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNotificacoes, type Notificacao } from "@/components/NotificacoesProvider";

function tempoAtras(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const PANEL_WIDTH = 340;
const VIEWPORT_MARGIN = 8;

export default function NotificacoesBell() {
  const { notificacoes, naoLidas, abrirNotificacao } = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Ancora pela borda esquerda do botão (não pela direita): o sino agora mora
  // na sidebar, perto da borda ESQUERDA da tela, então ancorar pela direita
  // (como fazia sentido pra um navbar antigo, com o sino perto da direita)
  // jogava o painel pra fora da viewport à esquerda. Sempre garante que o
  // painel de 340px caiba dentro da tela, não importa onde o sino esteja.
  const atualizarPosicao = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - PANEL_WIDTH;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
    setPos({ top: rect.bottom + 8, left });
  };

  const toggle = () => {
    if (!aberto) atualizarPosicao();
    setAberto((o) => !o);
  };

  // Recalcula a posição do painel enquanto ele está aberto — evita ficar
  // desalinhado do sino se a janela for redimensionada.
  useEffect(() => {
    if (!aberto) return;
    window.addEventListener("resize", atualizarPosicao);
    return () => window.removeEventListener("resize", atualizarPosicao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const handleClick = (n: Notificacao) => {
    setAberto(false);
    abrirNotificacao(n);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px",
          color: "rgba(255,184,0,0.7)",
          display: "flex",
          alignItems: "center",
        }}
        title="Notificações"
      >
        <svg
          style={{ width: "22px", height: "22px" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {naoLidas > 0 && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              backgroundColor: "#ef4444",
              color: "#fff",
              fontSize: "10px",
              fontWeight: 700,
              minWidth: "16px",
              height: "16px",
              borderRadius: "9999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && pos && typeof document !== "undefined" && createPortal(
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            onClick={() => setAberto(false)}
          />
          <div
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: `${PANEL_WIDTH}px`,
              maxWidth: "calc(100vw - 16px)",
              background: "#fff",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.2)",
              border: "1px solid #e5e7eb",
              zIndex: 9999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#111827" }}>
                Notificações
              </span>
              {naoLidas > 0 && (
                <span
                  style={{
                    backgroundColor: "#ef4444",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                  }}
                >
                  {naoLidas} nova{naoLidas > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div style={{ maxHeight: "380px", overflowY: "auto" }}>
              {notificacoes.length === 0 ? (
                <p
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: "13px",
                  }}
                >
                  Nenhuma notificação
                </p>
              ) : (
                notificacoes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      background: n.lida ? "#fff" : "#fffbeb",
                      border: "none",
                      borderBottom: "1px solid #f3f4f6",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: n.lida ? "#d1d5db" : "#FFD700",
                          marginTop: "5px",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#111827",
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {n.titulo}
                        </p>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            margin: "2px 0 0",
                            lineHeight: 1.4,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {n.mensagem}
                        </p>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "#9ca3af",
                            margin: "4px 0 0",
                          }}
                        >
                          {tempoAtras(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
