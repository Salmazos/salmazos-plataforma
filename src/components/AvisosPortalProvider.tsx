"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AvisoPortal } from "@/lib/avisoClienteRegras";

type AcaoMarcar = "lida" | "popup" | "ambos";

interface AvisosPortalContexto {
  avisos: AvisoPortal[];
  // Lista da PRIMEIRA carga da página (null até chegar). O popup decide se abre só com ela: abrir o menu
  // do sino recarrega a lista, mas nunca reabre o popup no meio da sessão.
  primeiraCarga: AvisoPortal[] | null;
  recarregar: () => Promise<void>;
  marcar: (alvo: { ids: string[] } | { todos: true }, acao?: AcaoMarcar) => Promise<void>;
}

const Contexto = createContext<AvisosPortalContexto | null>(null);

export function useAvisosPortal(): AvisosPortalContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useAvisosPortal precisa estar dentro de um AvisosPortalProvider");
  return ctx;
}

async function buscarAvisos(): Promise<AvisoPortal[] | null> {
  try {
    const res = await fetch("/api/portal/avisos", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data ?? []) as AvisoPortal[];
  } catch {
    return null;
  }
}

// Dono ÚNICO da consulta de avisos do portal: o sino e o popup leem o mesmo estado, então são uma
// consulta só por carregamento da página. Sem polling e sem Realtime: a lista só é buscada de novo
// quando o usuário abre o menu do sino (ação dele).
export default function AvisosPortalProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<AvisoPortal[]>([]);
  const [primeiraCarga, setPrimeiraCarga] = useState<AvisoPortal[] | null>(null);
  const primeiraFeita = useRef(false);

  const recarregar = useCallback(async () => {
    const lista = await buscarAvisos();
    if (!lista) return; // falha silenciosa: aviso nunca atrapalha o portal
    setAvisos(lista);
    if (!primeiraFeita.current) {
      primeiraFeita.current = true;
      setPrimeiraCarga(lista);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const marcar = useCallback<AvisosPortalContexto["marcar"]>(async (alvo, acao = "ambos") => {
    const agoraTodos = "todos" in alvo;
    const ids = new Set("ids" in alvo ? alvo.ids : []);
    // Atualiza a tela na hora; se a gravação falhar, o estado certo volta no próximo carregamento.
    setAvisos((atual) =>
      atual.map((a) =>
        agoraTodos || ids.has(a.id)
          ? { ...a, lida: acao === "popup" ? a.lida : true, popup_visto: acao === "lida" ? a.popup_visto : true }
          : a
      )
    );
    try {
      await fetch("/api/portal/avisos/marcar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("ids" in alvo ? { ids: alvo.ids, acao } : { todos: true, acao }),
      });
    } catch {
      // se falhar, o aviso volta como não lido no próximo carregamento — sem problema
    }
  }, []);

  const valor = useMemo(() => ({ avisos, primeiraCarga, recarregar, marcar }), [avisos, primeiraCarga, recarregar, marcar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
