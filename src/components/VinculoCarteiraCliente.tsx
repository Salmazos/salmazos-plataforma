"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cliente } from "@/types";
import type { EmpresaCandidata } from "@/lib/carteiraVinculo";

const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function vincular(empresaId: string, clienteId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/comercial/empresas/${empresaId}/vincular-cliente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: clienteId }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? null : typeof json.error === "string" ? json.error : "Não foi possível vincular.";
  } catch {
    return "Erro de conexão. Tente novamente.";
  }
}

function Caixa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl"><h2 className="font-bold text-lg">{titulo}</h2></div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// Logo depois de cadastrar um cliente: empresas da Carteira (prospects) com nome parecido. Nada vem marcado; só vincula quem escolher.
export function PerguntaVincularEmpresa({ cliente, candidatas, onFechar }: { cliente: { id: string; nome: string }; candidatas: EmpresaCandidata[]; onFechar: () => void }) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const confirmar = async () => {
    if (!escolhida) return;
    setSalvando(true);
    setErro("");
    const e = await vincular(escolhida, cliente.id);
    setSalvando(false);
    if (e) { setErro(e); return; }
    onFechar();
  };

  return (
    <Caixa titulo="Vincular à Carteira?">
      <p className="text-sm text-gray-700">
        Cliente <strong>{cliente.nome}</strong> cadastrado. Esta empresa já está na Carteira (prospect). Vincular ao novo cliente?
      </p>
      <fieldset>
        <legend className="sr-only">Empresas da Carteira</legend>
        <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {candidatas.map((c) => (
            <li key={c.id}>
              <label className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${escolhida === c.id ? "bg-indigo-50" : ""}`}>
                <input type="radio" name="empresa-carteira" checked={escolhida === c.id} onChange={() => setEscolhida(c.id)} className="mt-1" />
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900 break-words">{c.nome}</span>
                  {c.cidade && <span className="block text-xs text-gray-500">{c.cidade}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline" disabled={salvando} onClick={onFechar}>Não vincular</button>
        <button type="button" className="btn-primary" disabled={!escolhida || salvando} onClick={confirmar}>{salvando ? "Vinculando..." : "Vincular à empresa escolhida"}</button>
      </div>
    </Caixa>
  );
}

// Na Carteira: empresa sem cliente escolhe um cliente existente da MESMA unidade (busca por nome) e confirma.
export function VincularEmpresaACliente({ empresa, unidadeId, onFechar, onVinculado }: { empresa: { id: string; nome: string }; unidadeId: string | null; onFechar: () => void; onVinculado: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [busca, setBusca] = useState(empresa.nome);
  const [escolhido, setEscolhido] = useState<string | null>(null);
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

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    const daUnidade = clientes.filter((c) => c.ativo && (!unidadeId || c.unidade_id === unidadeId));
    return (termo ? daUnidade.filter((c) => semAcento(c.nome).includes(termo)) : daUnidade).slice(0, 50);
  }, [clientes, busca, unidadeId]);
  const nomeEscolhido = clientes.find((c) => c.id === escolhido)?.nome;

  const confirmar = async () => {
    if (!escolhido) return;
    setSalvando(true);
    setErro("");
    const e = await vincular(empresa.id, escolhido);
    setSalvando(false);
    if (e) { setErro(e); return; }
    onVinculado();
  };

  return (
    <Caixa titulo="Vincular a cliente">
      <p className="text-sm text-gray-600">Empresa da Carteira: <strong>{empresa.nome}</strong>. Só aparecem clientes ativos da mesma unidade.</p>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite parte do nome" className="input-field" autoComplete="off" aria-label="Buscar cliente" />
      {carregando ? <p className="text-sm text-gray-400">Carregando clientes...</p>
        : erroLista ? <p role="alert" className="text-sm text-red-600">{erroLista}</p>
        : filtrados.length === 0 ? <p className="text-sm text-gray-500">Nenhum cliente encontrado nesta unidade.</p>
        : (
          <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {filtrados.map((c) => (
              <li key={c.id}>
                <label className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${escolhido === c.id ? "bg-indigo-50" : ""}`}>
                  <input type="radio" name="cliente-da-empresa" checked={escolhido === c.id} onChange={() => setEscolhido(c.id)} className="mt-1" />
                  <span className="min-w-0"><span className="block font-medium text-gray-900 break-words">{c.nome}</span><span className="block text-xs text-gray-500">{c.cidade}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      {escolhido && <p className="text-sm text-gray-700">Vincular <strong>{empresa.nome}</strong> ao cliente <strong>{nomeEscolhido}</strong>?</p>}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline" disabled={salvando} onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={!escolhido || salvando} onClick={confirmar}>{salvando ? "Vinculando..." : "Confirmar vínculo"}</button>
      </div>
    </Caixa>
  );
}
