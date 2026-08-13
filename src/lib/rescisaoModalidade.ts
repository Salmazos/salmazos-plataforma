// Rótulos amigáveis de rescisoes.modalidade — fonte única, usada tanto na tabela de
// Rescisões (RescisoesPageClient.tsx) quanto no e-mail de rescisão lançada
// (dispararAvisosRescisao.ts), pra nunca divergir entre os dois lugares.
export const RESCISAO_MODALIDADE_LABEL: Record<string, string> = {
  pedido_demissao: "Pedido de demissão",
  desligamento_pela_empresa: "Desligamento pela empresa",
  efetivado: "Efetivado",
};
