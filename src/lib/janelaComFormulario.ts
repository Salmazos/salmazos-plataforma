// Controlador (puro, sem React) da regra "janela com formulário não perde o que o usuário digitou sem avisar". O hook src/components/useJanelaComFormulario.tsx
// liga este controlador à janela; aqui fica só a lógica, para testar sem navegador (scripts/verificar-janelas-com-formulario.mts).
//
// Regras (decididas com o diretor):
//   - "sujo" = o USUÁRIO mexeu em algum campo da janela (evento input/change confiável) ou a janela chamou marcarSujo() (chips, listas "Adicionar", botões
//     que preenchem campos). Dado que a tela carrega sozinha (API, props, prefill) NÃO marca: abrir uma janela de edição já preenchida não avisa à toa.
//   - Campos de busca/filtro não contam: marque o campo com data-sujo-ignorar.
//   - fechar() (X, Cancelar e Esc): ocupado/gravando = ignora; limpo = fecha direto; sujo = pede a confirmação "Sair sem salvar / Continuar editando".
//   - Digitar e voltar ao valor original continua sujo (aceito: sem snapshot do estado).
//   - Salvou com sucesso: a janela chama limpar() e fecha pelo onClose direto (sem perguntar). Reabrir zera.
import { escapeDeveFecharModal } from "./clienteDaSolicitacao";

export const TEXTO_DESCARTAR = "Você tem dados não salvos. Sair e perder o que digitou?";
export const ROTULO_CONTINUAR_EDITANDO = "Continuar editando";
export const ROTULO_SAIR_SEM_SALVAR = "Sair sem salvar";
export const ATRIBUTO_IGNORAR_SUJO = "data-sujo-ignorar";
export const ATRIBUTO_SUJO_BOTAO = "data-sujo-botao";

export interface OpcoesDaJanela {
  // Fecha a janela de verdade (a prop onClose da tela). Nunca pergunta: quem pergunta é fechar().
  onClose: () => void;
  // Gravando/enviando: fechar() ignora o pedido (X, Cancelar e Esc). Lido a cada chamada, então pode ser uma função sobre estado que muda.
  ocupado?: () => boolean;
  // false = o Esc não fecha esta janela (ex.: tela que decidiu manter o Esc desligado). X e Cancelar continuam perguntando.
  escFecha?: () => boolean;
}

export interface EstadoDaJanela {
  sujo: boolean;
  confirmando: boolean;
}

// Só o necessário do evento, para rodar fora do navegador (nos testes).
export interface EventoDeCampo {
  confiavel: boolean;
  alvo: { closest?: (seletor: string) => unknown } | null;
}
export interface EventoDeTecla {
  key: string;
  alvo: { tagName?: string; closest?: (seletor: string) => unknown } | null;
  defaultPrevented?: boolean;
}

export function criarControleDaJanela(opcoes: () => OpcoesDaJanela) {
  let sujo = false;
  let confirmando = false;
  const ouvintes = new Set<() => void>();
  const notificar = () => ouvintes.forEach((f) => f());
  const ocupado = () => opcoes().ocupado?.() === true;

  const controle = {
    estado(): EstadoDaJanela {
      return { sujo, confirmando };
    },
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => void ouvintes.delete(ouvinte);
    },
    marcarSujo() {
      if (sujo) return;
      sujo = true;
      notificar();
    },
    // Zera o "sujo" e fecha a confirmação (salvou, abriu de novo ou descartou).
    limpar() {
      if (!sujo && !confirmando) return;
      sujo = false;
      confirmando = false;
      notificar();
    },
    // Campo mexido pelo usuário (input/change). Evento não confiável (disparado por código) e campo com data-sujo-ignorar não contam.
    aoMudarCampo(e: EventoDeCampo) {
      if (!e.confiavel) return;
      if (e.alvo && typeof e.alvo.closest === "function" && e.alvo.closest(`[${ATRIBUTO_IGNORAR_SUJO}]`)) return;
      controle.marcarSujo();
    },
    // Clique do usuário num botão que muda dado sem emitir input/change (chip, "Adicionar", "Usar modelo") e que não tem acesso ao hook (componente
    // compartilhado): o botão leva data-sujo-botao. Nas janelas, o próprio handler chama marcarSujo().
    aoClicar(e: EventoDeCampo) {
      if (!e.confiavel) return;
      if (e.alvo && typeof e.alvo.closest === "function" && e.alvo.closest(`[${ATRIBUTO_SUJO_BOTAO}]`)) controle.marcarSujo();
    },
    // X, Cancelar e Esc passam por aqui.
    fechar() {
      if (ocupado()) return;
      if (!sujo) {
        opcoes().onClose();
        return;
      }
      if (!confirmando) {
        confirmando = true;
        notificar();
      }
    },
    continuarEditando() {
      if (!confirmando) return;
      confirmando = false;
      notificar();
    },
    sairSemSalvar() {
      confirmando = false;
      sujo = false;
      notificar();
      opcoes().onClose();
    },
    // Esc na janela: devolve true se tratou (quem chama faz stopPropagation, para o Esc agir só na janela do topo). Esc de <select> ou de elemento com
    // popup aberto (aria-expanded) fecha a própria lista e nunca a janela.
    aoTeclar(e: EventoDeTecla): boolean {
      if (e.key !== "Escape" || e.defaultPrevented || confirmando) return false;
      if (opcoes().escFecha && !opcoes().escFecha!()) return false;
      if (!escapeDeveFecharModal({ key: e.key, alvo: e.alvo })) return false;
      controle.fechar();
      return true;
    },
  };
  return controle;
}

export type ControleDaJanela = ReturnType<typeof criarControleDaJanela>;

// Pilha das janelas abertas (a última é a do topo): o Esc só age na janela do topo, mesmo com o foco fora dela (foco perdido no body).
const pilha: ControleDaJanela[] = [];
export function empilharJanela(c: ControleDaJanela) {
  pilha.push(c);
  return () => {
    const i = pilha.lastIndexOf(c);
    if (i >= 0) pilha.splice(i, 1);
  };
}
export function janelaDoTopo(): ControleDaJanela | undefined {
  return pilha[pilha.length - 1];
}
