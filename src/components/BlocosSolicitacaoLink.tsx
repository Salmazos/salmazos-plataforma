"use client";

import { useState } from "react";
import { condicoesPersonalizadas } from "@/lib/solicitacaoVagaCondicoes";
import { linhasDoPerfilExtra } from "@/lib/perfilCandidatoPortal";

// Blocos extras do cartão da solicitação que veio do link público (cliente sem cadastro): dados do contratante, perfil de uso
// interno e as condições comerciais que o cliente aceitou. Só leitura; Aprovar/Recusar/Editar continuam no modal.

export interface DadosEmpresaLink {
  tipo_pessoa?: "pj" | "pf" | null;
  nome?: string | null;
  cnpj_cpf?: string | null;
  contato_nome?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  email?: string | null;
  email_nf?: string | null;
}

export interface PerfilExtraLink {
  sexo?: string | null;
  idade?: string | null;
  idade_min?: number | null;
  idade_max?: number | null;
  pcd?: string | null;
  habilitacao_categoria?: string | null;
  veiculo_proprio?: string | null;
  local_trabalho?: string | null;
}

export interface CondicoesAceitasLink {
  condicoes?: Record<string, number> | null;
  clausulas_adicionais?: string[] | null;
  itens?: { numero: string; texto: string }[] | null;
  link_id?: string | null;
}

export interface SolicitacaoDeLink {
  origem?: string | null;
  dados_empresa?: DadosEmpresaLink | null;
  perfil_extra?: PerfilExtraLink | null;
  aceite_taxa_cancelamento_em?: string | null;
  aceite_ip?: string | null;
  condicoes_aceitas?: CondicoesAceitasLink | null;
}

const SEXO: Record<string, string> = { masc: "Masculino", fem: "Feminino", indiferente: "Indiferente" };
const sim = (v: string | null | undefined) => (v === "sim" ? "Sim" : v === "nao" ? "Não" : null);

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // sem permissão de área de transferência: o texto continua selecionável na tela
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={`Copiar ${rotulo}`}
      className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
    >
      {copiado ? "Copiado ✓" : "Copiar"}
    </button>
  );
}

export function SeloViaLink() {
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#DBEAFE", color: "#1D4ED8", border: "1px solid #93C5FD" }}>
      Via link — cliente sem cadastro
    </span>
  );
}

// Perfil informado (uso interno, não publicado): o mesmo bloco para a solicitação do link e para a do portal.
export function BlocoPerfilInformado({ perfil }: { perfil: { rotulo: string; valor: string | null | undefined }[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
      <p className="text-xs font-bold text-amber-900">Perfil informado (uso interno — NÃO é publicado)</p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {perfil.filter((l) => l.valor).map((l) => (
          <div key={l.rotulo} className="flex gap-2 text-xs">
            <dt className="font-semibold text-gray-600">{l.rotulo}:</dt>
            <dd className="break-words text-gray-900">{l.valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-amber-800">Ao criar a vaga, só habilitação e veículo próprio entram nos requisitos. Sexo e idade nunca são publicados.</p>
    </div>
  );
}

export default function BlocosSolicitacaoLink({ s }: { s: SolicitacaoDeLink }) {
  const e = s.dados_empresa ?? {};
  const p = s.perfil_extra ?? {};
  const aceitas = s.condicoes_aceitas ?? null;
  const pf = e.tipo_pessoa === "pf";

  const dados: { rotulo: string; valor: string | null | undefined }[] = [
    { rotulo: "Tipo", valor: e.tipo_pessoa ? (pf ? "Pessoa física" : "Pessoa jurídica") : null },
    { rotulo: pf ? "Nome completo" : "Empresa contratante", valor: e.nome },
    { rotulo: pf ? "CPF" : "CNPJ", valor: e.cnpj_cpf },
    { rotulo: "Contato", valor: pf ? null : e.contato_nome },
    { rotulo: "Telefone", valor: e.telefone },
    { rotulo: "E-mail", valor: e.email },
    { rotulo: "E-mail para nota fiscal", valor: e.email_nf },
    { rotulo: "Endereço", valor: e.endereco },
  ];
  const dadosPreenchidos = dados.filter((d): d is { rotulo: string; valor: string } => !!d.valor);

  const perfil = linhasDoPerfilExtra(p);

  const aceiteEm = s.aceite_taxa_cancelamento_em
    ? new Date(s.aceite_taxa_cancelamento_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-3">
      {dadosPreenchidos.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-blue-900">Dados do contratante</p>
            <BotaoCopiar rotulo="todos os dados do contratante" texto={dadosPreenchidos.map((d) => `${d.rotulo}: ${d.valor}`).join("\n")} />
          </div>
          <dl className="space-y-1">
            {dadosPreenchidos.map((d) => (
              <div key={d.rotulo} className="flex items-start gap-2 text-xs">
                <dt className="w-40 shrink-0 font-semibold text-gray-600">{d.rotulo}</dt>
                <dd className="min-w-0 flex-1 break-words text-gray-900">{d.valor}</dd>
                <BotaoCopiar rotulo={d.rotulo} texto={d.valor} />
              </div>
            ))}
          </dl>
        </div>
      )}

      <BlocoPerfilInformado perfil={perfil} />

      {aceitas && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-gray-900">Condições aceitas pelo cliente</p>
            {condicoesPersonalizadas(aceitas) && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
                Condições personalizadas
              </span>
            )}
          </div>
          {aceiteEm && (
            <p className="text-xs text-gray-600">
              Aceitas em {aceiteEm}
              {s.aceite_ip ? ` · IP ${s.aceite_ip}` : ""}
            </p>
          )}
          <ol className="space-y-1">
            {(aceitas.itens ?? []).map((item) => (
              <li key={item.numero} className="grid grid-cols-[2.5rem_1fr] gap-1 text-xs text-gray-800">
                <span className="font-bold">{item.numero}</span>
                <span className="break-words whitespace-pre-wrap">{item.texto}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export interface SolicitacaoComCliente extends SolicitacaoDeLink {
  status: string;
  cliente_id?: string | null;
  cliente_vinculado?: { id: string; nome: string } | null;
}

// Cliente da solicitação do link: quem veio pelo link não tem cadastro, e sem cliente a cobrança R&S da vaga não sai. Recusada não oferece nada
// (nem vincular); já vinculada só mostra o cliente.
export function BlocoClienteDaSolicitacao({
  s,
  ocupado,
  onCadastrar,
  onVincular,
}: {
  s: SolicitacaoComCliente;
  ocupado: boolean;
  // Recebem o botão clicado: é a origem do foco quando o modal que abre for fechado.
  onCadastrar: (origem: HTMLElement) => void;
  onVincular: (origem: HTMLElement) => void;
}) {
  if (s.origem !== "link_publico") return null;
  if (s.cliente_id) {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
        <span className="font-bold">Cliente:</span> {s.cliente_vinculado?.nome ?? "cadastro vinculado"}
      </p>
    );
  }
  if (s.status !== "pendente" && s.status !== "aprovada") return null;
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
      <p className="text-xs font-bold text-indigo-900">Cliente ainda sem cadastro</p>
      <p className="text-xs text-indigo-800">
        Sem um cliente vinculado, a cobrança de R&amp;S desta vaga não é gerada. Cadastre um cliente novo com os dados da solicitação ou vincule a um cliente que já existe.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={(e) => onCadastrar(e.currentTarget)}
          disabled={ocupado}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          Cadastrar cliente a partir desta solicitação
        </button>
        <button
          type="button"
          onClick={(e) => onVincular(e.currentTarget)}
          disabled={ocupado}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
        >
          Vincular a cliente existente
        </button>
      </div>
    </div>
  );
}
