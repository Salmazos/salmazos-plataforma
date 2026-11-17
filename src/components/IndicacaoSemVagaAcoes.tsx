"use client";

import { useEffect, useState } from "react";
import CamposAdmissaoPadrao from "./CamposAdmissaoPadrao";
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO_INDICACAO } from "@/lib/indicacaoSemVaga";
import { mensagemErrosAdmissao, validarCamposAdmissao, type CamposAdmissaoPadrao as DadosPadrao } from "@/lib/admissaoCamposPadrao";

// Ações do analista numa indicação que NASCEU sem vaga (migration_indicacao_sem_vaga.sql):
//  • Direcionar para vaga existente (mesmo cliente, aberta, mesmo tipo e unidade — o servidor confere de novo);
//  • Criar vaga a partir da indicação (vaga privada, aberta, 1 posição, responsável = quem está logado);
//  • Completar dados (salário, horário etc. — o cliente só informou o mínimo). Continua disponível depois de direcionada,
//    porque a aprovação MOT/Terceirização exige função, salário, horário e data de início.
// Aprovar só libera depois que a indicação tem vaga (o servidor também bloqueia, com mensagem própria).
// Os campos de admissão usam o PADRÃO da plataforma (DadosPadrao) — nada de texto livre onde o portal tem seletor.

interface VagaElegivel {
  id: string;
  titulo: string;
  cidade: string | null;
  estado: string | null;
}

export interface ItemIndicacaoSemVaga {
  id: string;
  candidato_nome: string;
  vaga_id?: string | null;
  tipo_servico?: string | null;
  vagas?: { titulo: string; tipo_servico: string } | null;
  [campo: string]: unknown;
}

interface Props {
  item: ItemIndicacaoSemVaga;
  // `aviso`: texto extra para a analista (ex.: vaga R&S criada sem taxa).
  onAtualizado: (novo: Record<string, unknown>, mensagem: string, aviso?: string | null) => void;
}

// Campos que o portal trata como texto/data/observação simples: continuam assim (decisão: manter o comportamento do portal para eles).
const CAMPOS_SIMPLES: { chave: string; rotulo: string; tipo?: "date" | "textarea" }[] = [
  { chave: "admissao_funcao", rotulo: "Função" },
  { chave: "admissao_data_inicio", rotulo: "Data de início", tipo: "date" },
  { chave: "admissao_setor", rotulo: "Setor" },
  { chave: "admissao_exame_responsavel", rotulo: "Exame admissional (responsável)" },
  { chave: "admissao_gestor", rotulo: "Gestor direto" },
  { chave: "admissao_observacoes", rotulo: "Observações", tipo: "textarea" },
];

// Os 7 campos padronizados (DadosPadrao), com o tipo de valor de cada um.
const CAMPOS_PADRAO: (keyof DadosPadrao)[] = [
  "admissao_salario", "admissao_salario_hora", "admissao_centro_custo", "admissao_horario", "admissao_turno", "admissao_escala", "admissao_tempo_contrato",
];

const inputCls = "w-full text-xs border border-gray-300 rounded-md px-2 py-1.5";
const btnCls = "text-xs font-semibold border rounded-lg px-3 py-1.5 disabled:opacity-50";

type Painel = "direcionar" | "criar" | "editar" | null;

const valorPadraoDoItem = (item: ItemIndicacaoSemVaga, campo: keyof DadosPadrao): string | number | null => {
  const v = item[campo];
  if (v === null || v === undefined || v === "") return null;
  return campo === "admissao_salario" || campo === "admissao_salario_hora" ? Number(v) : String(v);
};

export default function IndicacaoSemVagaAcoes({ item, onAtualizado }: Props) {
  const temVaga = !!item.vaga_id;
  const [painel, setPainel] = useState<Painel>(null);
  const [vagas, setVagas] = useState<VagaElegivel[] | null>(null);
  // Falha ao carregar as vagas é diferente de "nenhuma vaga elegível": a tela diz qual dos dois aconteceu.
  const [erroVagas, setErroVagas] = useState("");
  const [recarregarVagas, setRecarregarVagas] = useState(0);
  const [vagaEscolhida, setVagaEscolhida] = useState("");
  const [titulo, setTitulo] = useState(String(item.admissao_funcao ?? ""));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [simples, setSimples] = useState<Record<string, string>>({});
  const [vt, setVt] = useState("");
  const [tipoForm, setTipoForm] = useState(String(item.tipo_servico ?? item.vagas?.tipo_servico ?? ""));
  const [padrao, setPadrao] = useState<DadosPadrao>({});

  // Vagas elegíveis só enquanto a indicação não tem vaga.
  useEffect(() => {
    if (temVaga) return;
    let ativo = true;
    setVagas(null);
    setErroVagas("");
    fetch(`/api/solicitacoes-indicacao-candidato/${item.id}/vagas-elegiveis`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (!r.ok) { setErroVagas(typeof j.error === "string" ? j.error : "Não foi possível carregar as vagas do cliente."); return; }
        setVagas(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => { if (ativo) setErroVagas("Não foi possível carregar as vagas do cliente (erro de conexão)."); });
    return () => { ativo = false; };
  }, [item.id, temVaga, recarregarVagas]);

  const abrir = (p: Painel) => {
    setErro("");
    setPainel((atual) => (atual === p ? null : p));
    if (p === "editar") {
      setSimples(Object.fromEntries(CAMPOS_SIMPLES.map((c) => [c.chave, item[c.chave] == null ? "" : String(item[c.chave])])));
      setVt(item.admissao_vt === true ? "sim" : item.admissao_vt === false ? "nao" : "");
      setTipoForm(String(item.tipo_servico ?? item.vagas?.tipo_servico ?? ""));
      setPadrao(Object.fromEntries(CAMPOS_PADRAO.map((c) => [c, valorPadraoDoItem(item, c)])) as DadosPadrao);
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
    // Mesmas regras do servidor, ANTES de enviar: o analista vê o que está fora do padrão sem ir e voltar.
    const errosPadrao = validarCamposAdmissao(padrao);
    if (errosPadrao.length > 0) { setErro(mensagemErrosAdmissao(errosPadrao)); return; }

    const corpo: Record<string, unknown> = {};
    for (const c of CAMPOS_SIMPLES) {
      const novo = (simples[c.chave] ?? "").trim();
      const antigo = item[c.chave] == null ? "" : String(item[c.chave]);
      if (novo !== antigo) corpo[c.chave] = novo === "" ? null : novo;
    }
    for (const c of CAMPOS_PADRAO) {
      const novo = padrao[c] ?? null;
      const antigo = valorPadraoDoItem(item, c);
      if (novo !== antigo) corpo[c] = novo;
    }
    const vtAntigo = item.admissao_vt === true ? "sim" : item.admissao_vt === false ? "nao" : "";
    if (vt !== vtAntigo) corpo.admissao_vt = vt === "sim" ? true : vt === "nao" ? false : null;
    if (!temVaga && tipoForm && tipoForm !== String(item.tipo_servico ?? "")) corpo.tipo_servico = tipoForm;
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
          {erroVagas ? (
            <div className="space-y-1">
              <p className="text-xs text-red-600" role="alert">{erroVagas}</p>
              <button type="button" onClick={() => setRecarregarVagas((n) => n + 1)} className={`${btnCls} border-gray-300 text-gray-800`}>Tentar de novo</button>
            </div>
          ) : vagas === null ? (
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
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!temVaga && (
              <label className="text-[11px] text-gray-600">Tipo de serviço
                <select value={tipoForm} onChange={(e) => setTipoForm(e.target.value)} className={inputCls}>
                  {TIPOS_SERVICO_INDICACAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_SERVICO[t]}</option>)}
                </select>
              </label>
            )}
            {CAMPOS_SIMPLES.map((c) => (
              <label key={c.chave} className={`text-[11px] text-gray-600 ${c.tipo === "textarea" ? "sm:col-span-2" : ""}`}>{c.rotulo}
                {c.tipo === "textarea" ? (
                  <textarea rows={2} value={simples[c.chave] ?? ""} onChange={(e) => setSimples((f) => ({ ...f, [c.chave]: e.target.value }))} className={inputCls} />
                ) : (
                  <input type={c.tipo ?? "text"} value={simples[c.chave] ?? ""} onChange={(e) => setSimples((f) => ({ ...f, [c.chave]: e.target.value }))} className={inputCls} />
                )}
              </label>
            ))}
            <label className="text-[11px] text-gray-600">Vale transporte
              <select value={vt} onChange={(e) => setVt(e.target.value)} className={inputCls}>
                <option value="">Não informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </label>
          </div>

          {/* Padrão da plataforma: moeda com máscara, turno/escala em lista, horário por entrada e saída, tempo de contrato padrão. key: trocar o tipo refaz as listas. */}
          <CamposAdmissaoPadrao
            key={tipoForm}
            tipoServico={tipoForm}
            valores={padrao}
            onChange={(patch) => setPadrao((v) => ({ ...v, ...patch }))}
            inputClassName={inputCls}
          />

          <div className="flex justify-end">
            <button type="button" onClick={salvarDados} disabled={salvando} className={`${btnCls} border-black bg-black text-[#FFD700]`}>
              {salvando ? "Salvando..." : "Salvar dados"}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
    </div>
  );
}
