import { createServiceClient } from "@/lib/supabase/server";
import { getConfiguracoesGerais } from "@/lib/configuracoesGerais";
import { EVENTOS_POR_GRUPO } from "@/lib/avisosCatalogo";
import {
  resolverComFonte,
  type CanalAviso,
  type DadosAviso,
  type FonteAvisos,
  type LinhaDestinatario,
  type PerfilAnalista,
  type ResolucaoAviso,
} from "@/lib/avisosResolucao";

export type { CanalAviso, ModoAviso, ResolucaoAviso } from "@/lib/avisosResolucao";

export { EVENTOS_POR_GRUPO, grupoDoEvento } from "@/lib/avisosCatalogo";
export type { GrupoAviso } from "@/lib/avisosCatalogo";

export const CHAVE_AVISOS_EMAIL_RESCISAO = "rescisao_avisos_email_ativo";

type ServiceClient = ReturnType<typeof createServiceClient>;

const linhaEmail = (r: { nome: string | null; email: string; ativo: boolean }): LinhaDestinatario => ({
  tipo_destinatario: "email",
  usuario_id: null,
  email: r.email,
  nome: r.nome,
  ativo: r.ativo,
});
const linhaUsuario = (usuarioId: string): LinhaDestinatario => ({
  tipo_destinatario: "usuario",
  usuario_id: usuarioId,
  email: null,
  nome: null,
  ativo: true,
});

async function carregarNovo(svc: ServiceClient, evento: string, canal: CanalAviso): Promise<DadosAviso | null> {
  const [{ data: cfg, error: errCfg }, { data: linhas, error: errLinhas }] = await Promise.all([
    svc.from("aviso_eventos_canais").select("ativo").eq("evento", evento).eq("canal", canal).maybeSingle(),
    svc.from("aviso_destinatarios").select("tipo_destinatario, usuario_id, email, nome, ativo").eq("evento", evento).eq("canal", canal),
  ]);
  if (errCfg || errLinhas) {
    // Esperado enquanto a migration não foi aplicada: cai no antigo sem derrubar o aviso.
    console.warn(`[avisos] Tabelas novas indisponíveis (evento="${evento}", canal="${canal}"):`, (errCfg ?? errLinhas)?.message);
    return null;
  }
  return { canalAtivo: cfg ? cfg.ativo : null, linhas: (linhas ?? []) as LinhaDestinatario[] };
}

// Lógica ANTERIOR (tabelas por módulo), traduzida para o mesmo formato das tabelas novas.
async function carregarAntigo(svc: ServiceClient, evento: string, canal: CanalAviso): Promise<DadosAviso | null> {
  if (canal === "popup") return { canalAtivo: null, linhas: [] };

  if (EVENTOS_POR_GRUPO.vagas.includes(evento)) {
    if (canal === "email") {
      const [{ data: cfg, error: e1 }, { data: dest, error: e2 }] = await Promise.all([
        svc.from("aviso_vaga_config").select("email_ativo").eq("evento", evento).maybeSingle(),
        svc.from("aviso_vaga_email_destinatarios").select("nome, email, ativo").eq("evento", evento),
      ]);
      if (e1 || e2) {
        console.error(`[avisos] Erro ao ler config antiga de vagas/e-mail (evento="${evento}"):`, (e1 ?? e2)?.message);
        return null;
      }
      return { canalAtivo: cfg ? cfg.email_ativo : null, linhas: (dest ?? []).map(linhaEmail) };
    }
    const { data, error } = await svc.from("aviso_vaga_plataforma_destinatarios").select("usuario_id").eq("evento", evento);
    if (error) {
      console.error(`[avisos] Erro ao ler config antiga de vagas/sino (evento="${evento}"):`, error.message);
      return null;
    }
    return { canalAtivo: null, linhas: (data ?? []).map((d) => linhaUsuario(d.usuario_id)) };
  }

  if (EVENTOS_POR_GRUPO.rescisao.includes(evento)) {
    if (canal === "email") {
      const [cfg, { data, error }] = await Promise.all([
        getConfiguracoesGerais([CHAVE_AVISOS_EMAIL_RESCISAO]),
        svc.from("rescisao_avisos_email_destinatarios").select("nome, email, ativo"),
      ]);
      if (error) {
        console.error(`[avisos] Erro ao ler config antiga de rescisão/e-mail (evento="${evento}"):`, error.message);
        return null;
      }
      // Sem a chave gravada = desligado (decisão antiga: rescisão só no sino/popup por padrão).
      return { canalAtivo: cfg[CHAVE_AVISOS_EMAIL_RESCISAO] === "true", linhas: (data ?? []).map(linhaEmail) };
    }
    const { data, error } = await svc.from("rescisao_avisos_plataforma_destinatarios").select("usuario_id");
    if (error) {
      console.error(`[avisos] Erro ao ler config antiga de rescisão/sino (evento="${evento}"):`, error.message);
      return null;
    }
    return { canalAtivo: null, linhas: (data ?? []).map((d) => linhaUsuario(d.usuario_id)) };
  }

  if (EVENTOS_POR_GRUPO.aso.includes(evento)) {
    if (canal === "email") {
      const { data, error } = await svc.from("funcionario_aso_avisos_email_destinatarios").select("nome, email, ativo");
      if (error) {
        console.error(`[avisos] Erro ao ler config antiga de ASO/e-mail (evento="${evento}"):`, error.message);
        return null;
      }
      return { canalAtivo: null, linhas: (data ?? []).map(linhaEmail) };
    }
    const { data, error } = await svc.from("funcionario_aso_avisos_plataforma_destinatarios").select("usuario_id");
    if (error) {
      console.error(`[avisos] Erro ao ler config antiga de ASO/sino (evento="${evento}"):`, error.message);
      return null;
    }
    return { canalAtivo: null, linhas: (data ?? []).map((d) => linhaUsuario(d.usuario_id)) };
  }

  // Evento fora do catálogo: nada configurado.
  return { canalAtivo: null, linhas: [] };
}

function fonteSupabase(svc: ServiceClient): FonteAvisos {
  return {
    carregarNovo: (evento, canal) => carregarNovo(svc, evento, canal),
    carregarAntigo: (evento, canal) => carregarAntigo(svc, evento, canal),
    carregarPerfis: async (userIds): Promise<PerfilAnalista[] | null> => {
      const { data, error } = await svc
        .from("analistas_perfil")
        .select("user_id, ativo, unidade_id, acesso_todas_unidades, email")
        .in("user_id", userIds);
      if (error) {
        console.error("[avisos] Erro ao buscar analistas:", error.message);
        return null;
      }
      return (data ?? []) as PerfilAnalista[];
    },
  };
}

// Quem recebe o aviso `evento` no `canal`. Lê SÓ as tabelas novas (aviso_eventos_canais e
// aviso_destinatarios); se não houver nada para o evento/canal (ou se elas ainda não existirem),
// usa a configuração antiga de cada módulo, então nada muda até a migration ser aplicada.
//
// Modos:
//   desligado  → canal desligado: ninguém recebe.
//   legado     → canal ligado sem destinatários ativos: vale o "padrão do sistema" de quem chama
//                (vagas: todos os analistas da unidade; rescisão/ASO: ninguém, como sempre foi).
//   configurado → só os destinatários da lista (emails / userIds).
//
// `unidadeId`: omitido (undefined) = sem filtro de analista; informado (mesmo null) = só analistas
// ativos que atendem aquela unidade — o mesmo critério que vagas já usava.
export async function resolverDestinatarios(
  evento: string,
  canal: CanalAviso,
  unidadeId?: string | null,
  svc: ServiceClient = createServiceClient()
): Promise<ResolucaoAviso> {
  try {
    return await resolverComFonte(fonteSupabase(svc), evento, canal, unidadeId);
  } catch (err) {
    console.error(`[resolverDestinatarios] Erro inesperado (evento="${evento}", canal="${canal}"):`, err);
    return { modo: "legado", fonte: "antigo", emails: [], userIds: [], falhou: true };
  }
}
