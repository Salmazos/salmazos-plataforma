// Catálogo dos avisos configuráveis em Configurações > Avisos (Fase 1: vagas, rescisão, ASO).
// Módulo puro: usado no client, no server e no script de verificação.

export type GrupoAviso = "vagas" | "rescisao" | "aso" | "portal_cliente" | "avisos_cliente";

export const EVENTOS_POR_GRUPO: Record<GrupoAviso, string[]> = {
  vagas: ["vaga_criada", "vaga_reativada", "vaga_fechada", "vaga_cancelada", "solicitacao_vaga"],
  rescisao: ["rescisao_lancamento", "rescisao_vencimento_rescisao", "rescisao_vencimento_guia", "rescisao_paga"],
  aso: ["aso_periodico_sem_registro", "aso_periodico_vencendo", "aso_periodico_atrasado"],
  portal_cliente: [
    "indicacao_candidato_recebida",
    "solicitacao_alteracao_pedida",
    "vaga_reativacao_pedida",
    "vaga_pausa_pedida",
    "agendamento_cliente",
    "portal_candidato_aprovado",
    "portal_candidato_reprovado",
    "indicacao_decisao_cliente",
  ],
  // Avisos que a Salmazos dá AO CLIENTE (sino e popup no portal). Sem lista de pessoas: quem recebe é todo
  // usuário do portal do cliente do aviso, então a tela só liga e desliga cada canal.
  avisos_cliente: ["indicacao_decidida_cliente", "candidato_enviado_cliente"],
};

// Eventos sem lista de destinatários (só liga/desliga por canal). A tela não mostra lista nem
// formulário de adicionar, e a API recusa adicionar destinatário a eles.
export const EVENTOS_SEM_LISTA: readonly string[] = EVENTOS_POR_GRUPO.avisos_cliente;
export const eventoSemLista = (evento: string): boolean => EVENTOS_SEM_LISTA.includes(evento);

// Pedidos do cliente que ficam pendentes até a Salmazos decidir (alteração de solicitação, reativação e
// encerramento de vaga). Os três compartilham o popup "Pedidos do cliente", mas cada um tem a
// sua própria lista de destinatários.
export const EVENTOS_PEDIDO_CLIENTE = ["solicitacao_alteracao_pedida", "vaga_reativacao_pedida", "vaga_pausa_pedida"] as const;

export const ROTULO_GRUPO: Record<GrupoAviso, string> = {
  vagas: "Vagas",
  rescisao: "Rescisão",
  aso: "ASO periódico",
  portal_cliente: "Portal do cliente",
  avisos_cliente: "Avisos ao cliente",
};

export const ROTULO_EVENTO: Record<string, string> = {
  vaga_criada: "Nova vaga criada",
  vaga_reativada: "Vaga reativada",
  vaga_fechada: "Vaga fechada",
  vaga_cancelada: "Vaga cancelada",
  solicitacao_vaga: "Solicitação de vaga (cliente)",
  rescisao_lancamento: "Rescisão lançada",
  rescisao_vencimento_rescisao: "Pagamento de rescisão vence hoje",
  rescisao_vencimento_guia: "Pagamento de guia vence hoje",
  rescisao_paga: "Rescisão paga",
  aso_periodico_sem_registro: "ASO periódico sem registro",
  aso_periodico_vencendo: "ASO periódico vencendo",
  aso_periodico_atrasado: "ASO periódico em atraso",
  portal_candidato_aprovado: "Cliente aprovou candidato (portal)",
  portal_candidato_reprovado: "Cliente reprovou candidato (portal)",
  indicacao_decisao_cliente: "Indicação direta aprovada pela Salmazos",
  indicacao_candidato_recebida: "Cliente enviou indicação direta de candidato",
  solicitacao_alteracao_pedida: "Cliente pediu alteração numa solicitação de vaga",
  vaga_reativacao_pedida: "Cliente pediu reativação de vaga",
  vaga_pausa_pedida: "Cliente pediu encerramento de vaga",
  agendamento_cliente: "Cliente agendou entrevista (quando o candidato não tem responsável)",
  indicacao_decidida_cliente: "Indicação direta decidida pela Salmazos",
  candidato_enviado_cliente: "Candidato enviado ao cliente",
};

// Canais que cada aviso realmente tem hoje (espelha aviso_eventos.canais_suportados). O que não
// está aqui suporta e-mail e sino.
export const CANAIS_POR_EVENTO: Record<string, readonly ("email" | "sino" | "popup")[]> = {
  indicacao_candidato_recebida: ["email", "sino", "popup"],
  solicitacao_vaga: ["email", "sino", "popup"],
  solicitacao_alteracao_pedida: ["email", "sino", "popup"],
  vaga_reativacao_pedida: ["email", "sino", "popup"],
  vaga_pausa_pedida: ["email", "sino", "popup"],
  agendamento_cliente: ["email", "sino"],
  indicacao_decidida_cliente: ["sino", "popup"],
  candidato_enviado_cliente: ["sino", "popup"],
  rescisao_paga: ["sino"],
  portal_candidato_aprovado: ["email"],
  portal_candidato_reprovado: ["email"],
  indicacao_decisao_cliente: ["email"],
};

export function canaisDoEvento(evento: string): readonly ("email" | "sino" | "popup")[] {
  return CANAIS_POR_EVENTO[evento] ?? CANAIS_FASE1;
}

// Explicações mostradas na tela, onde o aviso foge do padrão "lista por canal".
const NOTA_POPUP_PEDIDOS =
  "O popup \"Pedidos do cliente\" lista os pedidos pendentes quando a pessoa entra no painel, abre uma vez por pessoa para cada pedido novo (clicar no card marca só aquele; Ok e X marcam todos os listados) e reaparece só se chegar outro pedido pendente. Quem não está na lista do popup não vê o popup (e com o popup desligado ninguém vê). O filtro de unidade é regra fixa: só recebem quem atende a unidade do cliente.";

export const NOTA_EVENTO: Record<string, string> = {
  candidato_enviado_cliente:
    "Avisa o cliente, no portal, quando a Salmazos envia um candidato para ele avaliar (ação \"Encaminhar\" do Kanban). O aviso traz o nome do candidato, a vaga e, se já houver, a data da entrevista; o clique leva ao perfil do candidato no portal. Avisa no primeiro envio e quando um candidato já avaliado é enviado de novo; não avisa de novo se o candidato continua pendente para o cliente. O sino fica no topo do portal; o popup abre uma vez por aviso novo, quando o usuário entra. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. O e-mail ao contato do cliente não muda. Sem configuração ou com o canal desligado, ninguém recebe.",
  indicacao_decidida_cliente:
    "Avisa o cliente, no portal, quando a Salmazos aprova ou recusa uma indicação direta que ele enviou. Na recusa, o aviso traz o motivo (o mesmo que o cliente já vê em Minhas Indicações). O sino fica no topo do portal; o popup abre uma vez por aviso novo, quando o usuário entra. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. Sem configuração ou com o canal desligado, ninguém recebe.",
  solicitacao_vaga:
    "Dispara quando o cliente envia uma nova solicitação de vaga pelo portal. O popup lista as solicitações pendentes quando a pessoa entra no painel e abre uma vez por pessoa para cada solicitação nova; clicar abre a solicitação. Sem destinatários na lista do popup, vale o padrão antigo: todos os analistas ativos da unidade veem o popup. Com o popup desligado ninguém vê. O filtro de unidade é regra fixa. O alerta \"Falha ao notificar por e-mail\" (só superuser) continua fixo.",
  solicitacao_alteracao_pedida: `Dispara quando o cliente pede uma alteração numa solicitação de vaga que já enviou (fica pendente até a Salmazos aprovar ou recusar). O sino leva à solicitação. ${NOTA_POPUP_PEDIDOS}`,
  vaga_reativacao_pedida: `Dispara quando o cliente pede a reativação de uma vaga pausada (fica pendente até a Salmazos decidir). O sino leva à solicitação. ${NOTA_POPUP_PEDIDOS}`,
  vaga_pausa_pedida: `Dispara quando o cliente pede o encerramento de uma vaga pelo portal (o pedido fica pendente até a Salmazos decidir). Aprovar ou recusar o pedido é feito no painel de Vagas, na solicitação. O sino leva à solicitação. ${NOTA_POPUP_PEDIDOS}`,
  agendamento_cliente:
    "Dispara quando o cliente confirma a data da entrevista no portal e o candidato NÃO tem responsável definido. Quando o candidato tem responsável, o aviso vai só para ele (sino e e-mail) e essa regra continua fixa — não passa por esta lista. O filtro de unidade desta lista é fixo.",
  indicacao_candidato_recebida:
    "Dispara quando o cliente envia uma indicação direta pelo portal. O popup lista as indicações pendentes quando a pessoa entra no painel e reaparece no próximo login enquanto houver pendente que ela não tenha dispensado; clicar abre a indicação. Quem não está na lista do popup não vê o popup (e com o popup desligado ninguém vê). O filtro de unidade é regra fixa: só recebem quem atende a unidade do cliente.",
  rescisao_paga: "Hoje este aviso só existe no sino (e no popup de login, que deriva dele).",
  portal_candidato_aprovado:
    "O sino desta aprovação continua indo para o responsável pelo candidato (regra fixa, não é lista) — por isso só o e-mail é configurável.",
  portal_candidato_reprovado:
    "Hoje não existe e-mail interno de reprovação (o sino vai para o responsável pelo candidato, regra fixa). Vem desligado: ao ligar, os destinatários abaixo passam a receber um e-mail a cada reprovação feita pelo cliente.",
  indicacao_decisao_cliente:
    "E-mail enviado quando a Salmazos aprova uma indicação direta do cliente (traz os dados de admissão). Não há sino neste aviso.",
};

export const CANAIS_FASE1 = ["email", "sino"] as const;
export type CanalFase1 = (typeof CANAIS_FASE1)[number];
export const ROTULO_CANAL: Record<string, string> = { email: "E-mail", sino: "Sino", popup: "Popup" };

export function grupoDoEvento(evento: string): GrupoAviso | null {
  for (const g of Object.keys(EVENTOS_POR_GRUPO) as GrupoAviso[]) {
    if (EVENTOS_POR_GRUPO[g].includes(evento)) return g;
  }
  return null;
}

// O que significa "sem destinatários na lista" (modo legado) em cada grupo — mostrado na tela.
export const FRASE_SEM_LISTA = "Ligado: todos os usuários do portal do cliente recebem. Desligado: ninguém.";

export function descricaoPadraoDoSistema(grupo: GrupoAviso, canal: string, evento = ""): string {
  if (eventoSemLista(evento)) return FRASE_SEM_LISTA;
  if (evento === "solicitacao_vaga" && canal === "popup") {
    return "Sem destinatários: vale o padrão antigo, todos os analistas ativos da unidade veem o popup.";
  }
  if ((EVENTOS_PEDIDO_CLIENTE as readonly string[]).includes(evento) && canal === "popup") {
    return "Sem destinatários: ninguém vê o popup.";
  }
  if (evento === "agendamento_cliente" || (EVENTOS_PEDIDO_CLIENTE as readonly string[]).includes(evento)) {
    return canal === "email"
      ? "Padrão do sistema: todos os analistas da unidade recebem."
      : "Padrão do sistema: aviso geral no sino para os analistas da unidade.";
  }
  if (evento === "indicacao_candidato_recebida") {
    return canal === "popup"
      ? "Sem destinatários: ninguém vê o popup."
      : "Padrão do sistema: todos os analistas da unidade do cliente recebem.";
  }
  if (grupo === "portal_cliente") {
    return evento === "portal_candidato_reprovado"
      ? "Sem destinatários: ninguém recebe."
      : "Padrão do sistema: Olver e RH (olver@ e rh@) recebem.";
  }
  if (grupo === "vagas") {
    return canal === "email"
      ? "Padrão do sistema: todos os analistas da unidade recebem."
      : "Padrão do sistema: aviso geral no sino para os analistas da unidade.";
  }
  return "Sem destinatários: ninguém recebe.";
}
