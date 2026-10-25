import Link from "next/link";
import ConteudoEnviado from "./solicitacao-publica/ConteudoEnviado";
import { ESTILOS } from "./solicitacao-publica/estilos";
import { PADROES_RS } from "@/lib/propostaModelos";

// Confirmação de envio da solicitação de vaga no portal: o mesmo conteúdo do link público (para R&S, terceirização e temporário), dentro de um
// cartão do portal. O prazo de currículos é o padrão das condições da proposta (PADROES_RS), a mesma origem do link quando o analista não o altera.
export default function PortalSolicitacaoEnviada() {
  return (
    <div className="max-w-xl mx-auto mt-12">
      <style>{ESTILOS}</style>
      <div className="sp-subir bg-white rounded-2xl shadow-sm p-8 text-center">
        <ConteudoEnviado prazoDiasUteis={PADROES_RS.prazo_envio_curriculos_dias_uteis} textoFinal="Você pode acompanhar o andamento no painel." />
        <Link href="/portal" className="mt-6 inline-block px-6 py-2.5 bg-black text-[#FFD700] rounded-xl font-semibold text-sm">
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
