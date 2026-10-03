// "Padrão do sistema" de cada grupo de Avisos: espelha a carga inicial da migration
// (supabase/migration_avisos_unificados.sql, copiada das tabelas antigas em out/2026). Constante
// versionada de propósito — o botão "Restaurar padrão do sistema" não lê tabela antiga nenhuma.
// Módulo puro (sem imports): usado no client, no server e no script de verificação.
// Hoje só o grupo Vagas tem padrão; rescisão e ASO entram aqui quando forem liberados.

export type GrupoComPadrao = "vagas";
export type CanalPadrao = "email" | "sino";

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

export const PADRAO_AVISOS: Record<GrupoComPadrao, Record<string, PadraoEvento>> = {
  vagas: {
    vaga_criada: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: SINO_TODOS },
    },
    solicitacao_vaga: {
      email: { ativo: true, destinatarios: [EMAIL_REBECCA, EMAIL_ANDREZA, EMAIL_GIOVANNI] },
      sino: { ativo: true, destinatarios: SINO_TODOS },
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
  },
};

export function grupoTemPadrao(grupo: string): grupo is GrupoComPadrao {
  return Object.prototype.hasOwnProperty.call(PADRAO_AVISOS, grupo);
}

export interface PayloadRestauracao {
  eventos: {
    evento: string;
    canais: { canal: CanalPadrao; ativo: boolean; destinatarios: Record<string, string>[] }[];
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
    for (const canal of ["email", "sino"] as const) {
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
      if (padrao.ativo && destinatarios.length === 0) semDestinatario.push({ evento, canal });
      itens.push({ canal, ativo: padrao.ativo, destinatarios });
    }
    eventos.push({ evento, canais: itens });
  }
  return { payload: { eventos }, ignorados, semDestinatario };
}
