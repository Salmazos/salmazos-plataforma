import { getEtapaInfo } from "@/lib/etapasCandidatura";

interface Props {
  etapaAtual: string;
}

// Só exibe a fase atual — NÃO é mais editável aqui (era um <select> solto que
// mudava a etapa direto por /api/candidatos/[id]/etapa, sem passar pelas travas do
// Kanban/tela de Vaga: pulava o modal de encaminhamento e o de finalização,
// deixando candidato virar "Contratado" sem nunca gerar o registro que o portal do
// cliente lê — ver correção de ago/2026). Mover um candidato de etapa agora só é
// possível pelo Kanban ou pela tela de Vaga, que têm a lógica correta.
export default function PerfilEtapaSelector({ etapaAtual }: Props) {
  const etapa = getEtapaInfo(etapaAtual);

  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: etapa.bg, color: etapa.color }}
    >
      {etapa.label}
    </span>
  );
}
