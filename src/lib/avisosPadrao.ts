// "Padrão do sistema" de cada grupo de Avisos: espelha a carga inicial da migration
// (supabase/migration_avisos_unificados.sql, copiada das tabelas antigas em out/2026). Constante
// versionada de propósito — o botão "Restaurar padrão do sistema" não lê tabela antiga nenhuma.
// Módulo puro (sem imports): usado no client, no server e no script de verificação.
// Hoje Vagas e Portal do cliente têm padrão; rescisão e ASO entram aqui quando forem liberados.

export type GrupoComPadrao = "vagas" | "portal_cliente";
export type CanalPadrao = "email" | "sino" | "popup";

export type DestinatarioPadrao =
  | { tipo_destinatario: "email"; nome: string; email: string }
  | { tipo_destinatario: "usuario"; usuario_id: string; nome: string };

export interface PadraoCanal {
  ativo: boolean;
  destinatarios: DestinatarioPadrao[];
}

export type PadraoEvento = Partial<Record<CanalPadrao, PadraoCanal>>;

const u = (usuario_id: string, nome: string): DestinatarioPadrao => ({ tipo_destinatario: "usuario", usuario_id, nome });
const e = (nome: string, email: string): DestinatarioPadrao => ({ tipo_destinatario: "email", nome, email });

const REBECCA = u("602a5db4-1338-4f8f-b8fc-d8ed989824d4", "Rebecca Zambonini");
const GIOVANNI = u("a3d48389-9856-482b-a1c9-65670871a6a4", "Giovanni Prado");
const ANDREZA = u("ca9ba791-4eb9-4260-ae06-a6b30fd032ac", "Andreza Salmazo");

const SINO_TODOS: DestinatarioPadrao[] = [
  u("3a8bdae4-781e-4ff0-aaa7-86276848ce99", "Lucas Miguel"),
  REBECCA,
  u("996db358-b02c-461a-bf36-c0f2b316e7fd", "Edivan Souza Silva"),
  u("a1131df1-94bf-4c82-930e-0f80742d8ebf", "Olver Pereira dos Santos"),
  GIOVANNI,
  u("b40f3989-eb60-4614-adb7-1790fcfaa792", "Elizabete Salmazo"),
  ANDREZA,
];

const EMAIL_REBECCA = e("Rebecca Zambonini", "curriculos@salmazos.com.br");
const EMAIL_ANDREZA = e("Andreza Salmazo", "rh@salmazos.com.br");
const EMAIL_GIOVANNI = e("Giovanni Prado", "vagas@salmazos.com.br");

// Os 10 analistas ativos com e-mail na carga de migration_avisos_fase1c.sql (Susana Oliveira tem
// dois perfis, um por unidade). O filtro de unidade vale por cima na hora de enviar.
const ANALISTAS_ATIVOS: DestinatarioPadrao[] = [
  ANDREZA,
  u("996db358-b02c-461a-bf36-c0f2b316e7fd", "Edivan Souza Silva"),
  u("b40f3989-eb60-4614-adb7-1790fcfaa792", "Elizabete Salmazo"),
  GIOVANNI,
  u("3a8bdae4-781e-4ff0-aaa7-86276848ce99", "Lucas Miguel"),
  u("a1131df1-94bf-4c82-930e-0f80742d8ebf", "Olver Pereira dos Santos"),
  REBECCA,
  u("00a62f1c-757a-4ed3-a462-00574c6fa0d6", "Susana Oliveira (Monte Mor / Hortolândia)"),
  u("9dd9c66c-005a-4de8-930a-8fe71e3112f4", "Susana Oliveira (São Bernardo do Campo)"),
  u("cb2f5a16-0a4b-457f-9b25-be5006726eec", "Victor Eduardo Oliveira"),
];

// Quem vê hoje o popup de solicitação de vaga (e passa a ver o dos pedidos do cliente): analistas
// ativos que atendem a unidade dos clientes (hoje só Monte Mor / Hortolândia) — os 4 sócios, que têm
// acesso a todas as unidades, mais os 4 da unidade. Victor e a Susana de SBC ficam de fora por unidade
// (SBC não tem cliente). Espelha a carga de supabase/migration_avisos_fase3_bloco1.sql.
const POPUP_UNIDADE_CLIENTES: DestinatarioPadrao[] = [
  ANDREZA,
  u("996db358-b02c-461a-bf36-c0f2b316e7fd", "Edivan Souza Silva"),
  u("b40f3989-eb60-4614-adb7-1790fcfaa792", "Elizabete Salmazo"),
  GIOVANNI,
  u("3a8bdae4-781e-4ff0-aaa7-86276848ce99", "Lucas Miguel"),
  u("a1131df1-94bf-4c82-930e-0f80742d8ebf", "Olver Pereira dos Santos"),
  REBECCA,
  u("00a62f1c-757a-4ed3-a462-00574c6fa0d6", "Susana Oliveira (Monte Mor / Hortolândia)"),
];

const EMAIL_OLVER = e("Olver", "olver@salmazos.com.br");
const EMAIL_RH = e("RH", "rh@salmazos.com.br");

const PADRAO_PORTAL_CLIENTE: Record<string, PadraoEvento> = {
  indicacao_candidato_recebida: {
    email: { ativo: true, destinatarios: ANALISTAS_ATIVOS },
    sino: { ativo: true, destinatarios: ANALISTAS_ATIVOS },
    popup: { ativo: true, destinatarios: ANALISTAS_ATIVOS },
  },
  // Fase 3: carga copiada das listas de solicitacao_vaga (e-mail: Andreza, Giovanni e Rebecca; sino: os
  // 7 do sino de solicitação). O popup dos três pedidos usa a mesma carga do popup de solicitação.
  solicitacao_alteracao_pedida: {
    email: { ativo: true, destinatarios: [EMAIL_ANDREZA, EMAIL_GIOVANNI, EMAIL_REBECCA] },
    sino: { ativo: true, destinatarios: SINO_TODOS },
    popup: { ativo: true, destinatarios: POPUP_UNIDADE_CLIENTES },
  },
  vaga_reativacao_pedida: {
    email: { ativo: true, destinatarios: [EMAIL_ANDREZA, EMAIL_GIOVANNI, EMAIL_REBECCA] },
    sino: { ativo: true, destinatarios: SINO_TODOS },
    popup: { ativo: true, destinatarios: POPUP_UNIDADE_CLIENTES },
  },
  vaga_pausa_pedida: {
    email: { ativo: true, destinatarios: [EMAIL_ANDREZA, EMAIL_GIOVANNI, EMAIL_REBECCA] },
    sino: { ativo: true, destinatarios: SINO_TODOS },
    popup: { ativo: true, destinatarios: POPUP_UNIDADE_CLIENTES },
  },
  agendamento_cliente: {
    email: { ativo: true, destinatarios: [EMAIL_ANDREZA, EMAIL_GIOVANNI, EMAIL_REBECCA] },
    sino: { ativo: true, destinatarios: SINO_TODOS },
  },
  // Sino e popup: ligados com a lista VAZIA (o responsável do candidato sempre é avisado por regra no código).
  portal_candidato_aprovado: {
    email: { ativo: true, destinatarios: [EMAIL_OLVER, EMAIL_RH] },
    sino: { ativo: true, destinatarios: [] },
    popup: { ativo: true, destinatarios: [] },
  },
  // E-mail nasce desligado: hoje não existe e-mail interno de reprovação.
  portal_candidato_reprovado: {
    email: { ativo: false, destinatarios: [EMAIL_OLVER, EMAIL_RH] },
    sino: { ativo: true, destinatarios: [] },
    popup: { ativo: true, destinatarios: [] },
  },
  indicacao_decisao_cliente: { email: { ativo: true, destinatarios: [EMAIL_OLVER, EMAIL_RH] } },
};

export const PADRAO_AVISOS: Record<GrupoComPadrao, Record<string, PadraoEvento>> = {
  portal_cliente: PADRAO_PORTAL_CLIENTE,
  vagas: {
    vaga_criada: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: SINO_TODOS },
    },
    solicitacao_vaga: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: SINO_TODOS },
      // Fase 3: o popup de solicitação passa a vir de lista (antes: todo analista ativo da unidade).
      popup: { ativo: true, destinatarios: POPUP_UNIDADE_CLIENTES },
    },
    vaga_cancelada: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: SINO_TODOS },
    },
    // E-mail desligado de propósito (como na carga inicial): fechamento só no sino.
    vaga_fechada: {
      email: { ativo: false, destinatarios: [] },
      sino: { ativo: true, destinatarios: SINO_TODOS },
    },
    vaga_reativada: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [REBECCA, GIOVANNI, ANDREZA] },
    },
    // Garantia R&S: e-mail com a mesma lista dos avisos de vaga mais parecidos (vaga_cancelada e vaga_reativada);
    // sino e popup ligados com a lista VAZIA (o responsável do candidato sempre é avisado por regra no código).
    garantia_rs_vencendo: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
      popup: { ativo: true, destinatarios: [] },
    },
    garantia_rs_acionada: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
      popup: { ativo: true, destinatarios: [] },
    },
    // Pós-venda R&S: e-mail com a mesma lista dos avisos de vaga mais parecidos; sino e popup ligados com a lista VAZIA
    // (os responsáveis comerciais de sempre são avisados por regra no código).
    pos_venda_rs_7dias: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
      popup: { ativo: true, destinatarios: [] },
    },
    // Avisos restantes (candidato transferido, currículo atualizado, funcionário não criado…): sino e popup ligados com a
    // lista VAZIA (quem já era avisado sempre é); e-mail, quando o evento tem, com a mesma lista dos avisos de vaga
    // mais parecidos (vaga_cancelada e vaga_reativada).
    candidato_transferido: { sino: { ativo: true, destinatarios: [] } },
    candidato_curriculo_atualizado: { sino: { ativo: true, destinatarios: [] } },
    funcionario_nao_criado: { sino: { ativo: true, destinatarios: [] } },
    lembrete_agendamento_pendente_analista: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
    },
    lembrete_comercial: { sino: { ativo: true, destinatarios: [] }, popup: { ativo: true, destinatarios: [] } },
    supervisao_cliente_atrasada: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
      popup: { ativo: true, destinatarios: [] },
    },
    aniversario_mes_seguinte: { email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] } },
    aniversario_tres_dias: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
    },
    aniversario_no_dia: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: [] },
      popup: { ativo: true, destinatarios: [] },
    },
    fee_rs_nao_configurado: { sino: { ativo: true, destinatarios: [] } },
    conta_receber_hortolandia_atrasada: { sino: { ativo: true, destinatarios: [] }, popup: { ativo: true, destinatarios: [] } },
  },
};

// Cópia dos eventos de EVENTOS_DECISAO_CLIENTE, EVENTOS_GARANTIA_RS e EVENTO_POS_VENDA_RS (avisosCatalogo.ts): este módulo não importa
// outros (roda no script de verificação). O script confere que as duas regras (canalSemListaPermitido e esta) dão
// o mesmo resultado.
const EVENTOS_SINO_COM_RESPONSAVEL: readonly string[] = [
  "portal_candidato_aprovado",
  "portal_candidato_reprovado",
  "garantia_rs_vencendo",
  "garantia_rs_acionada",
  "pos_venda_rs_7dias",
  "candidato_transferido",
  "candidato_curriculo_atualizado",
  "funcionario_nao_criado",
  "lembrete_agendamento_pendente_analista",
  "lembrete_comercial",
  "supervisao_cliente_atrasada",
  "conta_receber_hortolandia_atrasada",
  "fee_rs_nao_configurado",
  "aniversario_mes_seguinte",
  "aniversario_tres_dias",
  "aniversario_no_dia",
];

export function grupoTemPadrao(grupo: string): grupo is GrupoComPadrao {
  return Object.prototype.hasOwnProperty.call(PADRAO_AVISOS, grupo);
}

export interface PayloadRestauracao {
  eventos: {
    evento: string;
    canais: { canal: CanalPadrao; ativo: boolean; destinatarios: Record<string, string>[]; permite_vazio?: boolean }[];
  }[];
}

export interface ResultadoPayloadRestauracao {
  payload: PayloadRestauracao;
  // Usuários do padrão que não existem mais ou estão inativos (ficam de fora da restauração).
  ignorados: { evento: string; canal: CanalPadrao; nome: string }[];
  // Canais que ficariam ligados SEM nenhum destinatário (violaria a regra do último destinatário).
  semDestinatario: { evento: string; canal: CanalPadrao }[];
}

// Monta o que a função SQL avisos_restaurar_padrao recebe. `usuariosAtivos` = user_id dos
// analistas ativos hoje (FK para auth.users e envio só fazem sentido para eles).
export function montarPayloadRestauracao(grupo: GrupoComPadrao, usuariosAtivos: ReadonlySet<string>): ResultadoPayloadRestauracao {
  const ignorados: ResultadoPayloadRestauracao["ignorados"] = [];
  const semDestinatario: ResultadoPayloadRestauracao["semDestinatario"] = [];
  const eventos: PayloadRestauracao["eventos"] = [];

  for (const [evento, canais] of Object.entries(PADRAO_AVISOS[grupo])) {
    const itens: PayloadRestauracao["eventos"][number]["canais"] = [];
    for (const canal of ["email", "sino", "popup"] as const) {
      const padrao = canais[canal];
      if (!padrao) continue;
      const destinatarios: Record<string, string>[] = [];
      for (const d of padrao.destinatarios) {
        if (d.tipo_destinatario === "usuario") {
          if (!usuariosAtivos.has(d.usuario_id)) {
            ignorados.push({ evento, canal, nome: d.nome });
            continue;
          }
          destinatarios.push({ tipo_destinatario: "usuario", usuario_id: d.usuario_id });
        } else {
          destinatarios.push({ tipo_destinatario: "email", nome: d.nome, email: d.email.toLowerCase() });
        }
      }
      // Sino e popup dos avisos com responsável (decisão do cliente e garantia R&S) podem ficar ligados sem lista.
      const permiteVazio = EVENTOS_SINO_COM_RESPONSAVEL.includes(evento) && (canal === "sino" || canal === "popup");
      if (padrao.ativo && destinatarios.length === 0 && !permiteVazio) semDestinatario.push({ evento, canal });
      itens.push({ canal, ativo: padrao.ativo, destinatarios, ...(permiteVazio ? { permite_vazio: true } : {}) });
    }
    eventos.push({ evento, canais: itens });
  }
  return { payload: { eventos }, ignorados, semDestinatario };
}

// Padrão dos e-mails ao cliente (grupo avisos_cliente, canal "email"). SÓ DOCUMENTAÇÃO: o grupo continua sem
// "Restaurar padrão" (não entra em PADRAO_AVISOS) e o código não lê esta constante. A fonte da verdade são as
// linhas de supabase/migration_avisos_cliente_email.sql; sem linha, o e-mail é enviado (ligado).
export const PADRAO_EMAIL_CLIENTE: Record<string, boolean> = {
  email_cliente_candidato_entrevista: true,
  email_cliente_lembrete_entrevista_hoje: true,
  // O sino e o popup do bloco 4 já cobrem estas duas movimentações.
  email_cliente_vaga_aprovada: false,
  email_cliente_vaga_status_decidido: false,
  email_cliente_solicitacao_recusada: true,
  email_cliente_alteracao_decidida: true,
  email_cliente_lembrete_agendamento: true,
};
