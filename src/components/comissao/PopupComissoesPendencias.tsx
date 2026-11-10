"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rotuloCompetencia } from "@/lib/comissaoRegras";
import type { PendenciasBeneficiario, PendenciasDiretoria } from "@/lib/comissaoPendencias";
import { dataBR, moeda } from "./ui";

interface Resposta {
  beneficiario: PendenciasBeneficiario | null;
  diretoria: PendenciasDiretoria | null;
}

const CHAVE = "comissao-pendencias-visto";
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

// Popup ao entrar no painel: o que falta fazer em comissões. É ESTADO lido do banco (não evento), então reaparece a cada nova sessão do
// navegador enquanto a pendência existir: fechar só o esconde nesta sessão. Beneficiário vê o que falta lançar e as contestações;
// diretoria vê contestações paradas, fechamento liberado, fechamento sem pagamento e possíveis comissões esquecidas.
export default function PopupComissoesPendencias() {
  const router = useRouter();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        let visto = false;
        try { visto = sessionStorage.getItem(CHAVE) === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); } catch { /* sem storage: mostra */ }
        if (visto) return;
        const res = await fetch("/api/comissoes/pendencias");
        if (!res.ok) return;
        const body: Resposta = await res.json();
        if (cancelado) return;
        const b = body.beneficiario, d = body.diretoria;
        const temB = !!b && (b.a_lancar.length > 0 || b.contestadas > 0);
        const temD = !!d && (d.contestadas.qtd > 0 || !!d.fechamento || d.pagamento.length > 0 || !!d.esquecidas);
        if (temB || temD) { setDados(body); setAberto(true); }
      } catch { /* silencioso: o popup nunca trava o painel */ }
    })();
    return () => { cancelado = true; };
  }, []);

  function fechar() {
    setAberto(false);
    try { sessionStorage.setItem(CHAVE, new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })); } catch { /* ignora */ }
  }
  function ir(rota: string) { fechar(); router.push(rota); }

  if (!aberto || !dados) return null;
  const b = dados.beneficiario, d = dados.diretoria;
  const mostraB = !!b && (b.a_lancar.length > 0 || b.contestadas > 0);
  const mostraD = !!d && (d.contestadas.qtd > 0 || !!d.fechamento || d.pagamento.length > 0 || !!d.esquecidas);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-[#FFD700]/40 max-h-[90vh] flex flex-col">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">💰 Comissões: pendências</h2>
            <p className="text-xs text-gray-300 mt-0.5">Confira o que precisa de atenção para nenhuma comissão ficar sem lançar</p>
          </div>
          <button onClick={fechar} className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 overflow-y-auto">
          {mostraB && b && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Para você lançar</h3>
              {b.a_lancar.length > 0 && (
                <>
                  <p className="text-sm text-gray-700">
                    {b.a_lancar.length} {plural(b.a_lancar.length, "cobrança sua está", "cobranças suas estão")} sem comissão marcada.
                    {b.janela && ` Prazo para ${rotuloCompetencia(b.janela.competencia)}: até ${dataBR(b.janela.prazoAte)}${b.janela.ultimoDia ? " (HOJE é o último dia)" : ""}.`}
                  </p>
                  <ul className="text-sm text-gray-800 space-y-1">
                    {b.a_lancar.slice(0, 6).map((i) => (
                      <li key={i.id} className="flex justify-between gap-3 border-b border-gray-100 pb-1">
                        <span>{i.cliente ?? "—"} <span className="text-gray-500">· {i.vaga ?? "—"}</span></span>
                        <span className="font-semibold whitespace-nowrap">{moeda(i.comissao_prevista)}</span>
                      </li>
                    ))}
                    {b.a_lancar.length > 6 && <li className="text-xs text-gray-500">e mais {b.a_lancar.length - 6}…</li>}
                  </ul>
                </>
              )}
              {b.contestadas > 0 && <p className="text-sm text-red-700">{b.contestadas} {plural(b.contestadas, "comissão sua foi contestada", "comissões suas foram contestadas")} pela diretoria.</p>}
              <button onClick={() => ir("/painel/minhas-comissoes")} className="text-sm font-semibold rounded-lg px-4 py-2" style={{ background: "#000", color: "#FFD700" }}>Abrir Minhas Comissões</button>
            </section>
          )}

          {mostraD && d && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Para a diretoria</h3>
              <ul className="text-sm text-gray-800 space-y-2 list-disc pl-5">
                {d.contestadas.qtd > 0 && <li>{d.contestadas.qtd} {plural(d.contestadas.qtd, "comissão contestada aguarda", "comissões contestadas aguardam")} decisão; enquanto houver, o fechamento do mês fica bloqueado.</li>}
                {d.fechamento && d.fechamento.unidades.map((u) => (
                  <li key={u.unidade_id}>Fechamento de <strong>{rotuloCompetencia(d.fechamento!.competencia)}</strong>{u.unidade ? ` (${u.unidade})` : ""} liberado: {u.qtd} {plural(u.qtd, "lançamento", "lançamentos")}, {moeda(u.total)}.{u.bloqueios > 0 ? ` Há ${u.bloqueios} bloqueando.` : ""}</li>
                ))}
                {d.pagamento.map((p) => (
                  <li key={p.fechamento_id}>Fechamento de <strong>{rotuloCompetencia(p.competencia)}</strong>{p.unidade ? ` (${p.unidade})` : ""} ({moeda(p.total)}) sem pagamento há {p.dias} {plural(p.dias, "dia", "dias")}.</li>
                ))}
                {d.esquecidas && (
                  <li>
                    {d.esquecidas.itens.length} {plural(d.esquecidas.itens.length, "cobrança de", "cobranças de")} {rotuloCompetencia(d.esquecidas.competencia)}, {plural(d.esquecidas.itens.length, "gerada", "geradas")} por beneficiário, ficaram <strong>sem comissão marcada</strong> e o prazo terminou:
                    <ul className="list-[circle] pl-5 mt-1 text-xs text-gray-600">
                      {d.esquecidas.itens.slice(0, 5).map((i) => <li key={i.id}>{i.cliente ?? "—"} · {i.vaga ?? "—"} · {i.gerada_por ?? "—"}</li>)}
                      {d.esquecidas.itens.length > 5 && <li>e mais {d.esquecidas.itens.length - 5}…</li>}
                    </ul>
                  </li>
                )}
              </ul>
              <button onClick={() => ir("/painel/comissoes")} className="text-sm font-semibold rounded-lg px-4 py-2" style={{ background: "#000", color: "#FFD700" }}>Abrir Comissões</button>
            </section>
          )}
        </div>
        <div className="px-6 py-3 border-t text-right">
          <button onClick={fechar} className="text-sm text-gray-600">Fechar</button>
        </div>
      </div>
    </div>
  );
}
