"use client";

import { useEffect, useState } from "react";
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO_INDICACAO } from "@/lib/indicacaoSemVaga";

// Ações do analista numa indicação que NASCEU sem vaga (migration_indicacao_sem_vaga.sql):
//  • Direcionar para vaga existente (mesmo cliente, aberta, mesmo tipo e unidade — o servidor confere de novo);
//  • Criar vaga a partir da indicação (vaga privada, aberta, 1 posição, responsável = quem está logado);
//  • Completar dados (salário, horário etc. — o cliente só informou o mínimo). Continua disponível depois de direcionada,
//    porque a aprovação MOT/Terceirização exige função, salário, horário e data de início.
// Aprovar só libera depois que a indicação tem vaga (o servidor também bloqueia, com mensagem própria).

interface VagaElegivel {
  id: string;
  titulo: string;
  cidade: string | null;
  estado: string | null;
}

export interface ItemIndicacaoSemVaga {
  id: string;
  candidato_nome: string;
  vaga_id: string | null;
  tipo_servico?: string | null;
  vagas?: { titulo: string; tipo_servico: string } | null;
  [campo: string]: unknown;
}

interface Props {
  item: ItemIndicacaoSemVaga;
  // `aviso`: texto extra para a analista (ex.: vaga R&S criada sem taxa).
  onAtualizado: (novo: Record<string, unknown>, mensagem: string, aviso?: string | null) => void;
}

const CAMPOS_TEXTO: { chave: string; rotulo: string; tipo?: "date" | "number" }[] = [
  { chave: "admissao_funcao", rotulo: "Função" },
  { chave: "admissao_data_inicio", rotulo: "Data de início", tipo: "date" },
  { chave: "admissao_salario", rotulo: "Salário mensal (R$)", tipo: "number" },
  { chave: "admissao_salario_hora", rotulo: "Salário por hora (R$)", tipo: "number" },
  { chave: "admissao_horario", rotulo: "Horário" },
  { chave: "admissao_setor", rotulo: "Setor" },
  { chave: "admissao_centro_custo", rotulo: "Centro de custo" },
  { chave: "admissao_turno", rotulo: "Turno" },
  { chave: "admissao_escala", rotulo: "Escala" },
  { chave: "admissao_tempo_contrato", rotulo: "Tempo de contrato" },
  { chave: "admissao_exame_responsavel", rotulo: "Exame admissional (responsável)" },
  { chave: "admissao_gestor", rotulo: "Gestor direto" },
  { chave: "admissao_observacoes", rotulo: "Observações" },
];

const inputCls = "w-full text-xs border border-gray-300 rounded-md px-2 py-1.5";
const btnCls = "text-xs font-semibold border rounded-lg px-3 py-1.5 disabled:opacity-50";

type Painel = "direcionar" | "criar" | "editar" | null;

export default function IndicacaoSemVagaAcoes({ item, onAtualizado }: Props) {
  const temVaga = !!item.vaga_id;
  const [painel, setPainel] = useState<Painel>(null);
  const [vagas, setVagas] = useState<VagaElegivel[] | null>(null);
  const [vagaEscolhida, setVagaEscolhida] = useState("");
  const [titulo, setTitulo] = useState(String(item.admissao_funcao ?? ""));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  // Vagas elegíveis só enquanto a indicação não tem vaga.
  useEffect(() => {
    if (temVaga) return;
    let ativo = true;
    fetch(`/api/solicitacoes-indicacao-candidato/${item.id}/vagas-elegiveis`)
      .then((r) => r.json())
      .then((j) => { if (ativo) setVagas(Array.isArray(j.data) ? j.data : []); })
      .catch(() => { if (ativo) setVagas([]); });
    return () => { ativo = false; };
  }, [item.id, temVaga]);

  const abrir = (p: Painel) => {
    setErro("");
    setPainel((atual) => (atual === p ? null : p));
    if (p === "editar") {
      setForm({
        tipo_servico: String(item.tipo_servico ?? ""),
        vt: item.admissao_vt === true ? "sim" : item.admissao_vt === false ? "nao" : "",
        ...Object.fromEntries(CAMPOS_TEXTO.map((c) => [c.chave, item[c.chave] == null ? "" : String(item[c.chave])])),
      });
    }
  };

  const chamar = async (url: string, metodo: "POST" | "PATCH", corpo: Record<string, unknown>) => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(typeof json.error === "string" ? json.error : "Não foi possível concluir."); return null; }
      return json as Record<string, unknown>;
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      return null;
    } finally {
      setSalvando(false);
    }
  };

  const direcionar = async () => {
    if (!vagaEscolhida) return;
    const json = await chamar(`/api/solicitacoes-indicacao-candidato/${item.id}/direcionar`, "POST", { vaga_id: vagaEscolhida });
    if (json?.data) onAtualizado(json.data as Record<string, unknown>, "Indicação direcionada para a vaga. Agora ela pode ser aprovada.");
  };

  const criarVaga = async () => {
    const json = await chamar(`/api/solicitacoes-indicacao-candidato/${item.id}/criar-vaga`, "POST", titulo.trim() ? { titulo: titulo.trim() } : {});
    if (json?.data) {
      const v = json.vaga as { titulo?: string } | undefined;
      onAtualizado(json.data as Record<string, unknown>, `Vaga "${v?.titulo ?? titulo}" criada (privada) e indicação direcionada. Agora ela pode ser aprovada.`, typeof json.aviso_taxa_rs === "string" ? json.aviso_taxa_rs : null);
    }
  };

  const salvarDados = async () => {
    const corpo: Record<string, unknown> = {};
    for (const c of CAMPOS_TEXTO) {
      const novo = (form[c.chave] ?? "").trim();
      const antigo = item[c.chave] == null ? "" : String(item[c.chave]);
      if (novo === antigo) continue;
      corpo[c.chave] = novo === "" ? null : c.tipo === "number" ? Number(novo.replace(",", ".")) : novo;
    }
    const vtAntigo = item.admissao_vt === true ? "sim" : item.admissao_vt === false ? "nao" : "";
    if ((form.vt ?? "") !== vtAntigo) corpo.admissao_vt = form.vt === "sim" ? true : form.vt === "nao" ? false : null;
    if (!temVaga && (form.tipo_servico ?? "") !== String(item.tipo_servico ?? "") && form.tipo_servico) corpo.tipo_servico = form.tipo_servico;
    if (Object.keys(corpo).length === 0) { setErro("Nenhum dado foi alterado."); return; }
    const json = await chamar(`/api/solicitacoes-indicacao-candidato/${item.id}`, "PATCH", corpo);
    if (json?.data) { setPainel(null); onAtualizado(json.data as Record<string, unknown>, "Dados da indicação atualizados."); }
  };

  return (
    <div className="space-y-2">
      <div className={`rounded-lg px-3 py-2 text-xs border ${temVaga ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-amber-50 border-amber-300 text-amber-900"}`}>
        <p className="font-semibold">
          {temVaga
            ? `Indicação sem vaga, já direcionada para "${item.vagas?.titulo ?? "a vaga"}".`
            : `Sem vaga — aguardando direcionamento${item.tipo_servico ? ` · ${ROTULO_TIPO_SERVICO[String(item.tipo_servico)] ?? String(item.tipo_servico)}` : ""}`}
        </p>
        {!temVaga && <p className="mt-0.5">Para aprovar, direcione para uma vaga existente ou crie a vaga a partir da indicação.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!temVaga && (
          <>
            <button type="button" onClick={() => abrir("direcionar")} className={`${btnCls} border-gray-300 text-gray-800 hover:bg-gray-50`}>Direcionar para vaga existente</button>
            <button type="button" onClick={() => abrir("criar")} className={`${btnCls} border-gray-300 text-gray-800 hover:bg-gray-50`}>Criar vaga a partir da indicação</button>
          </>
        )}
        <button type="button" onClick={() => abrir("editar")} className={`${btnCls} border-gray-300 text-gray-800 hover:bg-gray-50`}>Completar dados</button>
      </div>

      {painel === "direcionar" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          {vagas === null ? (
            <p className="text-xs text-gray-500">Carregando vagas...</p>
          ) : vagas.length === 0 ? (
            <p className="text-xs text-gray-600">Este cliente não tem vaga aberta do mesmo tipo de serviço e unidade. Crie a vaga a partir da indicação.</p>
          ) : (
            <>
              <label className="text-xs font-semibold text-gray-700" htmlFor={`vaga-${item.id}`}>Vaga do cliente (aberta, mesmo tipo e unidade)</label>
              <select id={`vaga-${item.id}`} value={vagaEscolhida} onChange={(e) => setVagaEscolhida(e.target.value)} className={inputCls}>
                <option value="">Selecione...</option>
                {vagas.map((v) => <option key={v.id} value={v.id}>{v.titulo}{v.cidade ? ` — ${v.cidade}${v.estado ? `/${v.estado}` : ""}` : ""}</option>)}
              </select>
              <div className="flex justify-end">
                <button type="button" onClick={direcionar} disabled={!vagaEscolhida || salvando} className={`${btnCls} border-black bg-black text-[#FFD700]`}>
                  {salvando ? "Direcionando..." : "Direcionar"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {painel === "criar" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <label className="text-xs font-semibold text-gray-700" htmlFor={`titulo-${item.id}`}>Título da vaga</label>
          <input id={`titulo-${item.id}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} maxLength={200} />
          <p className="text-[11px] text-gray-500">
            A vaga nasce <strong>aberta</strong>, <strong>privada</strong> (não aparece no site de vagas), com <strong>1 posição</strong> e você como responsável.
            {item.tipo_servico === "recrutamento_selecao" && " É R&S: configure a taxa (%) na vaga antes de finalizar a contratação."}
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={criarVaga} disabled={!titulo.trim() || salvando} className={`${btnCls} border-black bg-black text-[#FFD700]`}>
              {salvando ? "Criando..." : "Criar vaga e direcionar"}
            </button>
          </div>
        </div>
      )}

      {painel === "editar" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!temVaga && (
              <label className="text-[11px] text-gray-600">Tipo de serviço
                <select value={form.tipo_servico ?? ""} onChange={(e) => setForm((f) => ({ ...f, tipo_servico: e.target.value }))} className={inputCls}>
                  {TIPOS_SERVICO_INDICACAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_SERVICO[t]}</option>)}
                </select>
              </label>
            )}
            {CAMPOS_TEXTO.map((c) => (
              <label key={c.chave} className="text-[11px] text-gray-600">{c.rotulo}
                <input type={c.tipo ?? "text"} step={c.tipo === "number" ? "0.01" : undefined} value={form[c.chave] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [c.chave]: e.target.value }))} className={inputCls} />
              </label>
            ))}
            <label className="text-[11px] text-gray-600">Vale transporte
              <select value={form.vt ?? ""} onChange={(e) => setForm((f) => ({ ...f, vt: e.target.value }))} className={inputCls}>
                <option value="">Não informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={salvarDados} disabled={salvando} className={`${btnCls} border-black bg-black text-[#FFD700]`}>
              {salvando ? "Salvando..." : "Salvar dados"}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
