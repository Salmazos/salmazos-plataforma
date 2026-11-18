import BlocosSolicitacaoLink, { BlocoPerfilInformado } from "@/components/BlocosSolicitacaoLink";
import { linhasDoPerfilExtra } from "@/lib/perfilCandidatoPortal";
import type { SolicitacaoOriginalDaVaga } from "@/lib/solicitacaoOriginalDaVaga";

export const TEXTO_DADOS_ORIGINAIS = "Informações enviadas pelo cliente. Uso interno: não são publicadas.";

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex gap-2 text-xs">
      <dt className="w-32 shrink-0 font-semibold text-gray-600">{rotulo}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-900">{valor}</dd>
    </div>
  );
}

// Ficha da vaga (painel): o que o cliente informou na solicitação que originou a vaga, somente leitura. Só a equipe vê; a página lê pelo vaga_id e nada
// disto vai para o site público, o portal, o PDF nem para o candidato. Vaga sem solicitação ligada (criada à mão, por indicação, importação ou
// garantia): não mostra o bloco, para não poluir a ficha de 9 em cada 10 vagas.
export default function BlocoDadosOriginaisSolicitacao({ solicitacao: s }: { solicitacao: SolicitacaoOriginalDaVaga | null | undefined }) {
  if (!s) return null;
  const doLink = s.origem === "link_publico";
  const perfilTemDados = linhasDoPerfilExtra(s.perfil_extra).some((l) => l.valor);
  const previsao = s.previsao_inicio ? s.previsao_inicio.split("-").reverse().join("/") : null;
  const aprovada = s.aprovada_por ? `${s.aprovada_por}${s.aprovada_em ? ` em ${quando(s.aprovada_em)}` : ""}` : quando(s.aprovada_em);

  return (
    <div className="card space-y-3" data-bloco="dados-originais-solicitacao">
      <div>
        <p className="section-title">Dados originais da solicitação do cliente (uso interno)</p>
        <p className="text-xs text-gray-500 mt-1">{TEXTO_DADOS_ORIGINAIS}</p>
      </div>

      <dl className="space-y-1">
        <Linha rotulo="Origem" valor={doLink ? "Link de solicitação (cliente sem cadastro)" : "Portal do cliente"} />
        <Linha rotulo="Solicitado por" valor={doLink ? s.dados_empresa?.contato_nome ?? s.dados_empresa?.nome ?? s.cliente_nome : s.cliente_nome} />
        <Linha rotulo="Pedido em" valor={quando(s.created_at)} />
        <Linha rotulo="Aprovado por" valor={aprovada} />
        <Linha rotulo="Previsão de início" valor={previsao} />
      </dl>

      {/* Link: dados do contratante e perfil (o componente do cartão da solicitação). As condições comerciais aceitas não entram aqui. */}
      {doLink && <BlocosSolicitacaoLink s={{ origem: s.origem, dados_empresa: s.dados_empresa, perfil_extra: s.perfil_extra }} />}
      {/* Portal: só o perfil (o contratante já é cliente cadastrado); sem perfil preenchido (solicitação antiga), sem o quadro vazio. */}
      {!doLink && perfilTemDados && <BlocoPerfilInformado perfil={linhasDoPerfilExtra(s.perfil_extra)} />}

      {s.requisitos && (
        <div>
          <p className="text-xs font-bold text-gray-700 mb-1">Requisitos, como o cliente escreveu</p>
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{s.requisitos}</p>
        </div>
      )}
      {s.observacoes && (
        <div>
          <p className="text-xs font-bold text-gray-700 mb-1">Observações do cliente</p>
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{s.observacoes}</p>
        </div>
      )}
    </div>
  );
}
