"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cliente } from "@/types";
import {
  completarSomenteVazios,
  montarPrefillCliente,
  rotularCampos,
  solicitacaoFicouIndisponivel,
  type SituacaoDaVaga,
  type SolicitacaoParaCliente,
} from "@/lib/clienteDaSolicitacao";

export interface ResultadoVinculo {
  clienteNome: string;
  vaga: SituacaoDaVaga;
  completados: string[];
  divergentes: string[];
  completarConflito: boolean;
}

interface Props {
  solicitacao: SolicitacaoParaCliente & { id: string; unidade_id: string };
  // Cliente já escolhido (vindo do aviso de duplicidade do cadastro). Pode estar inativo: então o botão vira "Reativar e vincular".
  clienteIdInicial?: string | null;
  onClose: () => void;
  onVinculado: (r: ResultadoVinculo) => void;
  // 409 "já vinculada ou decidida": quem chamou recarrega a lista.
  onJaVinculada: (mensagem: string) => void;
}

const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function ModalVincularClienteSolicitacao({ solicitacao, clienteIdInicial, onClose, onVinculado, onJaVinculada }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhidoId, setEscolhidoId] = useState<string | null>(clienteIdInicial ?? null);
  const [completar, setCompletar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch("/api/clientes")
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ativo) return;
        if (!ok) { setErroLista(typeof json.error === "string" ? json.error : "Não foi possível carregar os clientes."); return; }
        setClientes((json.data ?? []) as Cliente[]);
      })
      .catch(() => { if (ativo) setErroLista("Erro de conexão ao carregar os clientes."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  // A vaga só liga a cliente da mesma unidade da solicitação; inativos só aparecem se vieram escolhidos pelo aviso de duplicidade.
  const daUnidade = useMemo(
    () => clientes.filter((c) => c.unidade_id === solicitacao.unidade_id && (c.ativo || c.id === clienteIdInicial)),
    [clientes, solicitacao.unidade_id, clienteIdInicial]
  );
  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (termo ? daUnidade.filter((c) => semAcento(c.nome).includes(termo)) : daUnidade).slice(0, 50);
  }, [daUnidade, busca]);
  const escolhido = daUnidade.find((c) => c.id === escolhidoId) ?? null;
  const inativo = !!escolhido && !escolhido.ativo;

  // Prévia só de leitura (a mesma regra da rota). A conferência final de CNPJ/CPF que já pertença a OUTRO cadastro só acontece ao salvar.
  const previa = useMemo(
    () => (escolhido && completar ? completarSomenteVazios(escolhido, montarPrefillCliente(solicitacao).valores) : null),
    [escolhido, completar, solicitacao]
  );

  const vincular = async () => {
    if (!escolhido) return;
    setSalvando(true);
    setErro("");
    try {
      if (!escolhido.ativo) {
        // Reativação pelo fluxo que já existe (com a checagem de duplicidade dele) e só depois o vínculo.
        const rr = await fetch(`/api/clientes/${escolhido.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ativo: true }),
        });
        const jr = await rr.json();
        if (!rr.ok) { setErro(typeof jr.error === "string" ? jr.error : "Não foi possível reativar o cadastro."); return; }
        setClientes((prev) => prev.map((c) => (c.id === escolhido.id ? { ...c, ativo: true } : c)));
      }
      const res = await fetch(`/api/solicitacoes-vagas/${solicitacao.id}/vincular-cliente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "vincular", cliente_id: escolhido.id, completar_vazios: completar }),
      });
      const json = await res.json();
      if (res.ok) {
        onVinculado({
          clienteNome: escolhido.nome,
          vaga: json.data.vaga,
          completados: json.data.completados ?? [],
          divergentes: json.data.divergentes ?? [],
          completarConflito: json.data.completar_conflito === true,
        });
        return;
      }
      if (solicitacaoFicouIndisponivel(res.status, json)) { onJaVinculada(json.error); return; }
      if (res.status === 409 && json.precisaReativar) {
        setClientes((prev) => prev.map((c) => (c.id === escolhido.id ? { ...c, ativo: false } : c)));
      }
      setErro(typeof json.error === "string" ? json.error : "Não foi possível vincular.");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-vincular-cliente" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 id="titulo-vincular-cliente" className="font-bold text-lg">Vincular a cliente existente</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Solicitação de <strong>{solicitacao.cliente_nome}</strong>. Só aparecem clientes da mesma unidade da solicitação.
          </p>

          <div>
            <label htmlFor="busca-cliente-vinculo" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Buscar cliente
            </label>
            <input
              id="busca-cliente-vinculo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite parte do nome"
              className="input-field"
              autoComplete="off"
            />
          </div>

          {carregando ? (
            <p className="text-sm text-gray-400">Carregando clientes...</p>
          ) : erroLista ? (
            <p role="alert" className="text-sm text-red-600">{erroLista}</p>
          ) : (
            <fieldset>
              <legend className="sr-only">Clientes da unidade</legend>
              {filtrados.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum cliente encontrado nesta unidade.</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {filtrados.map((c) => (
                    <li key={c.id}>
                      <label className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${escolhidoId === c.id ? "bg-indigo-50" : ""}`}>
                        <input type="radio" name="cliente-vinculo" checked={escolhidoId === c.id} onChange={() => setEscolhidoId(c.id)} className="mt-1" />
                        <span className="min-w-0">
                          <span className="block font-medium text-gray-900 break-words">{c.nome}</span>
                          <span className="block text-xs text-gray-500">
                            {c.cidade}
                            {!c.ativo ? " · inativo" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          )}

          {inativo && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Este cliente está <strong>inativo</strong>. Para vincular, o cadastro será reativado primeiro.
            </p>
          )}

          {escolhido && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={completar} onChange={(e) => setCompletar(e.target.checked)} className="mt-1" />
                <span>
                  <strong>Completar só os campos vazios</strong> do cadastro com os dados da solicitação
                  <span className="block text-xs text-gray-500">Nada que já está preenchido é alterado.</span>
                </span>
              </label>
              {previa && (
                <div className="text-xs space-y-1" aria-live="polite">
                  <p>
                    <span className="font-semibold text-green-800">Será completado:</span>{" "}
                    {previa.preenchidos.length > 0 ? rotularCampos(previa.preenchidos) : "nada (nenhum campo vazio com dado na solicitação)"}
                  </p>
                  {previa.divergentes.length > 0 && (
                    <p>
                      <span className="font-semibold text-amber-800">Já preenchido e diferente (mantido):</span> {rotularCampos(previa.divergentes)}
                    </p>
                  )}
                  <p className="text-gray-500">CNPJ/CPF que já pertença a outro cadastro não é gravado; o resultado final aparece depois de salvar.</p>
                </div>
              )}
            </div>
          )}

          {erro && (
            <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 border-t sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn-outline" disabled={salvando}>Cancelar</button>
            <button type="button" onClick={vincular} disabled={!escolhido || salvando} className="btn-primary disabled:opacity-50">
              {salvando ? "Vinculando..." : inativo ? "Reativar e vincular" : "Vincular cliente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
