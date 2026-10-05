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

// Texto do aviso "Candidato enviado ao cliente". Só o que o cliente já vê no portal: nome do candidato,
// título da vaga e a data/hora da entrevista (já formatada por dataEntrevistaParaCliente). Nunca
// observações, notas, responsável, contatos do candidato, fee nem status interno do funil. Dado nulo
// só encurta o texto, nunca quebra.
export function textoAvisoCandidatoEnviado(o: {
  candidato?: string | null;
  vagaTitulo?: string | null;
  entrevista?: string | null;
}): { titulo: string; mensagem: string } {
  const nome = o.candidato?.trim();
  const vaga = o.vagaTitulo?.trim();
  const entrevista = o.entrevista?.trim();
  return {
    titulo: "Novo candidato para avaliar",
    mensagem:
      "Novo candidato para avaliar" +
      (nome ? `: ${nome}` : "") +
      (vaga ? ` — vaga ${vaga}` : "") +
      (entrevista ? ` — entrevista em ${entrevista}` : ""),
  };
}

// Texto dos avisos "Entrevista agendada" e "Entrevista remarcada" (bloco 3). `antes` e `depois` já vêm
// formatados por dataEntrevistaParaCliente ("dd/mm/aaaa" ou "dd/mm/aaaa às hh:mm"; o 12:00 de convenção
// fica sem horário). Só nome do candidato, título da vaga e datas. Dado nulo só encurta, nunca quebra.
export function textoAvisoEntrevista(o: {
  tipo: "agendada" | "remarcada";
  candidato?: string | null;
  vagaTitulo?: string | null;
  antes?: string | null;
  depois?: string | null;
}): { titulo: string; mensagem: string } {
  const nome = o.candidato?.trim();
  const vaga = o.vagaTitulo?.trim();
  const antes = o.antes?.trim();
  const depois = o.depois?.trim();
  const titulo = o.tipo === "agendada" ? "Entrevista agendada" : "Entrevista remarcada";
  let quando = "";
  if (o.tipo === "agendada") quando = depois ? ` — ${depois}` : "";
  else if (antes && depois) quando = ` — de ${antes} para ${depois}`;
  else if (depois) quando = ` — para ${depois}`;
  return { titulo, mensagem: `${titulo}${nome ? `: ${nome}` : ""}${vaga ? ` — vaga ${vaga}` : ""}${quando}` };
}

// Quando o POST de /api/encaminhamentos gera aviso ao cliente. `anterior` = o encaminhamento do mesmo
// candidato, cliente e vaga ANTES da gravação (null = não existia: primeiro envio).
//   - primeiro envio                                   → avisa, versão "novo"
//   - já existia e estava ENCERRADO para o cliente
//     (aprovado, reprovado, desistiu ou já avaliado) e
//     foi reaberto (reenvio real)                       → avisa, versão "reenvio:{updated_at anterior}"
//   - já existia e ainda estava em aberto                → NÃO avisa (o cliente já tem esse candidato
//     pendente; mudança de data é remarcação, tratada no bloco 3)
// A versão sai do estado ANTERIOR: duas requisições simultâneas e idênticas veem o mesmo estado anterior
// e geram a mesma chave (a segunda não duplica); a repetição depois da primeira já encontra o
// encaminhamento aberto (não avisa); cada reenvio real parte de um estado anterior diferente.
const STATUS_ENCERRADOS_PARA_CLIENTE = ["aprovado", "reprovado", "desistiu"];
export function decidirAvisoCandidatoEnviado(
  anterior: { status?: string | null; avaliado_em?: string | null; updated_at?: string | null } | null | undefined
): { avisar: boolean; versao: string } {
  if (!anterior) return { avisar: true, versao: "novo" };
  const encerrado = STATUS_ENCERRADOS_PARA_CLIENTE.includes(anterior.status ?? "") || !!anterior.avaliado_em;
  if (!encerrado) return { avisar: false, versao: "" };
  return { avisar: true, versao: `reenvio:${anterior.updated_at ?? anterior.avaliado_em ?? "sem-data"}` };
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
