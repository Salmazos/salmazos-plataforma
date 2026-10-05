import { createServiceClient } from "@/lib/supabase/server";
import {
  canalClienteLigado,
  emailClienteLigadoRegra,
  limitarMensagemAviso,
  limitarTituloAviso,
  linkPortalValido,
  type CanalAvisoCliente,
} from "@/lib/avisoClienteRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Liga/desliga dos avisos ao cliente (Configurações > Avisos > "Avisos ao cliente"). Estes eventos NÃO
// têm lista de pessoas: o destinatário é todo usuário do portal do cliente, então aqui só se lê
// aviso_eventos_canais (nunca aviso_destinatarios nem resolverDestinatarios). Sem linha de canal ou
// erro de leitura = desligado: antes destes avisos nada era enviado ao cliente.
export async function canaisClienteLigados(
  evento: string,
  svc: ServiceClient = createServiceClient()
): Promise<Record<CanalAvisoCliente, boolean>> {
  const desligado = { sino: false, popup: false };
  try {
    const { data, error } = await svc.from("aviso_eventos_canais").select("canal, ativo").eq("evento", evento).in("canal", ["sino", "popup"]);
    if (error) {
      console.error(`[avisoCliente] Erro ao ler os canais do evento "${evento}":`, error.message);
      return desligado;
    }
    const linha = (canal: CanalAvisoCliente) => (data ?? []).find((c) => c.canal === canal);
    return {
      sino: canalClienteLigado({ linha: linha("sino"), erro: false }),
      popup: canalClienteLigado({ linha: linha("popup"), erro: false }),
    };
  } catch (err) {
    console.error(`[avisoCliente] Erro inesperado ao ler os canais do evento "${evento}":`, err);
    return desligado;
  }
}

export async function avisoClienteLigado(evento: string, canal: CanalAvisoCliente, svc?: ServiceClient): Promise<boolean> {
  return (await canaisClienteLigados(evento, svc))[canal];
}

// Interruptor "E-mail" dos e-mails ao cliente (Configurações > Avisos > "Avisos ao cliente"). Semântica
// INVERSA à de sino e popup: sem linha de canal ou erro de leitura = LIGADO (o e-mail já existia antes do
// interruptor); só ativo = false explícito desliga. Uma consulta barata e NUNCA lança.
export async function emailClienteLigado(evento: string, svc: ServiceClient = createServiceClient()): Promise<boolean> {
  try {
    const { data, error } = await svc.from("aviso_eventos_canais").select("ativo").eq("evento", evento).eq("canal", "email").maybeSingle();
    if (error) {
      console.error(`[avisoCliente] Erro ao ler o interruptor de e-mail do evento "${evento}" (segue ligado):`, error.message);
      return emailClienteLigadoRegra({ linha: null, erro: true });
    }
    return emailClienteLigadoRegra({ linha: data as { ativo: boolean | null } | null, erro: false });
  } catch (err) {
    console.error(`[avisoCliente] Erro inesperado ao ler o interruptor de e-mail do evento "${evento}" (segue ligado):`, err);
    return true;
  }
}

export interface DadosAvisoCliente {
  titulo: string;
  mensagem: string;
  // Sempre começa com /portal/ (caminho dentro do portal).
  link: string;
  referencia_tipo?: string | null;
  referencia_id?: string | null;
  // Com sufixo de versão (ver chaveDedupAviso): repetir a mesma ocorrência não duplica o aviso.
  chaveDedup: string;
}

// Grava o aviso do cliente para sino e/ou popup, conforme o liga/desliga ATUAL de cada canal (se os dois
// estiverem desligados, não grava). NUNCA lança: o aviso é uma chamada extra depois que a ação principal
// (decisão, e-mail) já deu certo, e uma falha aqui jamais pode derrubá-la. Precisa ser aguardada pelo
// chamador (ver notifyAllAnalysts). Devolve true só quando gravou um aviso novo.
// `montarDados` é uma função de propósito: o texto do aviso é montado DENTRO do try/catch, então um dado
// inesperado (nome nulo, por exemplo) também não derruba a rota que chamou.
export async function criarAvisoCliente(
  evento: string,
  clienteId: string | null | undefined,
  montarDados: () => DadosAvisoCliente,
  svc: ServiceClient = createServiceClient()
): Promise<boolean> {
  try {
    if (!clienteId) return false;
    const dados = montarDados();
    if (!linkPortalValido(dados.link)) {
      console.error(`[avisoCliente] Link fora do portal ignorado (evento="${evento}"): ${dados.link}`);
      return false;
    }

    const canais = await canaisClienteLigados(evento, svc);
    if (!canais.sino && !canais.popup) return false;

    // Cliente sem nenhum usuário no portal não tem quem ver o aviso: não grava linha à toa.
    const { data: usuario, error: erroUsuario } = await svc.from("cliente_usuarios").select("id").eq("cliente_id", clienteId).limit(1).maybeSingle();
    if (erroUsuario) {
      console.error(`[avisoCliente] Erro ao verificar usuários do portal (cliente_id=${clienteId}):`, erroUsuario.message);
      return false;
    }
    if (!usuario) return false;

    const { error } = await svc.from("portal_avisos").insert({
      cliente_id: clienteId,
      evento,
      titulo: limitarTituloAviso(dados.titulo),
      mensagem: limitarMensagemAviso(dados.mensagem),
      link: dados.link,
      referencia_tipo: dados.referencia_tipo ?? null,
      referencia_id: dados.referencia_id ?? null,
      chave_dedup: dados.chaveDedup,
      canal_sino: canais.sino,
      canal_popup: canais.popup,
    });
    if (error) {
      // 23505 = mesma chave de deduplicação: o aviso dessa ocorrência já existe.
      if (error.code !== "23505") console.error(`[avisoCliente] Erro ao gravar o aviso (evento="${evento}", cliente_id=${clienteId}):`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[avisoCliente] Erro inesperado ao criar o aviso (evento="${evento}"):`, err);
    return false;
  }
}
