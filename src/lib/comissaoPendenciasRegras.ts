// Regras PURAS dos avisos de comissão (rede de segurança contra lançamento esquecido). Sem I/O: o serviço (comissaoPendencias.ts)
// busca os dados e usa estas funções para decidir QUANDO avisar e COM QUE TEXTO. Todos os cálculos em America/Sao_Paulo.
//
// DECISÃO DO NEGÓCIO: comissão é remuneração de funcionário; esquecer de lançar não pode depender de alguém lembrar. Por isso:
// - o beneficiário é avisado das cobranças suas ainda sem comissão marcada (popup ao entrar + sino diário na janela do prazo);
// - a diretoria é avisada de cada marcação, das contestações paradas, de que o fechamento do mês liberou, de fechamento sem
//   pagamento e de cobrança de beneficiário sem comissão depois do prazo (possível esquecimento).

import { competenciaAtual, dentroDaFolga, diaDoInstante, mesAnteriorDe, mesSeguinteDe, rotuloCompetencia } from "./comissaoRegras";

// `notificacoes_analista.tipo`. "comissao_diretoria_*" abre a tela Comissões; os demais "comissao_*" abrem Minhas Comissões.
export const TIPO_SINO_COMISSAO = {
  lembreteLancamento: "comissao_lembrete_lancamento",
  diretoriaMarcada: "comissao_diretoria_marcada",
  diretoriaContestadas: "comissao_diretoria_contestadas",
  diretoriaFechamento: "comissao_diretoria_fechamento_liberado",
  diretoriaPagamento: "comissao_diretoria_pagamento_pendente",
  diretoriaEsquecidas: "comissao_diretoria_esquecidas",
} as const;

export const LINK_COMISSOES_DIRETORIA = "/painel/comissoes";

export const ehSinoComissaoDiretoria = (tipo: string): boolean => tipo.startsWith("comissao_diretoria_");

// Quantos dias tem o mês de uma competência "AAAA-MM-01".
export function diasNoMes(competencia: string): number {
  const [a, m] = competencia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export interface JanelaLembrete {
  // "aviso": últimos 3 dias do mês (a comissão do mês corrente ainda vale até o dia 3 do seguinte);
  // "prazo": dias 1 a 3, valendo o mês anterior.
  fase: "aviso" | "prazo";
  // Mês cujas comissões se está lembrando de lançar ("AAAA-MM-01").
  competencia: string;
  // Dias que faltam para o fim do prazo (0 = hoje é o último dia).
  diasRestantes: number;
  ultimoDia: boolean;
  // Último dia do prazo, "AAAA-MM-DD".
  prazoAte: string;
}

// Janela em que o sino diário de lembrete ao beneficiário é enviado: últimos 3 dias do mês e dias 1 a 3 do seguinte. Fora dela, null.
export function janelaDeLembrete(agora: Date = new Date()): JanelaLembrete | null {
  const atual = competenciaAtual(agora);
  const dia = diaDoInstante(agora);
  if (dentroDaFolga(agora)) {
    return { fase: "prazo", competencia: mesAnteriorDe(atual), diasRestantes: 3 - dia, ultimoDia: dia === 3, prazoAte: `${atual.slice(0, 8)}03` };
  }
  const total = diasNoMes(atual);
  if (dia >= total - 2) {
    return { fase: "aviso", competencia: atual, diasRestantes: total - dia + 3, ultimoDia: false, prazoAte: `${mesSeguinteDe(atual).slice(0, 8)}03` };
  }
  return null;
}

// Último mês de competência que já pode ser fechado (o prazo de lançamento dele terminou): do dia 4 em diante, o mês anterior;
// nos dias 1 a 3, o anterior ao anterior.
export function competenciaFechavel(agora: Date = new Date()): string {
  const atual = competenciaAtual(agora);
  return dentroDaFolga(agora) ? mesAnteriorDe(mesAnteriorDe(atual)) : mesAnteriorDe(atual);
}

const dataBR = (iso: string): string => iso.slice(0, 10).split("-").reverse().join("/");
const plural = (n: number, um: string, varios: string): string => (n === 1 ? um : varios);
const moedaBR = (v: number): string => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface TextoSino {
  titulo: string;
  mensagem: string;
}

// ── Textos (curtos; só o necessário para reconhecer o caso — nenhum dado fiscal, e-mail ou anexo) ────────────────────────

export const textosSino = {
  lembreteLancamento: (o: { qtd: number; janela: JanelaLembrete }): TextoSino => {
    const mes = rotuloCompetencia(o.janela.competencia);
    const prazo = dataBR(o.janela.prazoAte);
    const quando = o.janela.ultimoDia ? "HOJE é o último dia" : `faltam ${o.janela.diasRestantes} ${plural(o.janela.diasRestantes, "dia", "dias")}`;
    return {
      titulo: o.janela.ultimoDia ? "💰 Último dia para lançar suas comissões" : "💰 Lembrete: lançar suas comissões",
      mensagem: `${o.qtd} ${plural(o.qtd, "cobrança sua de", "cobranças suas de")} ${mes} ${plural(o.qtd, "está", "estão")} sem comissão marcada. Prazo até ${prazo} (${quando}). Abra Minhas Comissões.`,
    };
  },
  marcada: (o: { beneficiario: string; cliente: string | null; valor: number; competencia: string; folga: boolean }): TextoSino => ({
    titulo: o.folga ? "💰 Comissão lançada na folga" : "💰 Comissão marcada",
    mensagem: `${o.beneficiario} marcou a comissão de ${o.cliente ?? "uma cobrança"} (${moedaBR(o.valor)}), competência ${rotuloCompetencia(o.competencia)}${o.folga ? ", lançada depois do fim do mês (folga até o dia 3)" : ""}.`,
  }),
  contestadas: (o: { qtd: number; maisAntigaEm: string | null }): TextoSino => ({
    titulo: "💰 Contestações de comissão sem resolução",
    mensagem: `${o.qtd} ${plural(o.qtd, "comissão contestada aguarda", "comissões contestadas aguardam")} decisão${o.maisAntigaEm ? ` (a mais antiga desde ${dataBR(o.maisAntigaEm)})` : ""}. Enquanto houver contestação, o fechamento do mês fica bloqueado.`,
  }),
  fechamentoLiberado: (o: { competencia: string; qtd: number; total: number }): TextoSino => ({
    titulo: "💰 Fechamento de comissões liberado",
    mensagem: `O prazo de lançamento de ${rotuloCompetencia(o.competencia)} terminou: ${o.qtd} ${plural(o.qtd, "lançamento confirmado", "lançamentos confirmados")} (${moedaBR(o.total)}) ${plural(o.qtd, "aguarda", "aguardam")} o fechamento do mês.`,
  }),
  pagamentoPendente: (o: { competencia: string; total: number; dias: number }): TextoSino => ({
    titulo: "💰 Fechamento de comissões sem pagamento",
    mensagem: `O fechamento de ${rotuloCompetencia(o.competencia)} (${moedaBR(o.total)}) está sem pagamento registrado há ${o.dias} ${plural(o.dias, "dia", "dias")}.`,
  }),
  esquecidas: (o: { competencia: string; qtd: number }): TextoSino => ({
    titulo: "💰 Cobranças sem comissão marcada",
    mensagem: `${o.qtd} ${plural(o.qtd, "cobrança de", "cobranças de")} ${rotuloCompetencia(o.competencia)}, ${plural(o.qtd, "gerada", "geradas")} por beneficiário de comissão, ficaram sem comissão marcada e o prazo de lançamento terminou. Confira se há comissão a tratar com a pessoa.`,
  }),
};

// Dias inteiros entre duas datas "AAAA-MM-DD" (b - a), nunca negativo.
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
