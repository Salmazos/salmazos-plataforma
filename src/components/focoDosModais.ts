import type { KeyboardEvent } from "react";

const FOCAVEIS = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Tab/Shift+Tab não saem do modal: sem isso o foco escaparia para botões da tela de trás e Enter/Espaço os acionariam.
export function prenderTabNoModal(e: KeyboardEvent, container: HTMLElement | null): void {
  if (e.key !== "Tab" || !container) return;
  const focaveis = Array.from(container.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (focaveis.length === 0) return;
  const inicio = focaveis[0];
  const fim = focaveis[focaveis.length - 1];
  const ativo = document.activeElement;
  if (!container.contains(ativo)) { e.preventDefault(); inicio.focus(); return; }
  if (e.shiftKey && ativo === inicio) { e.preventDefault(); fim.focus(); }
  else if (!e.shiftKey && ativo === fim) { e.preventDefault(); inicio.focus(); }
}

// Devolve o foco ao botão de origem só se ele ainda existe na página; tenta de novo no próximo ciclo porque a tela de trás pode estar saindo de `inert`.
export function devolverFocoSeExistir(origem: HTMLElement | null | undefined): void {
  if (!origem || !origem.isConnected) return;
  origem.focus();
  if (document.activeElement !== origem) setTimeout(() => { if (origem.isConnected) origem.focus(); }, 0);
}
