// Catálogo dos avisos configuráveis em Configurações > Avisos (Fase 1: vagas, rescisão, ASO).
// Módulo puro: usado no client, no server e no script de verificação.

// Avisos INTERNOS que ainda estavam fixos no código e passaram a ter interruptores e lista (grupo Vagas). Fonte única de
// rótulo, canais, nota e texto do padrão do sistema de cada um. Sino e popup deles podem ficar ligados com a lista VAZIA
// (quem já era avisado sempre é) e o popup é só interruptor.
type CanalRestante = "email" | "sino" | "popup";
export const AVISOS_RESTANTES: Record<string, { rotulo: string; canais: readonly CanalRestante[]; nota: string; padrao: Partial<Record<CanalRestante, string>> }> = {
  candidato_transferido: {
    rotulo: "Candidato transferido (troca de responsável)",
    canais: ["sino"],
    nota: "Dispara quando alguém troca o responsável de um candidato. Sino: com o canal ligado o responsável ANTIGO e o NOVO são sempre avisados, além das pessoas da lista (a lista pode ficar vazia); desligado, ninguém recebe. Não envia e-mail nem popup.",
    padrao: { sino: "Ligado, sem ninguém na lista: só o responsável antigo e o novo são avisados. Desligado: ninguém." },
  },
  candidato_curriculo_atualizado: {
    rotulo: "Currículo atualizado pelo candidato",
    canais: ["sino"],
    nota: "Dispara quando um candidato já cadastrado reenvia o currículo e o sistema identifica uma atualização relevante. Sino: com o canal ligado o responsável pelo candidato SEMPRE é avisado, além das pessoas da lista (a lista pode ficar vazia); sem responsável, vai um aviso geral para todos, como sempre. Desligado, ninguém recebe. Não envia e-mail nem popup.",
    padrao: { sino: "Ligado, sem ninguém na lista: só o responsável pelo candidato é avisado (sem responsável, aviso geral para todos). Desligado: ninguém." },
  },
  funcionario_nao_criado: {
    rotulo: "Funcionário não criado automaticamente (admissão)",
    canais: ["sino"],
    nota: "Dispara quando o pacote de admissão é gerado, mas o registro em Funcionários não é criado automaticamente (o RH precisa criar à mão). Sino: aviso geral para todos (sem unidade, de propósito: o RH é centralizado), além das pessoas da lista; não repete o mesmo aviso em 24 horas; desligado, ninguém recebe. A auditoria continua sempre.",
    padrao: { sino: "Ligado, sem ninguém na lista: aviso geral para todos, como sempre. Desligado: ninguém." },
  },
  lembrete_agendamento_pendente_analista: {
    rotulo: "Lembrete ao analista: cliente ainda não marcou a entrevista",
    canais: ["sino", "email"],
    nota: "Dispara pelo cron diário (6h), a cada 48 horas, enquanto o cliente não marca a entrevista de um candidato que está aguardando agendamento (o lembrete ao CLIENTE é outro aviso, em E-mails ao cliente). Com o canal ligado, o responsável ativo pelo candidato SEMPRE é avisado (sino e e-mail), além das pessoas da lista; sem responsável, vai um aviso geral para a equipe da unidade do cliente (ou só para a lista, no e-mail, se houver). Com o Sino ou o E-mail desligado, ninguém recebe aquele canal. Se o e-mail ao cliente falha e o cron tenta de novo no dia seguinte, o analista não é avisado de novo antes de 40 horas.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: só o responsável pelo candidato é avisado (sem responsável, aviso geral da unidade do cliente). Desligado: ninguém.",
      email: "Sem ninguém na lista: o responsável pelo candidato recebe (sem responsável, todos os analistas da unidade), como sempre. Com lista: o responsável, quando existe, mais a lista.",
    },
  },
  lembrete_comercial: {
    rotulo: "Lembrete do Comercial (empresas esperando retorno)",
    canais: ["sino", "popup"],
    nota: "Aviso diário (cron das 6h) para cada vendedor com lembrete do Comercial vencido ou de hoje: um aviso por vendedor por dia, que se repete todos os dias enquanto houver pendente e some quando o vendedor conclui, adia ou cancela. Sino: com o canal ligado o PRÓPRIO vendedor sempre é avisado; quem estiver na lista (por exemplo a gestão comercial) recebe o mesmo aviso com o nome do vendedor (a lista pode ficar vazia). Popup: só interruptor; o popup do vendedor lista os lembretes vencidos quando ele entra no painel, uma vez por dia. Desligado, ninguém recebe aquele canal.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: só o próprio vendedor é avisado. Desligado: ninguém.",
      popup: "Ligado: o vendedor vê o popup dos lembretes vencidos ao entrar no painel (uma vez por dia). Desligado, ou sem esta configuração: ninguém vê o popup.",
    },
  },
  supervisao_cliente_atrasada: {
    rotulo: "Supervisão de cliente atrasada",
    canais: ["sino", "email", "popup"],
    nota: "Aviso diário (cron das 6h) quando a última supervisão de um cliente com meta passou da frequência definida (ou nunca houve), repetido a cada 2 dias enquanto continuar atrasado. Sino: com o canal ligado a diretoria/superuser e o supervisor responsável do cliente sempre são avisados, além das pessoas da lista (a lista pode ficar vazia). E-mail: sem ninguém na lista vale o padrão (só o supervisor responsável); com lista, só a lista. Se o canal falhar para todos, o aviso é tentado de novo na execução seguinte. Popup: só interruptor; é o popup de supervisões pendentes, uma vez por dia por usuário. Desligado, ninguém recebe aquele canal.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: diretoria/superuser e o supervisor responsável são avisados, como sempre. Desligado: ninguém.",
      email: "Sem ninguém na lista: só o supervisor responsável do cliente recebe, como sempre. Com lista: só a lista.",
      popup: "Ligado: o popup de supervisões pendentes abre uma vez por dia para quem tem acesso. Desligado, ou sem esta configuração: ninguém vê o popup.",
    },
  },
  conta_receber_hortolandia_atrasada: {
    rotulo: "Faturamento atrasado (contas a receber das unidades)",
    canais: ["sino", "popup"],
    nota: "Aviso diário (cron das 6h) quando um lançamento de Faturamento Unidades fica vencido e pendente: um aviso só por lançamento, nunca repetido. Sino: com o canal ligado a diretoria/superuser sempre é avisada, além das pessoas da lista (a lista pode ficar vazia); a mensagem traz cliente, NF e vencimento, nunca o valor. Sem ninguém a quem avisar, o aviso é tentado de novo no dia seguinte. Popup: só interruptor; é o popup de faturamento vencido, que o usuário dispensa uma vez por lançamento. Desligado, ninguém recebe aquele canal.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: só a diretoria/superuser é avisada, como sempre. Desligado: ninguém.",
      popup: "Ligado: o popup de faturamento vencido abre para quem tem acesso ao módulo. Desligado, ou sem esta configuração: ninguém vê o popup.",
    },
  },
  fee_rs_nao_configurado: {
    rotulo: "Taxa de R&S não configurada (vaga sem fee)",
    canais: ["sino"],
    nota: "Dispara quando uma vaga de Recrutamento e Seleção está sem a taxa (%) configurada: na aprovação do cliente pelo portal, ao gerar a cobrança de uma contratação e ao gerar a cobrança de um cancelamento. Só avisa: o cliente continua aprovando normalmente e o fee não é calculado. Sino: aviso geral para a equipe da unidade (como sempre), além das pessoas da lista (a lista pode ficar vazia); na geração de cobrança o mesmo aviso não se repete em 24 horas; desligado, ninguém recebe. Não envia e-mail nem popup.",
    padrao: { sino: "Ligado, sem ninguém na lista: aviso geral para a equipe da unidade, como sempre. Desligado: ninguém." },
  },
  aniversario_mes_seguinte: {
    rotulo: "Aniversariantes do mês seguinte (lista mensal)",
    canais: ["email"],
    nota: "E-mail único por unidade, 3 dias antes do fim do mês, com os contatos de clientes que fazem aniversário no mês seguinte (cron das 6h). Sem ninguém na lista vale o padrão (todos os analistas da unidade e os sócios); com lista, só a lista. Se ninguém aceitar o e-mail, ele é tentado de novo na execução seguinte. Desligado, ninguém recebe.",
    padrao: { email: "Sem ninguém na lista: todos os analistas da unidade e os sócios recebem, como sempre. Com lista: só a lista." },
  },
  aniversario_tres_dias: {
    rotulo: "Aniversário de contato de cliente: faltam 3 dias",
    canais: ["sino", "email"],
    nota: "Aviso (cron das 6h) 3 dias antes do aniversário de um contato de cliente; se o cron falhou, recupera até 2 dias depois (o texto passa a dizer quantos dias faltam) e cada contato é avisado uma vez por ano. Sino: aviso geral para a equipe da unidade do contato (como sempre), além das pessoas da lista (a lista pode ficar vazia). E-mail: sem ninguém na lista vale o padrão (todos os analistas da unidade e os sócios); com lista, só a lista. Desligado, ninguém recebe aquele canal.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: aviso geral para a equipe da unidade do contato, como sempre. Desligado: ninguém.",
      email: "Sem ninguém na lista: todos os analistas da unidade e os sócios recebem, como sempre. Com lista: só a lista.",
    },
  },
  aniversario_no_dia: {
    rotulo: "Aniversário de contato de cliente: hoje",
    canais: ["sino", "email", "popup"],
    nota: "Aviso (cron das 6h) no dia do aniversário de um contato de cliente; se o cron falhou, recupera até 2 dias depois (o texto passa a dizer a data) e cada contato é avisado uma vez por ano. O e-mail traz o e-mail e o telefone do contato. Sino: aviso geral para a equipe da unidade do contato (como sempre), além das pessoas da lista (a lista pode ficar vazia). E-mail: sem ninguém na lista vale o padrão (todos os analistas da unidade e os sócios); com lista, só a lista. Popup: só interruptor; é o popup de aniversariantes de hoje, uma vez por dia por usuário. Desligado, ninguém recebe aquele canal.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: aviso geral para a equipe da unidade do contato, como sempre. Desligado: ninguém.",
      email: "Sem ninguém na lista: todos os analistas da unidade e os sócios recebem, como sempre. Com lista: só a lista.",
      popup: "Ligado: o popup de aniversariantes de hoje abre uma vez por dia para quem tem acesso. Desligado, ou sem esta configuração: ninguém vê o popup.",
    },
  },
  // Cobrança R&S (avisos internos; o dinheiro em si não passa por aqui): só o e-mail, exceto o atraso, que também tem sino.
  cobranca_rs_gerada: {
    rotulo: "Cobrança R&S gerada (aprovação e reenvio)",
    canais: ["email"],
    nota: "E-mail interno quando a cobrança é aprovada e enviada, e de novo a cada reenvio manual do aviso. Sem ninguém na lista, vai para a diretoria, os superusers e o analista que revisou a cobrança (se tiver acesso à Cobrança R&S); com lista, só para a lista. Desligado, ninguém recebe. Não envia sino nem popup.",
    padrao: { email: "Sem ninguém na lista: diretoria, superusers e o revisor da cobrança recebem, como sempre. Com lista: só a lista. Desligado: ninguém." },
  },
  cobranca_rs_validada: {
    rotulo: "Cobrança R&S validada pela diretoria",
    canais: ["email"],
    nota: "E-mail ao analista que revisou a cobrança, na primeira vez que a diretoria define o vencimento (correções da data depois não avisam de novo). Sem ninguém na lista, só o revisor da cobrança recebe; com lista, só a lista. Desligado, ninguém recebe. Não envia sino nem popup.",
    padrao: { email: "Sem ninguém na lista: só o revisor da cobrança recebe, como sempre. Com lista: só a lista. Desligado: ninguém." },
  },
  cobranca_rs_paga: {
    rotulo: "Cobrança R&S paga",
    canais: ["email"],
    nota: "Por padrão avisa o revisor da cobrança, sem diretoria: se o revisor for da diretoria ou superuser, ou a cobrança não tiver revisor, ninguém recebe. Com lista no canal e-mail, só a lista. Desligado, ninguém recebe. Não envia sino nem popup.",
    padrao: { email: "Sem ninguém na lista: só o revisor da cobrança (nunca diretoria ou superuser), como sempre. Com lista: só a lista. Desligado: ninguém." },
  },
  cobranca_rs_cancelada: {
    rotulo: "Cobrança R&S cancelada",
    canais: ["email"],
    nota: "E-mail interno quando uma cobrança é cancelada com justificativa. Sem ninguém na lista, vai para a diretoria, os superusers e quem cancelou (se tiver acesso à Cobrança R&S); com lista, só para a lista. Desligado, ninguém recebe. Não envia sino nem popup.",
    padrao: { email: "Sem ninguém na lista: diretoria, superusers e quem cancelou recebem, como sempre. Com lista: só a lista. Desligado: ninguém." },
  },
  cobranca_rs_atrasada: {
    rotulo: "Cobrança R&S atrasada",
    canais: ["sino", "email"],
    nota: "Aviso (cron das 6h) de cobrança validada com vencimento passado e ainda não paga; repete a cada 2 dias até o pagamento, sem limite. Sino: diretoria, superusers e o revisor com acesso, além das pessoas da lista (a lista pode ficar vazia); desligado, ninguém recebe. E-mail: os mesmos de sempre; com lista, só a lista. O lembrete só é dado como feito quando algo foi entregue (sino ou e-mail) ou todos os canais estão desligados; senão tenta de novo na próxima execução. Não envia popup.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: diretoria, superusers e o revisor com acesso são avisados, como sempre. Desligado: ninguém.",
      email: "Sem ninguém na lista: diretoria, superusers e o revisor com acesso recebem, como sempre. Com lista: só a lista. Desligado: ninguém.",
    },
  },
  cobranca_rs_pendente_revisao: {
    rotulo: "Cobrança R&S pendente de revisão (rascunho criado)",
    canais: ["sino"],
    nota: "Avisa no sino, assim que o rascunho de uma cobrança R&S é criado (contratação com resposta \"sim\" à cobrança, ou cancelamento de vaga com taxa), que há uma cobrança aguardando revisão. Vai para a diretoria, os superusers e quem tem acesso à Cobrança R&S, menos quem gerou a cobrança (que já abre a revisão na hora), mais as pessoas da lista (a lista pode ficar vazia). Desligado, ninguém recebe. Não envia e-mail nem popup. Não repete: avisa uma vez, quando o rascunho nasce.",
    padrao: { sino: "Ligado, sem ninguém na lista: diretoria, superusers e quem tem acesso à Cobrança R&S (menos quem gerou) são avisados. Desligado: ninguém." },
  },
  cobranca_rs_aguardando_validacao: {
    rotulo: "Cobrança R&S parada em Aguardando validação",
    canais: ["sino", "email"],
    nota: "Lembrete (cron das 6h) de cobrança em Aguardando validação sem data de vencimento definida, enviada há 2 dias ou mais; repete a cada 2 dias, sem limite, até o vencimento ser definido (validada) ou a cobrança ser cancelada. Vai para quem pode definir o vencimento: diretoria, superusers, quem tem acesso à Cobrança R&S e quem gerou a cobrança. Sino: esses mais a lista (pode ficar vazia). E-mail: os mesmos; com lista, só a lista. Desligado, ninguém recebe. O lembrete só é dado como feito quando algo foi entregue (sino ou e-mail) ou todos os canais estão desligados; senão tenta de novo na próxima execução. Não envia popup.",
    padrao: {
      sino: "Ligado, sem ninguém na lista: quem pode definir o vencimento é avisado, como sempre. Desligado: ninguém.",
      email: "Sem ninguém na lista: quem pode definir o vencimento recebe, como sempre. Com lista: só a lista. Desligado: ninguém.",
    },
  },
};
export const EVENTOS_AVISOS_RESTANTES: string[] = Object.keys(AVISOS_RESTANTES);
export const eventoAvisoRestante = (evento: string): boolean => Object.prototype.hasOwnProperty.call(AVISOS_RESTANTES, evento);

export type GrupoAviso = "vagas" | "rescisao" | "aso" | "portal_cliente" | "avisos_cliente";

export const EVENTOS_POR_GRUPO: Record<GrupoAviso, string[]> = {
  vagas: ["vaga_criada", "vaga_reativada", "vaga_fechada", "vaga_cancelada", "solicitacao_vaga", "garantia_rs_vencendo", "garantia_rs_acionada", "pos_venda_rs_7dias", ...EVENTOS_AVISOS_RESTANTES],
  rescisao: ["rescisao_lancamento", "rescisao_vencimento_rescisao", "rescisao_vencimento_guia", "rescisao_paga"],
  aso: ["aso_periodico_sem_registro", "aso_periodico_vencendo", "aso_periodico_atrasado"],
  portal_cliente: [
    "indicacao_candidato_recebida",
    "indicacao_candidato_editada_cliente",
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
  avisos_cliente: [
    "indicacao_decidida_cliente",
    "candidato_enviado_cliente",
    "entrevista_agendada_cliente",
    "entrevista_remarcada_cliente",
    "solicitacao_vaga_decidida_cliente",
    "pedido_vaga_decidido_cliente",
  ],
};

// E-mails que a Salmazos envia AO CLIENTE (canal único: e-mail). Também pertencem ao grupo avisos_cliente e
// também não têm lista de pessoas (vão para o login de cada usuário do portal; sem usuário, para o contato do
// cliente), mas ficam numa seção própria da aba. Semântica do liga/desliga INVERSA à de sino e popup: o e-mail
// já existia antes do interruptor, então sem linha de canal = LIGADO (ver emailClienteLigado).
export const EVENTOS_EMAIL_CLIENTE = [
  "email_cliente_candidato_entrevista",
  "email_cliente_lembrete_entrevista_hoje",
  "email_cliente_vaga_aprovada",
  "email_cliente_vaga_status_decidido",
  "email_cliente_solicitacao_recusada",
  "email_cliente_alteracao_decidida",
  "email_cliente_lembrete_agendamento",
] as const;
export const eventoEmailCliente = (evento: string): boolean => (EVENTOS_EMAIL_CLIENTE as readonly string[]).includes(evento);

// Eventos "o cliente aprovou/reprovou um candidato" (grupo portal_cliente): e-mail (lista, como sempre), sino
// (responsável do candidato + lista) e popup (só interruptor: segue as linhas nominais do sino).
export const EVENTOS_DECISAO_CLIENTE = ["portal_candidato_aprovado", "portal_candidato_reprovado"] as const;
export const eventoDecisaoCliente = (evento: string): boolean => (EVENTOS_DECISAO_CLIENTE as readonly string[]).includes(evento);
// Avisos internos da garantia R&S (grupo vagas): e-mail (lista; sem lista vale o comportamento de sempre), sino
// (responsável do candidato + lista) e popup (só interruptor: segue as linhas nominais do sino).
export const EVENTOS_GARANTIA_RS = ["garantia_rs_vencendo", "garantia_rs_acionada"] as const;
export const eventoGarantiaRS = (evento: string): boolean => (EVENTOS_GARANTIA_RS as readonly string[]).includes(evento);
// Pós-venda R&S (grupo vagas): e-mail (lista; sem lista vale o comportamento de sempre), sino (os destinatários de
// sempre, responsável comercial do cliente ou time comercial da unidade, mais a lista) e popup (só interruptor).
export const EVENTO_POS_VENDA_RS = "pos_venda_rs_7dias";
export const eventoPosVendaRS = (evento: string): boolean => evento === EVENTO_POS_VENDA_RS;
// Eventos cujo sino SEMPRE avisa quem já era avisado (responsável do candidato, ou responsável comercial no pós-venda),
// mais a lista, e cujo popup segue o sino.
export const eventoComResponsavelNoSino = (evento: string): boolean => eventoDecisaoCliente(evento) || eventoGarantiaRS(evento) || eventoPosVendaRS(evento) || eventoAvisoRestante(evento);
// Sino e popup destes eventos podem ficar ligados com a lista VAZIA (o responsável sempre é avisado): a regra do
// último destinatário e a restauração do padrão não se aplicam a eles.
export const canalSemListaPermitido = (evento: string, canal: string): boolean =>
  eventoComResponsavelNoSino(evento) && (canal === "sino" || canal === "popup");
// O popup destes eventos não tem lista própria: a tela só mostra o interruptor.
export const canalSoInterruptor = (evento: string, canal: string): boolean => eventoComResponsavelNoSino(evento) && canal === "popup";
// Como a tela mostra o canal quando NÃO há linha em aviso_eventos_canais (coerente com o código que envia).
export function ligadoSemLinha(evento: string, canal: string): boolean {
  if (eventoComResponsavelNoSino(evento)) return canal !== "popup"; // e-mail e sino seguem ligados; popup só com linha
  return canal === "email" || !eventoSemLista(evento);
}

// Eventos sem lista de destinatários (só liga/desliga por canal). A tela não mostra lista nem
// formulário de adicionar, e a API recusa adicionar destinatário a eles.
export const EVENTOS_SEM_LISTA: readonly string[] = [...EVENTOS_POR_GRUPO.avisos_cliente, ...EVENTOS_EMAIL_CLIENTE];
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
  indicacao_candidato_editada_cliente: "Cliente editou uma indicação direta de candidato",
  solicitacao_alteracao_pedida: "Cliente pediu alteração numa solicitação de vaga",
  vaga_reativacao_pedida: "Cliente pediu reativação de vaga",
  vaga_pausa_pedida: "Cliente pediu encerramento de vaga",
  agendamento_cliente: "Cliente agendou entrevista",
  indicacao_decidida_cliente: "Indicação direta decidida pela Salmazos",
  candidato_enviado_cliente: "Candidato enviado ao cliente",
  entrevista_agendada_cliente: "Entrevista agendada",
  entrevista_remarcada_cliente: "Entrevista remarcada",
  solicitacao_vaga_decidida_cliente: "Solicitação de vaga decidida",
  pedido_vaga_decidido_cliente: "Pedido do cliente decidido",
  email_cliente_candidato_entrevista: "Candidato em entrevista com o cliente",
  email_cliente_lembrete_entrevista_hoje: "Lembrete de entrevista hoje (cron diário)",
  email_cliente_vaga_aprovada: "Vaga aprovada (solicitação do cliente)",
  email_cliente_vaga_status_decidido: "Pedido de encerramento ou reativação decidido",
  email_cliente_solicitacao_recusada: "Solicitação de vaga recusada",
  email_cliente_alteracao_decidida: "Pedido de alteração decidido (aprovado ou recusado)",
  email_cliente_lembrete_agendamento: "Lembrete para o cliente agendar a entrevista (cron diário)",
  garantia_rs_vencendo: "Garantia R&S vencendo (último dia)",
  garantia_rs_acionada: "Garantia R&S acionada (reposição gratuita)",
  pos_venda_rs_7dias: "Pós-venda R&S (7 dias após o início do candidato)",
  ...Object.fromEntries(Object.entries(AVISOS_RESTANTES).map(([k, v]) => [k, v.rotulo])),
};

// Canais que cada aviso realmente tem hoje (espelha aviso_eventos.canais_suportados). O que não
// está aqui suporta e-mail e sino.
export const CANAIS_POR_EVENTO: Record<string, readonly ("email" | "sino" | "popup")[]> = {
  indicacao_candidato_recebida: ["email", "sino", "popup"],
  indicacao_candidato_editada_cliente: ["email", "sino"],
  solicitacao_vaga: ["email", "sino", "popup"],
  solicitacao_alteracao_pedida: ["email", "sino", "popup"],
  vaga_reativacao_pedida: ["email", "sino", "popup"],
  vaga_pausa_pedida: ["email", "sino", "popup"],
  agendamento_cliente: ["email", "sino"],
  indicacao_decidida_cliente: ["sino", "popup"],
  candidato_enviado_cliente: ["sino", "popup"],
  entrevista_agendada_cliente: ["sino", "popup"],
  entrevista_remarcada_cliente: ["sino", "popup"],
  solicitacao_vaga_decidida_cliente: ["sino", "popup"],
  pedido_vaga_decidido_cliente: ["sino", "popup"],
  email_cliente_candidato_entrevista: ["email"],
  email_cliente_lembrete_entrevista_hoje: ["email"],
  email_cliente_vaga_aprovada: ["email"],
  email_cliente_vaga_status_decidido: ["email"],
  email_cliente_solicitacao_recusada: ["email"],
  email_cliente_alteracao_decidida: ["email"],
  email_cliente_lembrete_agendamento: ["email"],
  rescisao_paga: ["sino"],
  portal_candidato_aprovado: ["email", "sino", "popup"],
  portal_candidato_reprovado: ["email", "sino", "popup"],
  garantia_rs_vencendo: ["email", "sino", "popup"],
  garantia_rs_acionada: ["email", "sino", "popup"],
  pos_venda_rs_7dias: ["email", "sino", "popup"],
  ...Object.fromEntries(Object.entries(AVISOS_RESTANTES).map(([k, v]) => [k, v.canais])),
  indicacao_decisao_cliente: ["email"],
};

export function canaisDoEvento(evento: string): readonly ("email" | "sino" | "popup")[] {
  return CANAIS_POR_EVENTO[evento] ?? CANAIS_FASE1;
}

// Explicações mostradas na tela, onde o aviso foge do padrão "lista por canal".
const NOTA_POPUP_PEDIDOS =
  "O popup \"Pedidos do cliente\" lista os pedidos pendentes quando a pessoa entra no painel, abre uma vez por pessoa para cada pedido novo (clicar no card marca só aquele; Ok e X marcam todos os listados) e reaparece só se chegar outro pedido pendente. Quem não está na lista do popup não vê o popup (e com o popup desligado ninguém vê). O filtro de unidade é regra fixa: só recebem quem atende a unidade do cliente.";

export const NOTA_EVENTO: Record<string, string> = {
  entrevista_agendada_cliente:
    "Avisa o cliente, no portal, quando a Salmazos define a data da entrevista de um candidato que ainda estava sem data (por exemplo, o cliente ia agendar e a Salmazos marcou). O aviso traz o candidato, a vaga e a data (com a hora, quando ela existe). Só vale para candidato ainda em aberto para o cliente. Quando o candidato já é enviado com a data marcada, o aviso é o de \"Candidato enviado ao cliente\". Quando o próprio cliente agenda, não há aviso. O clique leva à Agenda do portal. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. Sem configuração ou com o canal desligado, ninguém recebe.",
  entrevista_remarcada_cliente:
    "Avisa o cliente, no portal, quando a Salmazos muda a data ou o horário de uma entrevista que já tinha data. O aviso mostra a data anterior e a nova (a hora só aparece quando ela existe). Não avisa se nada mudou para o cliente nem se a data foi apenas apagada, e não vale para candidato já encerrado (aprovado, reprovado ou desistiu). O clique leva à Agenda do portal. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. Sem configuração ou com o canal desligado, ninguém recebe.",
  garantia_rs_vencendo:
    "Dispara pelo cron diário (6h) no último dia da garantia de um candidato de R&S, e recupera até 2 dias para trás se o cron falhou (cada candidato é avisado uma vez). E-mail: sem ninguém na lista vale o padrão (analistas da unidade, sem diretoria e superuser); com lista, só a lista. Sino: com o canal ligado o responsável pelo candidato SEMPRE é avisado, além das pessoas da lista (a lista pode ficar vazia); sem responsável e sem lista vai um aviso geral para a equipe da unidade; desligado, ninguém recebe o sino. Popup: abre uma vez por aviso para quem recebeu o aviso nominal (o responsável e a lista do sino); não tem lista própria. O cliente não recebe nada.",
  garantia_rs_acionada:
    "Dispara quando alguém aciona a reposição gratuita de um candidato de R&S (a nova vaga já foi criada). E-mail: sem ninguém na lista vale o padrão (todos os analistas da unidade); com lista, só a lista. Sino: com o canal ligado o responsável pelo candidato SEMPRE é avisado, além das pessoas da lista (a lista pode ficar vazia); sem responsável e sem lista vai um aviso geral para a equipe da unidade; desligado, ninguém recebe o sino. Popup: abre uma vez por aviso para quem recebeu o aviso nominal (o responsável e a lista do sino); não tem lista própria. O cliente não recebe nada.",
  pos_venda_rs_7dias:
    "Dispara pelo cron diário (6h) 7 dias corridos depois do início de um candidato contratado em R&S, só nas 3 primeiras vagas de R&S do cliente (cliente novo), e recupera até 2 dias para trás se o cron falhou (cada candidato é avisado uma vez). Sino: com o canal ligado, os responsáveis comerciais de sempre (o responsável comercial do cliente ou, sem ele, o time comercial da unidade) SEMPRE são avisados, além das pessoas da lista (a lista pode ficar vazia); desligado, ninguém recebe o sino. E-mail: sem ninguém na lista vale o padrão (os mesmos responsáveis comerciais); com lista, só a lista. Popup: abre uma vez por dia para quem recebeu o aviso nominal do sino (os responsáveis comerciais e a lista); não tem lista própria. Se nenhum canal ligado conseguir entregar, o aviso é tentado de novo na execução seguinte. O cliente não recebe nada.",
  ...Object.fromEntries(Object.entries(AVISOS_RESTANTES).map(([k, v]) => [k, v.nota])),
  email_cliente_candidato_entrevista:
    "E-mail ao cliente quando um candidato é movido para a etapa de entrevista com o cliente no Kanban. Mover de novo para a etapa envia de novo. Padrão: ligado.",
  email_cliente_lembrete_entrevista_hoje:
    "E-mail diário (9h) ao cliente com as entrevistas marcadas para hoje: um e-mail por cliente por dia, listando todas. Cada entrevista só é lembrada uma vez. Padrão: ligado.",
  email_cliente_vaga_aprovada:
    "E-mail ao cliente quando a Salmazos aprova uma solicitação de vaga e a vaga é criada. O sino e o popup \"Solicitação de vaga decidida\" já avisam o cliente no portal, por isso este e-mail vem desligado. Ligar de novo volta a enviar. Padrão: desligado.",
  email_cliente_vaga_status_decidido:
    "E-mail ao cliente quando a Salmazos aprova ou recusa o pedido de encerramento ou de reativação de uma vaga. O sino e o popup \"Pedido do cliente decidido\" já avisam o cliente no portal, por isso este e-mail vem desligado. Ligar de novo volta a enviar. Padrão: desligado.",
  email_cliente_solicitacao_recusada:
    "E-mail ao cliente quando a Salmazos recusa uma solicitação de vaga (traz o motivo). Padrão: ligado.",
  email_cliente_alteracao_decidida:
    "E-mail ao cliente quando a Salmazos aprova ou recusa um pedido de alteração de uma solicitação de vaga (um único interruptor para aprovada e recusada; a recusa traz o motivo). Padrão: ligado.",
  email_cliente_lembrete_agendamento:
    "E-mail diário (9h) ao cliente lembrando de confirmar a data da entrevista de um candidato que aguarda agendamento há mais de 48 horas; repete a cada 48 horas. O lembrete interno ao analista não passa por este interruptor. Padrão: ligado.",
  solicitacao_vaga_decidida_cliente:
    "Avisa o cliente, no portal, quando a Salmazos aprova ou recusa uma solicitação de vaga que ele enviou. Na aprovação, o aviso diz que a vaga já está no ar; na recusa, traz o motivo (o mesmo que o cliente já recebe por e-mail e vê em Minhas Solicitações). O clique leva a Minhas Solicitações. O sino fica no topo do portal; o popup abre uma vez por aviso novo, quando o usuário entra. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. Os e-mails já existentes não mudam. Sem configuração ou com o canal desligado, ninguém recebe.",
  pedido_vaga_decidido_cliente:
    "Avisa o cliente, no portal, quando a Salmazos aprova ou recusa um pedido dele: alteração de uma solicitação, encerramento ou reativação de uma vaga (para o cliente é sempre \"encerramento\"). Na recusa, o aviso traz o motivo (o mesmo que o cliente já recebe por e-mail e vê no selo do pedido). Pedido substituído por outro mais novo não gera aviso. O clique leva a Minhas Solicitações, onde o selo mostra o resultado. O sino fica no topo do portal; o popup abre uma vez por aviso novo, quando o usuário entra. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. Os e-mails já existentes não mudam. Sem configuração ou com o canal desligado, ninguém recebe.",
  candidato_enviado_cliente:
    "Avisa o cliente, no portal, quando a Salmazos envia um candidato para ele avaliar (ação \"Encaminhar\" do Kanban). O aviso traz o nome do candidato, a vaga e, se já houver, a data da entrevista; o clique leva ao perfil do candidato no portal. Avisa no primeiro envio e quando um candidato já avaliado é enviado de novo; não avisa de novo se o candidato continua pendente para o cliente. O sino fica no topo do portal; o popup abre uma vez por aviso novo, quando o usuário entra. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. O sino e o popup são independentes dos e-mails: os e-mails ao cliente são configurados na seção \"E-mails ao cliente\" desta aba e vão para o login de cada usuário do portal. Sem configuração ou com o canal desligado, ninguém recebe.",
  indicacao_decidida_cliente:
    "Avisa o cliente, no portal, quando a Salmazos aprova ou recusa uma indicação direta que ele enviou. Na recusa, o aviso traz o motivo (o mesmo que o cliente já vê em Minhas Indicações). O sino fica no topo do portal; o popup abre uma vez por aviso novo, quando o usuário entra. Não há lista de pessoas: recebem todos os usuários do portal daquele cliente. Sem configuração ou com o canal desligado, ninguém recebe.",
  solicitacao_vaga:
    "Dispara quando o cliente envia uma nova solicitação de vaga pelo portal. O popup lista as solicitações pendentes quando a pessoa entra no painel e abre uma vez por pessoa para cada solicitação nova; clicar abre a solicitação. Sem destinatários na lista do popup, vale o padrão antigo: todos os analistas ativos da unidade veem o popup. Com o popup desligado ninguém vê. O filtro de unidade é regra fixa. O alerta \"Falha ao notificar por e-mail\" (só superuser) continua fixo.",
  solicitacao_alteracao_pedida: `Dispara quando o cliente pede uma alteração numa solicitação de vaga que já enviou (fica pendente até a Salmazos aprovar ou recusar). O sino leva à solicitação. ${NOTA_POPUP_PEDIDOS}`,
  vaga_reativacao_pedida: `Dispara quando o cliente pede a reativação de uma vaga pausada (fica pendente até a Salmazos decidir). O sino leva à solicitação. ${NOTA_POPUP_PEDIDOS}`,
  vaga_pausa_pedida: `Dispara quando o cliente pede o encerramento de uma vaga pelo portal (o pedido fica pendente até a Salmazos decidir). Aprovar ou recusar o pedido é feito no painel de Vagas, na solicitação. O sino leva à solicitação. ${NOTA_POPUP_PEDIDOS}`,
  agendamento_cliente:
    "Dispara quando o cliente confirma a data da entrevista no portal. Quando o candidato tem responsável ativo, ele SEMPRE é avisado (sino e e-mail), além das pessoas desta lista. Quando não tem, o aviso vai para esta lista ou, sem ninguém nela, para a equipe da unidade do cliente. Com o Sino ou o E-mail desligado, ninguém recebe aquele canal (nem o responsável). O filtro de unidade desta lista é fixo.",
  indicacao_candidato_recebida:
    "Dispara quando o cliente envia uma indicação direta pelo portal. O popup lista as indicações pendentes quando a pessoa entra no painel e reaparece no próximo login enquanto houver pendente que ela não tenha dispensado; clicar abre a indicação. Quem não está na lista do popup não vê o popup (e com o popup desligado ninguém vê). O filtro de unidade é regra fixa: só recebem quem atende a unidade do cliente.",
  indicacao_candidato_editada_cliente:
    "Dispara quando o cliente altera, pelo portal, uma indicação direta que já enviou (enquanto está em análise ou aprovada e ainda sem admissão iniciada). O sino e o e-mail dizem quais campos mudaram (telefone mascarado; salário com valor); no e-mail há a tabela Campo / Antes / Depois e, se algum dado não pôde ser atualizado no cadastro do candidato, o motivo. Em indicação aprovada o sino leva ao perfil do candidato; em análise, à indicação. Não há popup. O filtro de unidade é regra fixa: só recebem quem atende a unidade do cliente.",
  rescisao_paga: "Hoje este aviso só existe no sino (e no popup de login, que deriva dele).",
  portal_candidato_aprovado:
    "Dispara quando o cliente aprova um candidato no portal. E-mail: lista abaixo (padrão Olver e RH). Sino: com o canal ligado o responsável pelo candidato SEMPRE é avisado, além das pessoas da lista (a lista pode ficar vazia); sem responsável e sem lista vai um aviso geral para a equipe da unidade do cliente; desligado, ninguém recebe o sino. Popup: abre uma vez por aviso para quem recebeu o aviso nominal (o responsável e a lista do sino); não tem lista própria e vem desligado até ser ligado. O aviso traz o comentário do cliente, nunca fee nem dados de admissão.",
  portal_candidato_reprovado:
    "Dispara quando o cliente reprova um candidato no portal. E-mail: vem desligado (ao ligar, a lista abaixo recebe um e-mail a cada reprovação). Sino: com o canal ligado o responsável pelo candidato SEMPRE é avisado, além das pessoas da lista (a lista pode ficar vazia); sem responsável e sem lista vai um aviso geral para a equipe da unidade do cliente; desligado, ninguém recebe o sino. Popup: abre uma vez por aviso para quem recebeu o aviso nominal (o responsável e a lista do sino); não tem lista própria e vem desligado até ser ligado. O aviso traz o motivo informado pelo cliente.",
  indicacao_decisao_cliente:
    "E-mail enviado quando a Salmazos aprova uma indicação direta do cliente (traz os dados de admissão). Não há sino neste aviso.",
};

export const CANAIS_FASE1 = ["email", "sino"] as const;
export type CanalFase1 = (typeof CANAIS_FASE1)[number];
export const ROTULO_CANAL: Record<string, string> = { email: "E-mail", sino: "Sino", popup: "Popup" };

export function grupoDoEvento(evento: string): GrupoAviso | null {
  if (eventoEmailCliente(evento)) return "avisos_cliente";
  for (const g of Object.keys(EVENTOS_POR_GRUPO) as GrupoAviso[]) {
    if (EVENTOS_POR_GRUPO[g].includes(evento)) return g;
  }
  return null;
}

// O que significa "sem destinatários na lista" (modo legado) em cada grupo — mostrado na tela.
export const FRASE_SEM_LISTA = "Ligado: todos os usuários do portal do cliente recebem. Desligado: ninguém.";
// E-mails ao cliente: o login de cada usuário do portal; sem usuário no portal, o e-mail de contato.
export const FRASE_EMAIL_CLIENTE = "Ligado: cada usuário do portal do cliente recebe no seu login (sem usuário no portal, vai para o e-mail de contato). Desligado: ninguém recebe este e-mail.";
export const APOIO_EMAILS_CLIENTE = "Os e-mails vão para o login de cada usuário do portal do cliente. Sem usuário no portal, vão para o e-mail de contato.";

export function descricaoPadraoDoSistema(grupo: GrupoAviso, canal: string, evento = ""): string {
  if (eventoEmailCliente(evento)) return FRASE_EMAIL_CLIENTE;
  if (eventoAvisoRestante(evento)) {
    const d = AVISOS_RESTANTES[evento].padrao[canal as CanalRestante];
    if (d) return d;
  }
  if (eventoPosVendaRS(evento)) {
    if (canal === "sino") return "Ligado, sem ninguém na lista: só os responsáveis comerciais de sempre são avisados (o responsável comercial do cliente ou, sem ele, o time comercial da unidade). Desligado: ninguém.";
    if (canal === "popup") return "Ligado: abre uma vez por dia para quem recebeu o aviso nominal do sino (responsáveis comerciais e lista). Desligado, ou sem esta configuração: ninguém vê o popup.";
    if (canal === "email") return "Sem ninguém na lista: os responsáveis comerciais de sempre recebem, como sempre. Com lista: só a lista.";
  }
  if (eventoComResponsavelNoSino(evento) && canal === "sino") {
    return "Ligado, sem ninguém na lista: só o responsável pelo candidato é avisado (sem responsável, aviso geral da unidade do cliente). Desligado: ninguém.";
  }
  if (eventoGarantiaRS(evento) && canal === "email") {
    return evento === "garantia_rs_vencendo"
      ? "Sem ninguém na lista: analistas da unidade (sem diretoria e superuser) recebem, como sempre. Com lista: só a lista."
      : "Sem ninguém na lista: todos os analistas da unidade recebem, como sempre. Com lista: só a lista.";
  }
  if (eventoComResponsavelNoSino(evento) && canal === "popup") {
    return "Ligado: abre uma vez por aviso para quem recebeu o aviso nominal do sino (responsável e lista). Desligado, ou sem esta configuração: ninguém vê o popup.";
  }
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
  if (evento === "indicacao_candidato_editada_cliente") {
    return "Padrão do sistema: todos os analistas da unidade do cliente recebem.";
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
