// Regras PURAS dos "Avisos ao cliente" (sino e popup no portal): sem imports de servidor, usadas
// no servidor, nos componentes do portal e no script de verificação
// (scripts/verificar-avisos-resolvedor.mts).

export type CanalAvisoCliente = "sino" | "popup";

// Quem vê o aviso: só o que foi criado depois que o próprio usuário entrou no portal e nos últimos
// 30 dias. Esconder, nunca apagar (sem cron).
export const DIAS_VISIVEL_AVISO_CLIENTE = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

// Canal ligado SOMENTE com linha em aviso_eventos_canais e ativo = true. Sem linha ou erro de leitura
// = não envia nada (antes destes avisos nada era enviado ao cliente, então "sem configuração" é "desligado").
export function canalClienteLigado(resultado: { linha: { ativo: boolean | null } | null | undefined; erro: boolean }): boolean {
  if (resultado.erro) return false;
  return resultado.linha?.ativo === true;
}

// Limite inferior de created_at que o usuário pode ver: o mais recente entre os últimos 30 dias e o
// momento em que ele passou a ter acesso ao portal (cliente_usuarios.created_at).
export function inicioJanelaAvisos(vinculoCriadoEm: string | null | undefined, agora: Date = new Date()): string {
  const limite30 = agora.getTime() - DIAS_VISIVEL_AVISO_CLIENTE * MS_DIA;
  const vinculo = vinculoCriadoEm ? new Date(vinculoCriadoEm).getTime() : NaN;
  const inicio = Number.isNaN(vinculo) ? limite30 : Math.max(limite30, vinculo);
  return new Date(inicio).toISOString();
}

export function avisoVisivelParaUsuario(
  avisoCriadoEm: string,
  vinculoCriadoEm: string | null | undefined,
  agora: Date = new Date()
): boolean {
  const criado = new Date(avisoCriadoEm).getTime();
  if (Number.isNaN(criado)) return false;
  return criado >= new Date(inicioJanelaAvisos(vinculoCriadoEm, agora)).getTime();
}

// O link do aviso sempre fica dentro do portal (caminho relativo); nunca uma URL externa.
export function linkPortalValido(link: string): boolean {
  return /^\/portal\/[A-Za-z0-9\-._~/?=&%#]*$/.test(link) && !link.includes("//", 1);
}

// Chave de deduplicação com sufixo de versão: repetir a MESMA ocorrência não duplica o aviso, mas um
// reenvio legítimo (outra versão) é aceito.
export function chaveDedupAviso(evento: string, referenciaId: string, versao: string | number): string {
  return `${evento}:${referenciaId}:${versao}`;
}

const limitar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
export const limitarTituloAviso = (t: string) => limitar(t.trim(), 120);
export const limitarMensagemAviso = (t: string) => limitar(t.trim(), 400);

// Texto da decisão da indicação direta. Usa SÓ o que o cliente já vê em /portal/minhas-indicacoes:
// nome do candidato que ele indicou, título da vaga e, na recusa, o motivo_recusa. Nunca quem decidiu.
export function textoAvisoIndicacaoDecidida(o: {
  decisao: "aprovada" | "recusada";
  candidato?: string | null;
  vagaTitulo?: string | null;
  motivo?: string | null;
}): { titulo: string; mensagem: string } {
  const candidato = o.candidato?.trim() || "candidato";
  const vaga = o.vagaTitulo?.trim();
  if (o.decisao === "aprovada") {
    return {
      titulo: "Indicação aprovada",
      mensagem: vaga ? `Sua indicação ${candidato} foi aprovada para a vaga ${vaga}` : `Sua indicação ${candidato} foi aprovada`,
    };
  }
  const motivo = o.motivo?.trim();
  return {
    titulo: "Indicação não aprovada",
    mensagem: `Sua indicação ${candidato} não foi aprovada.${motivo ? ` Motivo: ${motivo}` : ""}`,
  };
}

// "há 5 min", "há 3 h", "há 2 dias" (o menu do sino mostra uma linha de tempo curta).
export function haQuantoTempo(criadoEm: string, agora: Date = new Date()): string {
  const ms = agora.getTime() - new Date(criadoEm).getTime();
  if (Number.isNaN(ms) || ms < 60 * 1000) return "agora";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

// Aviso como a rota GET /api/portal/avisos devolve ao navegador (sem ids internos além do próprio aviso).
export interface AvisoPortal {
  id: string;
  titulo: string;
  mensagem: string;
  link: string;
  created_at: string;
  canal_sino: boolean;
  canal_popup: boolean;
  lida: boolean;
  popup_visto: boolean;
}

export const naoLidosDoSino = (avisos: readonly AvisoPortal[]) => avisos.filter((a) => a.canal_sino && !a.lida);
export const pendentesDoPopup = (avisos: readonly AvisoPortal[]) => avisos.filter((a) => a.canal_popup && !a.popup_visto);
