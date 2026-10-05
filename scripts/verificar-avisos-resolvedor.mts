// Verificação do resolvedor de destinatários de avisos (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-avisos-resolvedor.mts
import assert from "node:assert/strict";
import {
  resolverComFonte, analistaAtendeUnidade, emailsOuPadrao, emailsSomenteConfigurado, executarCanaisIndependentes,
  type DadosAviso, type FonteAvisos, type LinhaDestinatario, type PerfilAnalista,
} from "../src/lib/avisosResolucao.ts";
import { PADRAO_AVISOS, grupoTemPadrao, montarPayloadRestauracao } from "../src/lib/avisosPadrao.ts";
import { EVENTOS_POR_GRUPO, EVENTOS_SEM_LISTA, eventoSemLista, FRASE_SEM_LISTA, ROTULO_GRUPO, grupoDoEvento, EVENTOS_PEDIDO_CLIENTE, canaisDoEvento, descricaoPadraoDoSistema, NOTA_EVENTO, ROTULO_EVENTO } from "../src/lib/avisosCatalogo.ts";
import {
  canalClienteLigado, inicioJanelaAvisos, avisoVisivelParaUsuario, linkPortalValido, chaveDedupAviso, textoAvisoIndicacaoDecidida,
  haQuantoTempo, textoAvisoCandidatoEnviado, textoAvisoEntrevista, decidirAvisoCandidatoEnviado, naoLidosDoSino, pendentesDoPopup, limitarMensagemAviso, DIAS_VISIVEL_AVISO_CLIENTE, type AvisoPortal,
} from "../src/lib/avisoClienteRegras.ts";
import { dataEntrevistaParaCliente, horaEntrevistaReal, decidirAvisoEntrevista } from "../src/lib/horaEntrevista.ts";
import { mensagemErroAcao, MSG_ULTIMO_DESTINATARIO, MSG_ACAO_PADRAO } from "../src/lib/avisosErroAcao.ts";
import { resumirPedidoCliente, type LinhaPedidoCliente } from "../src/lib/pedidoClienteResumo.ts";
import { EVENTO_POR_TIPO_PEDIDO, TIPOS_PEDIDO_CLIENTE, tiposVisiveis, chaveVisto } from "../src/lib/pedidosClientePopup.ts";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message}`); process.exitCode = 1; }
}

const email = (e: string, ativo = true, nome = e): LinhaDestinatario => ({ tipo_destinatario: "email", usuario_id: null, email: e, nome, ativo });
const usuario = (id: string, ativo = true): LinhaDestinatario => ({ tipo_destinatario: "usuario", usuario_id: id, email: null, nome: null, ativo });
const perfil = (id: string, o: Partial<PerfilAnalista> = {}): PerfilAnalista => ({ user_id: id, ativo: true, unidade_id: "U1", acesso_todas_unidades: false, email: `${id}@x.com`, ...o });

interface Cenario { novo?: DadosAviso | null; antigo?: DadosAviso | null; perfis?: PerfilAnalista[] | null; novoErro?: boolean }
function fonte(c: Cenario): FonteAvisos & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    carregarNovo: async () => { chamadas.push("novo"); if (c.novoErro) throw new Error("tabela inexistente"); return c.novo ?? null; },
    carregarAntigo: async () => { chamadas.push("antigo"); return c.antigo ?? null; },
    carregarPerfis: async (ids) => { chamadas.push("perfis"); return c.perfis === null ? null : (c.perfis ?? []).filter((p) => ids.includes(p.user_id)); },
  };
}

(async () => {
  await caso("unidade: sem unidade passa todos", () => assert.equal(analistaAtendeUnidade({ unidade_id: "U1", acesso_todas_unidades: false }, null), true));
  await caso("unidade: outra unidade bloqueia", () => assert.equal(analistaAtendeUnidade({ unidade_id: "U2", acesso_todas_unidades: false }, "U1"), false));
  await caso("unidade: acesso a todas passa", () => assert.equal(analistaAtendeUnidade({ unidade_id: "U2", acesso_todas_unidades: true }, "U1"), true));

  // ── modo configurado / legado / desligado (tabelas novas) ──
  await caso("e-mail configurado: só os ativos, em minúsculas e sem duplicar", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("A@x.com"), email("b@x.com", false), email("a@X.com")] } }), "vaga_criada", "email", null);
    assert.equal(r.modo, "configurado"); assert.equal(r.fonte, "novo");
    assert.deepEqual(r.emails.map((e) => e.email), ["a@x.com"]);
  });
  await caso("canal desligado: modo desligado e ninguém recebe, mesmo com lista", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("a@x.com")] } }), "vaga_fechada", "email", null);
    assert.equal(r.modo, "desligado"); assert.deepEqual(r.emails, []);
  });
  await caso("canal ligado sem destinatários ativos: modo legado", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com", false)] } }), "vaga_criada", "email", null);
    assert.equal(r.modo, "legado"); assert.equal(r.fonte, "novo");
  });
  await caso("linhas sem registro de canal contam como ligado", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: null, linhas: [email("a@x.com")] } }), "vaga_criada", "email", null);
    assert.equal(r.modo, "configurado");
  });

  // ── fallback para as tabelas antigas ──
  await caso("fallback: novo vazio usa o antigo (configurado)", async () => {
    const f = fonte({ novo: { canalAtivo: null, linhas: [] }, antigo: { canalAtivo: null, linhas: [email("velho@x.com")] } });
    const r = await resolverComFonte(f, "rescisao_lancamento", "email");
    assert.equal(r.fonte, "antigo"); assert.equal(r.modo, "configurado"); assert.deepEqual(r.emails.map((e) => e.email), ["velho@x.com"]);
  });
  await caso("fallback: tabelas novas inexistentes (erro) usam o antigo", async () => {
    const r = await resolverComFonte(fonte({ novoErro: true, antigo: { canalAtivo: true, linhas: [email("velho@x.com")] } }), "aso_periodico_vencendo", "email");
    assert.equal(r.fonte, "antigo"); assert.equal(r.falhou, false); assert.equal(r.emails.length, 1);
  });
  await caso("fallback: antigo com chave de e-mail desligada (rescisão) = desligado", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: false, linhas: [email("a@x.com")] } }), "rescisao_lancamento", "email");
    assert.equal(r.modo, "desligado");
  });
  await caso("fallback: antigo vazio = legado (vagas cai no padrão do sistema)", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), "vaga_criada", "sino", null);
    assert.equal(r.modo, "legado"); assert.equal(r.falhou, false);
  });
  await caso("falha em novo E antigo: falhou=true (chamador decide)", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: null }), "vaga_criada", "email", null);
    assert.equal(r.falhou, true); assert.equal(r.modo, "legado");
  });
  await caso("novo com dados NÃO consulta o antigo", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com")] }, antigo: { canalAtivo: null, linhas: [email("velho@x.com")] } });
    await resolverComFonte(f, "vaga_criada", "email", null);
    assert.deepEqual(f.chamadas, ["novo"]);
  });

  // ── sino + filtro de unidade/ativo ──
  await caso("sino com unidade: só analistas ativos que atendem a unidade", async () => {
    const f = fonte({
      novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2"), usuario("u3"), usuario("u4"), usuario("u5", false)] },
      perfis: [perfil("u1"), perfil("u2", { unidade_id: "U2" }), perfil("u3", { unidade_id: "U2", acesso_todas_unidades: true }), perfil("u4", { ativo: false }), perfil("u5")],
    });
    const r = await resolverComFonte(f, "vaga_criada", "sino", "U1");
    assert.equal(r.modo, "configurado"); assert.deepEqual(r.userIds.sort(), ["u1", "u3"]);
  });
  await caso("sino com unidade null (vaga sem unidade): só filtra ativo", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2")] }, perfis: [perfil("u1"), perfil("u2", { ativo: false })] });
    const r = await resolverComFonte(f, "vaga_criada", "sino", null);
    assert.deepEqual(r.userIds, ["u1"]);
  });
  await caso("sino sem unidade (undefined, rescisão/ASO): sem filtro e sem consultar perfis", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2")] } });
    const r = await resolverComFonte(f, "rescisao_lancamento", "sino");
    assert.deepEqual(r.userIds, ["u1", "u2"]); assert.ok(!f.chamadas.includes("perfis"));
  });
  await caso("sino configurado mas ninguém passa no filtro: configurado com lista vazia (ninguém recebe)", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("u1")] }, perfis: [perfil("u1", { unidade_id: "U2" })] });
    const r = await resolverComFonte(f, "vaga_criada", "sino", "U1");
    assert.equal(r.modo, "configurado"); assert.deepEqual(r.userIds, []);
  });
  await caso("falha ao buscar analistas: falhou=true", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("u1")] }, perfis: null }), "vaga_criada", "sino", "U1");
    assert.equal(r.falhou, true);
  });

  // ── unicidade e e-mail por usuário ──
  await caso("e-mail: usuário da plataforma + e-mail livre repetido não duplica", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), email("U1@x.com")] }, perfis: [perfil("u1")] });
    const r = await resolverComFonte(f, "vaga_criada", "email", null);
    assert.deepEqual(r.emails.map((e) => e.email), ["u1@x.com"]);
  });
  await caso("e-mail: usuário inativo ou sem e-mail é ignorado", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2"), usuario("u3"), email("a@x.com")] }, perfis: [perfil("u1", { ativo: false }), perfil("u2", { email: null }), perfil("u3")] });
    const r = await resolverComFonte(f, "rescisao_lancamento", "email");
    assert.deepEqual(r.emails.map((e) => e.email).sort(), ["a@x.com", "u3@x.com"]);
  });
  await caso("e-mail livre: nome vazio usa o próprio e-mail", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [{ ...email("a@x.com"), nome: null }] } }), "vaga_criada", "email", null);
    assert.equal(r.emails[0].nome, "a@x.com");
  });

  // ── Fase 1b: rescisao_paga (12º evento, só sino) ──
  await caso("rescisao_paga: novo vazio cai na lista antiga de plataforma de rescisão (sem filtro)", async () => {
    const f = fonte({ novo: { canalAtivo: null, linhas: [] }, antigo: { canalAtivo: null, linhas: [usuario("u1"), usuario("u2")] } });
    const r = await resolverComFonte(f, "rescisao_paga", "sino");
    assert.equal(r.fonte, "antigo"); assert.equal(r.modo, "configurado"); assert.deepEqual(r.userIds, ["u1", "u2"]); assert.ok(!f.chamadas.includes("perfis"));
  });
  await caso("rescisao_paga: com a migration, a lista nova vale e não consulta a antiga", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("u1")] }, antigo: { canalAtivo: null, linhas: [usuario("u9")] } });
    const r = await resolverComFonte(f, "rescisao_paga", "sino");
    assert.deepEqual(r.userIds, ["u1"]); assert.deepEqual(f.chamadas, ["novo"]);
  });
  await caso("rescisao_paga: sino desligado = ninguém", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), "rescisao_paga", "sino");
    assert.equal(r.modo, "desligado"); assert.deepEqual(r.userIds, []);
  });

  // ── Fase 1b: avisos que tinham destinatários fixos no código (portal / indicação) ──
  const PADRAO_ANTIGO = ["olver@salmazos.com.br", "rh@salmazos.com.br"];
  await caso("fixos: sem configuração (legado) mantém o array antigo", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), "portal_candidato_aprovado", "email");
    assert.deepEqual(emailsOuPadrao(r, PADRAO_ANTIGO), PADRAO_ANTIGO);
  });
  await caso("fixos: falha de leitura também mantém o array antigo", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: null }), "portal_candidato_aprovado", "email");
    assert.deepEqual(emailsOuPadrao(r, PADRAO_ANTIGO), PADRAO_ANTIGO);
  });
  await caso("fixos: configurado usa SÓ a lista nova (desativado fica de fora)", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("olver@salmazos.com.br"), email("rh@salmazos.com.br", false)] } }), "indicacao_decisao_cliente", "email");
    assert.deepEqual(emailsOuPadrao(r, PADRAO_ANTIGO), ["olver@salmazos.com.br"]);
  });
  await caso("fixos: canal desligado = ninguém (não volta ao array)", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("olver@salmazos.com.br")] } }), "portal_candidato_aprovado", "email");
    assert.deepEqual(emailsOuPadrao(r, PADRAO_ANTIGO), []);
  });
  await caso("reprovação: sem config (legado) NÃO envia nada", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), "portal_candidato_reprovado", "email");
    assert.deepEqual(emailsSomenteConfigurado(r), []);
  });
  await caso("reprovação: desligado (como nasce) NÃO envia, mesmo com lista", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("olver@salmazos.com.br"), email("rh@salmazos.com.br")] } }), "portal_candidato_reprovado", "email");
    assert.deepEqual(emailsSomenteConfigurado(r), []);
  });
  await caso("reprovação: ligado com lista envia só aos ativos", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("olver@salmazos.com.br"), email("rh@salmazos.com.br", false)] } }), "portal_candidato_reprovado", "email");
    assert.deepEqual(emailsSomenteConfigurado(r), ["olver@salmazos.com.br"]);
  });

  // ── Fase 1b: padrão do sistema (Vagas) e restauração ──
  const TODOS = new Set<string>();
  for (const evento of Object.values(PADRAO_AVISOS.vagas)) for (const c of Object.values(evento)) for (const d of c.destinatarios) if (d.tipo_destinatario === "usuario") TODOS.add(d.usuario_id);

  await caso("padrão: só vagas e portal_cliente têm padrão", () => { assert.equal(grupoTemPadrao("vagas"), true); assert.equal(grupoTemPadrao("portal_cliente"), true); assert.equal(grupoTemPadrao("rescisao"), false); });
  await caso("padrão vagas: 5 eventos, espelho da carga inicial (e-mail 2/3/3/0/3, sino 7/7/7/7/3)", () => {
    const p = PADRAO_AVISOS.vagas;
    assert.deepEqual(Object.keys(p).sort(), ["solicitacao_vaga", "vaga_cancelada", "vaga_criada", "vaga_fechada", "vaga_reativada"]);
    const n = (ev: string, c: "email" | "sino") => p[ev][c]!.destinatarios.length;
    assert.deepEqual(["vaga_criada", "solicitacao_vaga", "vaga_cancelada", "vaga_fechada", "vaga_reativada"].map((ev) => n(ev, "email")), [2, 3, 3, 0, 3]);
    assert.deepEqual(["vaga_criada", "solicitacao_vaga", "vaga_cancelada", "vaga_fechada", "vaga_reativada"].map((ev) => n(ev, "sino")), [7, 7, 7, 7, 3]);
    assert.equal(p.vaga_fechada.email!.ativo, false);
  });
  await caso("padrão vagas: sem duplicados por evento/canal e todo canal ligado tem destinatário", () => {
    for (const [ev, canais] of Object.entries(PADRAO_AVISOS.vagas)) for (const [canal, c] of Object.entries(canais)) {
      const chaves = c.destinatarios.map((d) => (d.tipo_destinatario === "usuario" ? d.usuario_id : d.email.toLowerCase()));
      assert.equal(new Set(chaves).size, chaves.length, `${ev}/${canal} duplicado`);
      if (c.ativo) assert.ok(c.destinatarios.length > 0, `${ev}/${canal} ligado sem destinatário`);
    }
  });
  await caso("restauração: todos ativos = payload completo, nada ignorado", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    assert.deepEqual(r.ignorados, []); assert.deepEqual(r.semDestinatario, []);
    assert.equal(r.payload.eventos.length, 5);
    // 10 canais de e-mail/sino + o popup de solicitacao_vaga (Fase 3, bloco 1)
    assert.equal(r.payload.eventos.flatMap((e) => e.canais).length, 11);
  });
  await caso("restauração: usuário inativo fica de fora e é informado", () => {
    const sem = new Set(TODOS); const alvo = [...TODOS][0]; sem.delete(alvo);
    const r = montarPayloadRestauracao("vagas", sem);
    assert.ok(r.ignorados.length > 0); assert.deepEqual(r.semDestinatario, []);
  });
  await caso("restauração: canal ligado que ficaria vazio é sinalizado (regra do último destinatário)", () => {
    const r = montarPayloadRestauracao("vagas", new Set());
    assert.ok(r.semDestinatario.some((x) => x.evento === "vaga_criada" && x.canal === "sino"));
    // vaga_fechada/e-mail está desligado e vazio: NÃO é violação
    assert.ok(!r.semDestinatario.some((x) => x.evento === "vaga_fechada" && x.canal === "email"));
  });
  await caso("restauração: e-mails vão em minúsculas e usuários só com usuario_id", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    const emails = r.payload.eventos.flatMap((e) => e.canais).flatMap((c) => c.destinatarios).filter((d) => d.tipo_destinatario === "email");
    assert.ok(emails.every((d) => d.email === d.email.toLowerCase()));
    const usu = r.payload.eventos.flatMap((e) => e.canais).flatMap((c) => c.destinatarios).filter((d) => d.tipo_destinatario === "usuario");
    assert.ok(usu.every((d) => !("email" in d) && !!d.usuario_id));
  });

  // ── Fase 1c: indicacao_candidato_recebida (e-mail, sino e popup) ──
  const EV = "indicacao_candidato_recebida";
  const dez = Array.from({ length: 10 }, (_, i) => usuario(`a${i}`));
  const perfisUnidade = (n: number): PerfilAnalista[] => Array.from({ length: n }, (_, i) => perfil(`a${i}`, { unidade_id: i < 8 ? "MM" : "SBC", acesso_todas_unidades: i === 0 }));

  for (const canal of ["email", "sino", "popup"] as const) {
    await caso(`1c fallback (${canal}): sem config nova e sem config antiga = legado, sem lista`, async () => {
      const r = await resolverComFonte(fonte({ novo: { canalAtivo: null, linhas: [] }, antigo: { canalAtivo: null, linhas: [] } }), EV, canal, "MM");
      assert.equal(r.modo, "legado"); assert.deepEqual(r.userIds, []); assert.deepEqual(r.emails, []); assert.equal(r.falhou, false);
    });
    await caso(`1c fallback (${canal}): tabelas novas inexistentes (erro) = legado`, async () => {
      const r = await resolverComFonte(fonte({ novoErro: true, antigo: { canalAtivo: null, linhas: [] } }), EV, canal, "MM");
      assert.equal(r.modo, "legado");
    });
    await caso(`1c canal desligado (${canal}): ninguém, mesmo com lista`, async () => {
      const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: dez }, perfis: perfisUnidade(10) }), EV, canal, "MM");
      assert.equal(r.modo, "desligado"); assert.deepEqual(r.userIds, []); assert.deepEqual(r.emails, []);
    });
  }
  await caso("1c popup: lista configurada devolve só usuarios (userIds), sem filtro de unidade e sem e-mails", async () => {
    const f = fonte({ novo: { canalAtivo: true, linhas: [usuario("a1"), usuario("a2"), usuario("a3", false)] } });
    const r = await resolverComFonte(f, EV, "popup");
    assert.equal(r.modo, "configurado"); assert.deepEqual(r.userIds, ["a1", "a2"]); assert.deepEqual(r.emails, []); assert.ok(!f.chamadas.includes("perfis"));
  });
  await caso("1c popup: só vê quem está na lista (usuário fora da lista não está em userIds)", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("a1")] } }), EV, "popup");
    assert.ok(r.userIds.includes("a1")); assert.ok(!r.userIds.includes("a5"));
  });
  await caso("1c popup: lista com todos desativados = legado (ninguém vê)", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("a1", false)] } }), EV, "popup");
    assert.equal(r.modo, "legado"); assert.deepEqual(r.userIds, []);
  });
  await caso("1c popup: falha ao ler (novo e antigo) = falhou, sem lista", async () => {
    const r = await resolverComFonte(fonte({ novo: null, antigo: null }), EV, "popup");
    assert.equal(r.falhou, true); assert.deepEqual(r.userIds, []);
  });
  await caso("1c sino com a carga de 10 e unidade MM: filtro de unidade fixo (8 da unidade + sócio com acesso a todas)", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: dez }, perfis: perfisUnidade(10) }), EV, "sino", "MM");
    assert.deepEqual(r.userIds.sort(), ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
  });
  await caso("1c sino unidade SBC: só os 2 de SBC + quem tem acesso a todas", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: dez }, perfis: perfisUnidade(10) }), EV, "sino", "SBC");
    assert.deepEqual(r.userIds.sort(), ["a0", "a8", "a9"]);
  });
  await caso("1c e-mail por usuário: resolve o e-mail do perfil e respeita a unidade", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: dez }, perfis: perfisUnidade(10) }), EV, "email", "SBC");
    assert.deepEqual(r.emails.map((e) => e.email).sort(), ["a0@x.com", "a8@x.com", "a9@x.com"]);
  });

  // isolamento de canais
  await caso("1c isolamento: falha do sino não impede o e-mail (e vice-versa) e nada lança", async () => {
    const ordem: string[] = []; const erros: string[] = [];
    const r = await executarCanaisIndependentes("teste", {
      sino: async () => { ordem.push("sino"); throw new Error("banco fora"); },
      email: async () => { ordem.push("email"); },
    }, (m) => erros.push(m));
    assert.deepEqual(ordem.sort(), ["email", "sino"]);
    assert.deepEqual(r, [{ canal: "sino", ok: false }, { canal: "email", ok: true }]);
    assert.equal(erros.length, 1); assert.ok(erros[0].includes("sino") && erros[0].includes("teste"));
  });
  await caso("1c isolamento: exceção síncrona numa tarefa também é contida", async () => {
    const r = await executarCanaisIndependentes("t", { a: () => { throw new Error("x"); }, b: async () => 1 }, () => {});
    assert.deepEqual(r.map((x) => x.ok), [false, true]);
  });
  await caso("1c isolamento: todos falham = ainda não lança", async () => {
    const r = await executarCanaisIndependentes("t", { a: async () => { throw new Error("1"); }, b: async () => { throw new Error("2"); } }, () => {});
    assert.deepEqual(r.map((x) => x.ok), [false, false]);
  });

  // padrão Portal do cliente
  await caso("1c padrão portal_cliente: 8 eventos (4 da Fase 3); recebida com 10 analistas nos 3 canais; reprovado desligado", () => {
    const p = PADRAO_AVISOS.portal_cliente;
    assert.deepEqual(Object.keys(p).sort(), ["agendamento_cliente", "indicacao_candidato_recebida", "indicacao_decisao_cliente", "portal_candidato_aprovado", "portal_candidato_reprovado", "solicitacao_alteracao_pedida", "vaga_pausa_pedida", "vaga_reativacao_pedida"]);
    for (const c of ["email", "sino", "popup"] as const) assert.equal(p.indicacao_candidato_recebida[c]!.destinatarios.length, 10);
    assert.equal(p.portal_candidato_reprovado.email!.ativo, false);
    const ids = p.indicacao_candidato_recebida.popup!.destinatarios.map((d) => (d.tipo_destinatario === "usuario" ? d.usuario_id : ""));
    assert.equal(new Set(ids).size, 10);
  });
  await caso("1c restauração portal_cliente: payload com popup; inativo ignorado e informado; vazio = 409", () => {
    const ids = new Set(PADRAO_AVISOS.portal_cliente.indicacao_candidato_recebida.email!.destinatarios.flatMap((d) => (d.tipo_destinatario === "usuario" ? [d.usuario_id] : [])));
    const ok = montarPayloadRestauracao("portal_cliente", ids);
    assert.deepEqual(ok.semDestinatario, []); assert.equal(ok.payload.eventos.length, 8);
    assert.ok(ok.payload.eventos.find((e) => e.evento === "indicacao_candidato_recebida")!.canais.some((c) => c.canal === "popup"));
    const sem = new Set(ids); sem.delete([...ids][0]);
    assert.ok(montarPayloadRestauracao("portal_cliente", sem).ignorados.length >= 3);
    const vazio = montarPayloadRestauracao("portal_cliente", new Set());
    assert.ok(vazio.semDestinatario.some((x) => x.evento === "indicacao_candidato_recebida" && x.canal === "popup"));
    assert.ok(!vazio.semDestinatario.some((x) => x.evento === "portal_candidato_reprovado"));
  });

  // ── Fase 3, bloco 1: pedidos do cliente, agendamento sem responsável e popup de solicitação ──
  const NOVOS = [...EVENTOS_PEDIDO_CLIENTE, "agendamento_cliente"];
  const unidadeMM = (n: number): PerfilAnalista[] => Array.from({ length: n }, (_, i) => perfil(`p${i}`, { unidade_id: i < 4 ? "MM" : "SBC", acesso_todas_unidades: i === 0 }));

  await caso("3 catálogo: 4 eventos novos no grupo portal_cliente, com rótulo e nota, e solicitacao_vaga segue em vagas", () => {
    for (const ev of NOVOS) {
      assert.ok(EVENTOS_POR_GRUPO.portal_cliente.includes(ev), ev); assert.ok(ROTULO_EVENTO[ev], ev); assert.ok(NOTA_EVENTO[ev], ev);
    }
    assert.ok(EVENTOS_POR_GRUPO.vagas.includes("solicitacao_vaga")); assert.ok(!EVENTOS_POR_GRUPO.portal_cliente.includes("solicitacao_vaga"));
  });
  await caso("3 catálogo: popup só nos 3 pedidos e em solicitacao_vaga; agendamento só e-mail e sino", () => {
    for (const ev of [...EVENTOS_PEDIDO_CLIENTE, "solicitacao_vaga"]) assert.deepEqual([...canaisDoEvento(ev)], ["email", "sino", "popup"], ev);
    assert.deepEqual([...canaisDoEvento("agendamento_cliente")], ["email", "sino"]);
    assert.deepEqual([...canaisDoEvento("vaga_criada")], ["email", "sino"]);
  });
  await caso("3 catálogo: textos explicam o padrão sem lista (popup de solicitação = unidade; popup de pedidos = ninguém)", () => {
    assert.match(descricaoPadraoDoSistema("vagas", "popup", "solicitacao_vaga"), /todos os analistas ativos da unidade/);
    for (const ev of EVENTOS_PEDIDO_CLIENTE) assert.match(descricaoPadraoDoSistema("portal_cliente", "popup", ev), /ninguém vê/);
    for (const ev of NOVOS) assert.match(descricaoPadraoDoSistema("portal_cliente", "email", ev), /analistas da unidade/);
    assert.match(NOTA_EVENTO.agendamento_cliente, /responsável/); assert.match(NOTA_EVENTO.agendamento_cliente, /fixa/);
  });

  for (const ev of NOVOS) for (const canal of ["email", "sino"] as const) {
    await caso(`3 fallback (${ev}/${canal}): sem config nova e sem antiga = legado (comportamento antigo), sem lista`, async () => {
      const r = await resolverComFonte(fonte({ novo: { canalAtivo: null, linhas: [] }, antigo: { canalAtivo: null, linhas: [] } }), ev, canal, "MM");
      assert.equal(r.modo, "legado"); assert.deepEqual(r.userIds, []); assert.deepEqual(r.emails, []); assert.equal(r.falhou, false);
    });
    await caso(`3 fallback (${ev}/${canal}): tabelas novas inexistentes (erro) = legado`, async () => {
      const r = await resolverComFonte(fonte({ novoErro: true, antigo: { canalAtivo: null, linhas: [] } }), ev, canal, "MM");
      assert.equal(r.modo, "legado");
    });
    await caso(`3 canal desligado (${ev}/${canal}): ninguém, mesmo com lista`, async () => {
      const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("p1"), email("a@x.com")] }, perfis: unidadeMM(8) }), ev, canal, "MM");
      assert.equal(r.modo, "desligado"); assert.deepEqual(r.userIds, []); assert.deepEqual(r.emails, []);
    });
  }
  await caso("3 sino de pedido: lista configurada = uma linha por usuário e filtro de unidade fixo por cima", async () => {
    const lista = Array.from({ length: 8 }, (_, i) => usuario(`p${i}`));
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: lista }, perfis: unidadeMM(8) }), "vaga_pausa_pedida", "sino", "MM");
    assert.equal(r.modo, "configurado"); assert.deepEqual(r.userIds.sort(), ["p0", "p1", "p2", "p3"]);
  });
  await caso("3 sino de pedido: usuário inativo na lista fica de fora; todos fora = lista vazia (não cai em broadcast)", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("p1")] }, perfis: [perfil("p1", { ativo: false })] }), "vaga_reativacao_pedida", "sino", "U1");
    assert.equal(r.modo, "configurado"); assert.deepEqual(r.userIds, []);
  });
  await caso("3 e-mail de pedido: e-mails livres da lista são mantidos; usuário de outra unidade é barrado", async () => {
    const lista = [email("livre@x.com"), usuario("p0"), usuario("p5")];
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: lista }, perfis: unidadeMM(8) }), "solicitacao_alteracao_pedida", "email", "MM");
    assert.deepEqual(r.emails.map((e) => e.email).sort(), ["livre@x.com", "p0@x.com"]);
  });
  await caso("3 agendamento sem responsável: carga copiada (3 e-mails, 7 no sino) dá 3 e 4 após filtro de unidade MM", async () => {
    const sinoLista = Array.from({ length: 7 }, (_, i) => usuario(`p${i}`));
    const sino = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: sinoLista }, perfis: unidadeMM(8) }), "agendamento_cliente", "sino", "MM");
    assert.deepEqual(sino.userIds.sort(), ["p0", "p1", "p2", "p3"]);
    const mail = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com"), email("b@x.com"), email("c@x.com")] } }), "agendamento_cliente", "email", "MM");
    assert.equal(mail.emails.length, 3);
  });
  await caso("3 isolamento: falha do sino não impede o e-mail do pedido (nem o inverso) e nada lança", async () => {
    const erros: string[] = []; const ordem: string[] = [];
    const r = await executarCanaisIndependentes("POST /api/portal/solicitacoes/[id]/alteracao", {
      sino: async () => { ordem.push("sino"); throw new Error("banco fora"); },
      email: async () => { ordem.push("email"); },
    }, (m) => erros.push(m));
    assert.deepEqual(ordem.sort(), ["email", "sino"]); assert.deepEqual(r.map((x) => x.ok), [false, true]); assert.equal(erros.length, 1);
    const r2 = await executarCanaisIndependentes("t", { sino: async () => {}, email: async () => { throw new Error("smtp"); } }, () => {});
    assert.deepEqual(r2.map((x) => x.ok), [true, false]);
  });

  // popup de solicitacao_vaga: lista, desligado e critério antigo
  await caso("3 popup solicitacao_vaga: sem config (nem nova nem antiga) = legado → vale o critério antigo", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: null, linhas: [] }, antigo: { canalAtivo: null, linhas: [] } }), "solicitacao_vaga", "popup");
    assert.equal(r.modo, "legado"); assert.deepEqual(r.userIds, []); assert.equal(r.falhou, false);
  });
  await caso("3 popup solicitacao_vaga: tabelas novas indisponíveis (erro) = legado (critério antigo)", async () => {
    const r = await resolverComFonte(fonte({ novoErro: true, antigo: { canalAtivo: null, linhas: [] } }), "solicitacao_vaga", "popup");
    assert.equal(r.modo, "legado");
  });
  await caso("3 popup solicitacao_vaga: canal desligado = ninguém vê", async () => {
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("p1")] } }), "solicitacao_vaga", "popup");
    assert.equal(r.modo, "desligado"); assert.deepEqual(r.userIds, []);
  });
  await caso("3 popup solicitacao_vaga: lista configurada = só quem está nela (os 8 da carga; Victor e Susana SBC fora)", async () => {
    const oito = Array.from({ length: 8 }, (_, i) => usuario(`p${i}`));
    const r = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: oito } }), "solicitacao_vaga", "popup");
    assert.equal(r.modo, "configurado"); assert.equal(r.userIds.length, 8); assert.ok(!r.userIds.includes("p8") && !r.userIds.includes("p9"));
  });

  // popup "Pedidos do cliente": por tipo, cada um com a sua lista
  const lista = (modo: string, ...userIds: string[]) => ({ modo, userIds });
  await caso("3 popup pedidos: cada tipo tem o seu evento e a sua lista", () => {
    assert.deepEqual(TIPOS_PEDIDO_CLIENTE.map((t) => EVENTO_POR_TIPO_PEDIDO[t]), [...EVENTOS_PEDIDO_CLIENTE]);
    const v = tiposVisiveis({ alteracao: lista("configurado", "u1"), reativacao: lista("configurado", "u2"), pausa: lista("configurado", "u1", "u2") }, "u1");
    assert.deepEqual(v, ["alteracao", "pausa"]);
  });
  await caso("3 popup pedidos: sem config (legado), desligado e fora da lista = tipo não aparece", () => {
    const v = tiposVisiveis({ alteracao: lista("legado"), reativacao: lista("desligado", "u1"), pausa: lista("configurado", "u9") }, "u1");
    assert.deepEqual(v, []);
  });
  await caso("3 popup pedidos: chave de visto separa tipos com o mesmo id", () => {
    assert.notEqual(chaveVisto("alteracao", "x"), chaveVisto("pausa", "x"));
  });

  // padrão (Restaurar) e carga
  await caso("3 padrão: carga dos 4 eventos novos = e-mail 3 / sino 7 / popup 8 (agendamento sem popup); todos ligados", () => {
    const p = PADRAO_AVISOS.portal_cliente;
    for (const ev of EVENTOS_PEDIDO_CLIENTE) {
      assert.deepEqual(["email", "sino", "popup"].map((c) => p[ev][c as "email"]!.destinatarios.length), [3, 7, 8], ev);
      for (const c of ["email", "sino", "popup"] as const) assert.equal(p[ev][c]!.ativo, true);
    }
    assert.deepEqual(["email", "sino"].map((c) => p.agendamento_cliente[c as "email"]!.destinatarios.length), [3, 7]);
    assert.equal(p.agendamento_cliente.popup, undefined);
  });
  await caso("3 padrão: popup de solicitacao_vaga (grupo Vagas) com os mesmos 8; e-mail e sino dele não mudaram", () => {
    const sv = PADRAO_AVISOS.vagas.solicitacao_vaga;
    assert.equal(sv.popup!.destinatarios.length, 8); assert.equal(sv.popup!.ativo, true);
    assert.equal(sv.email!.destinatarios.length, 3); assert.equal(sv.sino!.destinatarios.length, 7);
    const nomes = sv.popup!.destinatarios.map((d) => d.nome).join("|");
    assert.ok(!nomes.includes("Victor") && !nomes.includes("São Bernardo"));
  });
  await caso("3 padrão: sem duplicados e todo canal ligado tem destinatário (portal_cliente inteiro)", () => {
    for (const [ev, canais] of Object.entries(PADRAO_AVISOS.portal_cliente)) for (const [canal, c] of Object.entries(canais)) {
      const chaves = c.destinatarios.map((d) => (d.tipo_destinatario === "usuario" ? d.usuario_id : d.email.toLowerCase()));
      assert.equal(new Set(chaves).size, chaves.length, `${ev}/${canal} duplicado`);
      if (c.ativo) assert.ok(c.destinatarios.length > 0, `${ev}/${canal} ligado sem destinatário`);
    }
  });
  await caso("3 restauração Vagas recria o popup de solicitacao_vaga; usuário inativo ignorado e informado; vazio = 409", () => {
    const todos = new Set<string>();
    for (const ev of Object.values(PADRAO_AVISOS.vagas)) for (const c of Object.values(ev)) for (const d of c.destinatarios) if (d.tipo_destinatario === "usuario") todos.add(d.usuario_id);
    const r = montarPayloadRestauracao("vagas", todos);
    const sv = r.payload.eventos.find((e) => e.evento === "solicitacao_vaga")!;
    assert.deepEqual(sv.canais.map((c) => c.canal).sort(), ["email", "popup", "sino"]);
    assert.equal(sv.canais.find((c) => c.canal === "popup")!.destinatarios.length, 8);
    const alvo = PADRAO_AVISOS.vagas.solicitacao_vaga.popup!.destinatarios.map((d) => (d.tipo_destinatario === "usuario" ? d.usuario_id : ""))[0];
    const sem = new Set(todos); sem.delete(alvo);
    assert.ok(montarPayloadRestauracao("vagas", sem).ignorados.some((x) => x.evento === "solicitacao_vaga" && x.canal === "popup"));
    assert.ok(montarPayloadRestauracao("vagas", new Set()).semDestinatario.some((x) => x.evento === "solicitacao_vaga" && x.canal === "popup"));
  });
  await caso("3 restauração portal_cliente: pedidos têm popup no payload e canal ligado vazio é sinalizado (409)", () => {
    const ids = new Set(PADRAO_AVISOS.portal_cliente.indicacao_candidato_recebida.email!.destinatarios.flatMap((d) => (d.tipo_destinatario === "usuario" ? [d.usuario_id] : [])));
    const ok = montarPayloadRestauracao("portal_cliente", ids);
    assert.deepEqual(ok.semDestinatario, []);
    for (const ev of EVENTOS_PEDIDO_CLIENTE) assert.ok(ok.payload.eventos.find((e) => e.evento === ev)!.canais.some((c) => c.canal === "popup"), ev);
    const vazio = montarPayloadRestauracao("portal_cliente", new Set());
    assert.ok(vazio.semDestinatario.some((x) => x.evento === "vaga_pausa_pedida" && x.canal === "popup"));
    assert.ok(vazio.semDestinatario.some((x) => x.evento === "agendamento_cliente" && x.canal === "sino"));
  });

  // ── Ajustes pós-teste: rótulo do encerramento e resultado do pedido no portal ──
  await caso("ajuste 1: evento vaga_pausa_pedida mostra 'Cliente pediu encerramento de vaga' (id e canais iguais)", () => {
    assert.equal(ROTULO_EVENTO.vaga_pausa_pedida, "Cliente pediu encerramento de vaga");
    assert.ok(EVENTOS_PEDIDO_CLIENTE.includes("vaga_pausa_pedida")); assert.deepEqual([...canaisDoEvento("vaga_pausa_pedida")], ["email", "sino", "popup"]);
    assert.match(NOTA_EVENTO.vaga_pausa_pedida, /encerramento/); assert.match(NOTA_EVENTO.vaga_pausa_pedida, /painel de Vagas/);
    assert.ok(!Object.values(ROTULO_EVENTO).some((r) => r.includes("pausa ou encerramento")));
  });

  const AGORA = new Date("2026-10-10T12:00:00Z");
  const pedido = (status: string, criado: string, decidido: string | null = null, motivo: string | null = null): LinhaPedidoCliente => ({ status, criado_em: criado, decidido_em: decidido, motivo_recusa: motivo });
  await caso("ajuste 3: sem pedidos = nada no card", () => assert.equal(resumirPedidoCliente([], AGORA), null));
  await caso("ajuste 3: pendente aparece com a data de envio e sem motivo", () => {
    const r = resumirPedidoCliente([pedido("pendente", "2026-10-09T10:00:00Z")], AGORA)!;
    assert.deepEqual(r, { status: "pendente", data: "2026-10-09T10:00:00Z", motivo_recusa: null });
  });
  await caso("ajuste 3: pendente tem prioridade sobre decidido mais novo e mais antigo", () => {
    const r = resumirPedidoCliente([pedido("recusada", "2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z", "x"), pedido("pendente", "2026-10-08T10:00:00Z")], AGORA)!;
    assert.equal(r.status, "pendente");
  });
  await caso("ajuste 3: recusado mostra a data da decisão e o motivo", () => {
    const r = resumirPedidoCliente([pedido("recusada", "2026-10-01T10:00:00Z", "2026-10-05T15:00:00Z", "  Vaga já está em andamento  ")], AGORA)!;
    assert.equal(r.status, "recusada"); assert.equal(r.data, "2026-10-05T15:00:00Z"); assert.equal(r.motivo_recusa, "Vaga já está em andamento");
  });
  await caso("ajuste 3: recusado sem motivo (ou só espaços) mostra só a recusa", () => {
    assert.equal(resumirPedidoCliente([pedido("recusada", "2026-10-01T10:00:00Z", "2026-10-05T15:00:00Z", null)], AGORA)!.motivo_recusa, null);
    assert.equal(resumirPedidoCliente([pedido("recusada", "2026-10-01T10:00:00Z", "2026-10-05T15:00:00Z", "   ")], AGORA)!.motivo_recusa, null);
  });
  await caso("ajuste 3: aprovado nunca expõe motivo, mesmo que exista texto gravado", () => {
    const r = resumirPedidoCliente([pedido("aprovada", "2026-10-01T10:00:00Z", "2026-10-05T15:00:00Z", "nota interna")], AGORA)!;
    assert.equal(r.status, "aprovada"); assert.equal(r.motivo_recusa, null);
  });
  await caso("ajuste 3: decidido há mais de 30 dias some; dentro dos 30 dias aparece", () => {
    assert.equal(resumirPedidoCliente([pedido("aprovada", "2026-08-01T10:00:00Z", "2026-09-09T11:59:00Z")], AGORA), null);
    assert.equal(resumirPedidoCliente([pedido("aprovada", "2026-08-01T10:00:00Z", "2026-09-11T12:00:00Z")], AGORA)!.status, "aprovada");
  });
  await caso("ajuste 3: substituído e status desconhecido nunca aparecem; o decidido mais recente vence", () => {
    assert.equal(resumirPedidoCliente([pedido("substituida", "2026-10-08T10:00:00Z", "2026-10-09T10:00:00Z")], AGORA), null);
    const r = resumirPedidoCliente([pedido("recusada", "2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z", "a"), pedido("aprovada", "2026-10-03T10:00:00Z", "2026-10-06T10:00:00Z")], AGORA)!;
    assert.equal(r.status, "aprovada");
  });
  await caso("ajuste 3: o resumo só tem status, data e motivo (nada interno vai ao cliente)", () => {
    const r = resumirPedidoCliente([{ ...pedido("recusada", "2026-10-01T10:00:00Z", "2026-10-05T15:00:00Z", "m"), decidido_por: "Analista X" } as LinhaPedidoCliente], AGORA)!;
    assert.deepEqual(Object.keys(r).sort(), ["data", "motivo_recusa", "status"]);
  });

  // ── Erro inline da tela de Avisos (409 → mensagem), sem rede ──
  const TEXTO_409 = "Não é possível: este é o último destinatário ativo do canal. Adicione outra pessoa antes ou desligue o canal.";
  await caso("erro inline: texto do último destinatário é exatamente o combinado", () => assert.equal(MSG_ULTIMO_DESTINATARIO, TEXTO_409));
  await caso("erro inline: 409 em desativar/remover (ação de linha) sempre usa o texto do último destinatário, mesmo com outro texto da API", () => {
    assert.equal(mensagemErroAcao(409, { error: "Não é possível remover ou desativar o último destinatário ativo de \"x\"…" }, true), TEXTO_409);
    assert.equal(mensagemErroAcao(409, {}, true), TEXTO_409); assert.equal(mensagemErroAcao(409, null, true), TEXTO_409); assert.equal(mensagemErroAcao(409, undefined, true), TEXTO_409);
  });
  await caso("erro inline: 409 de outra ação (adicionar duplicado) mantém o texto da API", () => {
    assert.equal(mensagemErroAcao(409, { error: "Este destinatário já está cadastrado para este aviso." }), "Este destinatário já está cadastrado para este aviso.");
  });
  await caso("erro inline: 409 sem texto e fora de ação de linha cai no texto do último destinatário", () => assert.equal(mensagemErroAcao(409, {}), TEXTO_409));
  await caso("erro inline: outros status usam o texto da API (error, mensagem ou message) ou o padrão", () => {
    assert.equal(mensagemErroAcao(400, { error: "Analista inativo ou não encontrado." }, true), "Analista inativo ou não encontrado.");
    assert.equal(mensagemErroAcao(500, { mensagem: "falhou" }), "falhou"); assert.equal(mensagemErroAcao(500, { message: "falhou 2" }), "falhou 2");
    assert.equal(mensagemErroAcao(500, {}), MSG_ACAO_PADRAO); assert.equal(mensagemErroAcao(404, { error: "   " }, true), MSG_ACAO_PADRAO);
    assert.equal(mensagemErroAcao(400, { error: 42 }), MSG_ACAO_PADRAO);
  });

  // ── Avisos ao cliente (sino e popup no portal): bloco 1 ──
  await caso("avisos ao cliente: grupo novo, só com a indicação decidida, rótulo e canais sino/popup", () => {
    assert.deepEqual(EVENTOS_POR_GRUPO.avisos_cliente, ["indicacao_decidida_cliente", "candidato_enviado_cliente", "entrevista_agendada_cliente", "entrevista_remarcada_cliente"]);
    assert.equal(ROTULO_GRUPO.avisos_cliente, "Avisos ao cliente");
    assert.equal(ROTULO_EVENTO.indicacao_decidida_cliente, "Indicação direta decidida pela Salmazos");
    assert.deepEqual([...canaisDoEvento("indicacao_decidida_cliente")], ["sino", "popup"]);
    assert.equal(grupoDoEvento("indicacao_decidida_cliente"), "avisos_cliente");
    assert.ok(NOTA_EVENTO.indicacao_decidida_cliente.includes("Minhas Indicações"));
  });
  await caso("avisos ao cliente: evento SEM lista (só liga/desliga), sem Restaurar padrão e com a frase combinada", () => {
    assert.deepEqual([...EVENTOS_SEM_LISTA], ["indicacao_decidida_cliente", "candidato_enviado_cliente", "entrevista_agendada_cliente", "entrevista_remarcada_cliente"]);
    assert.equal(eventoSemLista("indicacao_decidida_cliente"), true);
    assert.equal(eventoSemLista("candidato_enviado_cliente"), true);
    for (const ev of ["solicitacao_vaga", "vaga_pausa_pedida", "portal_candidato_aprovado", "rescisao_paga", ""]) assert.equal(eventoSemLista(ev), false, ev);
    assert.equal(grupoTemPadrao("avisos_cliente"), false);
    assert.equal(FRASE_SEM_LISTA, "Ligado: todos os usuários do portal do cliente recebem. Desligado: ninguém.");
    for (const canal of ["sino", "popup"]) assert.equal(descricaoPadraoDoSistema("avisos_cliente", canal, "indicacao_decidida_cliente"), FRASE_SEM_LISTA);
  });
  await caso("avisos ao cliente: os eventos e a lista dos outros grupos não mudaram", () => {
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 5); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
    assert.deepEqual([...canaisDoEvento("vaga_criada")], ["email", "sino"]);
  });

  await caso("avisoClienteLigado: sem linha de canal => NÃO envia", () => {
    assert.equal(canalClienteLigado({ linha: null, erro: false }), false);
    assert.equal(canalClienteLigado({ linha: undefined, erro: false }), false);
  });
  await caso("avisoClienteLigado: erro de leitura => NÃO envia, mesmo que haja linha ligada", () => {
    assert.equal(canalClienteLigado({ linha: { ativo: true }, erro: true }), false);
    assert.equal(canalClienteLigado({ linha: null, erro: true }), false);
  });
  await caso("avisoClienteLigado: só envia com linha ativo=true (ativo false ou nulo = desligado)", () => {
    assert.equal(canalClienteLigado({ linha: { ativo: true }, erro: false }), true);
    assert.equal(canalClienteLigado({ linha: { ativo: false }, erro: false }), false);
    assert.equal(canalClienteLigado({ linha: { ativo: null }, erro: false }), false);
  });

  const HOJE = new Date("2026-10-20T12:00:00Z");
  await caso("visibilidade: janela de 30 dias esconde o mais antigo (sem apagar)", () => {
    assert.equal(DIAS_VISIVEL_AVISO_CLIENTE, 30);
    assert.equal(avisoVisivelParaUsuario("2026-10-19T12:00:00Z", "2026-01-01T00:00:00Z", HOJE), true);
    assert.equal(avisoVisivelParaUsuario("2026-09-20T12:00:00Z", "2026-01-01T00:00:00Z", HOJE), true);
    assert.equal(avisoVisivelParaUsuario("2026-09-20T11:59:59Z", "2026-01-01T00:00:00Z", HOJE), false);
  });
  await caso("visibilidade: o usuário só vê avisos criados DEPOIS de entrar no portal", () => {
    assert.equal(avisoVisivelParaUsuario("2026-10-10T10:00:00Z", "2026-10-15T00:00:00Z", HOJE), false);
    assert.equal(avisoVisivelParaUsuario("2026-10-15T00:00:00Z", "2026-10-15T00:00:00Z", HOJE), true);
    assert.equal(avisoVisivelParaUsuario("2026-10-16T00:00:00Z", "2026-10-15T00:00:00Z", HOJE), true);
  });
  await caso("visibilidade: início da consulta = o mais recente entre 30 dias atrás e a entrada do usuário", () => {
    assert.equal(inicioJanelaAvisos("2026-01-01T00:00:00Z", HOJE), "2026-09-20T12:00:00.000Z");
    assert.equal(inicioJanelaAvisos("2026-10-15T00:00:00Z", HOJE), "2026-10-15T00:00:00.000Z");
    assert.equal(inicioJanelaAvisos(null, HOJE), "2026-09-20T12:00:00.000Z");
    assert.equal(inicioJanelaAvisos("não é data", HOJE), "2026-09-20T12:00:00.000Z");
    assert.equal(avisoVisivelParaUsuario("data inválida", null, HOJE), false);
  });

  await caso("link do aviso: sempre dentro do portal (nunca URL externa nem caminho estranho)", () => {
    for (const ok of ["/portal/minhas-indicacoes", "/portal/solicitacoes", "/portal/candidato/abc-123", "/portal/agenda?dia=2026-10-20"]) assert.equal(linkPortalValido(ok), true, ok);
    for (const ruim of ["https://exemplo.com/portal/x", "//evil.com/portal/x", "/painel/vagas", "portal/x", "/portal", "/portal//x", "javascript:alert(1)", "/portal/x y", "/portal/<script>"]) assert.equal(linkPortalValido(ruim), false, ruim);
  });
  await caso("chave de deduplicação: mesma ocorrência = mesma chave; versão diferente = chave diferente", () => {
    assert.equal(chaveDedupAviso("indicacao_decidida_cliente", "abc", "aprovada:2026-10-20T12:00:00Z"), chaveDedupAviso("indicacao_decidida_cliente", "abc", "aprovada:2026-10-20T12:00:00Z"));
    assert.notEqual(chaveDedupAviso("indicacao_decidida_cliente", "abc", "aprovada:1"), chaveDedupAviso("indicacao_decidida_cliente", "abc", "recusada:2"));
    assert.notEqual(chaveDedupAviso("indicacao_decidida_cliente", "abc", 1), chaveDedupAviso("indicacao_decidida_cliente", "abd", 1));
  });

  await caso("texto da indicação aprovada: candidato e vaga, nada interno", () => {
    const t = textoAvisoIndicacaoDecidida({ decisao: "aprovada", candidato: "Maria Souza", vagaTitulo: "Auxiliar de Produção" });
    assert.equal(t.titulo, "Indicação aprovada");
    assert.equal(t.mensagem, "Sua indicação Maria Souza foi aprovada para a vaga Auxiliar de Produção");
  });
  await caso("texto da indicação recusada: traz o motivo_recusa (o mesmo que o cliente já vê)", () => {
    const t = textoAvisoIndicacaoDecidida({ decisao: "recusada", candidato: "João Lima", vagaTitulo: "Operador", motivo: "  Vaga já preenchida  " });
    assert.equal(t.titulo, "Indicação não aprovada");
    assert.equal(t.mensagem, "Sua indicação João Lima não foi aprovada. Motivo: Vaga já preenchida");
  });
  await caso("texto da indicação: sem vaga, sem motivo ou com nome nulo não quebra (aviso nunca derruba a rota)", () => {
    assert.equal(textoAvisoIndicacaoDecidida({ decisao: "aprovada", candidato: "Ana" }).mensagem, "Sua indicação Ana foi aprovada");
    assert.equal(textoAvisoIndicacaoDecidida({ decisao: "recusada", candidato: "Ana", motivo: null }).mensagem, "Sua indicação Ana não foi aprovada.");
    assert.equal(textoAvisoIndicacaoDecidida({ decisao: "aprovada", candidato: null, vagaTitulo: null }).mensagem, "Sua indicação candidato foi aprovada");
    assert.equal(textoAvisoIndicacaoDecidida({ decisao: "aprovada", candidato: undefined }).mensagem, "Sua indicação candidato foi aprovada");
  });
  await caso("texto do aviso: a função só recebe candidato, vaga e motivo (nada de decidido_por, notas ou responsável)", () => {
    const t = textoAvisoIndicacaoDecidida({ decisao: "recusada", candidato: "X", vagaTitulo: "Y", motivo: "Z", decidido_por: "Analista Interno" } as never);
    assert.ok(!JSON.stringify(t).includes("Analista Interno"));
  });
  await caso("texto do aviso: mensagem muito longa é cortada", () => {
    const longa = limitarMensagemAviso("a".repeat(900)); assert.equal(longa.length, 400); assert.ok(longa.endsWith("…"));
  });

  await caso("tempo relativo: agora, minutos, horas e dias", () => {
    const base = new Date("2026-10-20T12:00:00Z");
    assert.equal(haQuantoTempo("2026-10-20T11:59:30Z", base), "agora");
    assert.equal(haQuantoTempo("2026-10-20T11:55:00Z", base), "há 5 min");
    assert.equal(haQuantoTempo("2026-10-20T09:00:00Z", base), "há 3 h");
    assert.equal(haQuantoTempo("2026-10-19T09:00:00Z", base), "há 1 dia");
    assert.equal(haQuantoTempo("2026-10-17T12:00:00Z", base), "há 3 dias");
  });
  const aviso = (id: string, o: Partial<AvisoPortal> = {}): AvisoPortal => ({ id, titulo: "t", mensagem: "m", link: "/portal/x", created_at: "2026-10-20T10:00:00Z", canal_sino: true, canal_popup: true, lida: false, popup_visto: false, ...o });
  await caso("sino e popup usam a mesma lista: não lidos só do canal sino; pendentes só do canal popup ainda não vistos", () => {
    const lista = [aviso("1"), aviso("2", { lida: true }), aviso("3", { canal_sino: false }), aviso("4", { popup_visto: true }), aviso("5", { canal_popup: false })];
    assert.deepEqual(naoLidosDoSino(lista).map((a) => a.id), ["1", "4", "5"]);
    assert.deepEqual(pendentesDoPopup(lista).map((a) => a.id), ["1", "2", "3"]);
    assert.deepEqual(pendentesDoPopup([aviso("9", { popup_visto: true })]), []);
  });

  // ── Avisos ao cliente: bloco 2 (candidato enviado ao cliente) ──
  await caso("bloco 2 catálogo: evento 'Candidato enviado ao cliente' no grupo avisos_cliente, sem lista, sino/popup", () => {
    assert.equal(ROTULO_EVENTO.candidato_enviado_cliente, "Candidato enviado ao cliente");
    assert.equal(grupoDoEvento("candidato_enviado_cliente"), "avisos_cliente");
    assert.deepEqual([...canaisDoEvento("candidato_enviado_cliente")], ["sino", "popup"]);
    assert.equal(eventoSemLista("candidato_enviado_cliente"), true);
    assert.equal(descricaoPadraoDoSistema("avisos_cliente", "popup", "candidato_enviado_cliente"), FRASE_SEM_LISTA);
    assert.match(NOTA_EVENTO.candidato_enviado_cliente, /Encaminhar/); assert.match(NOTA_EVENTO.candidato_enviado_cliente, /e-mail ao contato do cliente não muda/);
  });
  await caso("bloco 2 catálogo: o evento do bloco 1 e os outros grupos não mudaram", () => {
    assert.equal(ROTULO_EVENTO.indicacao_decidida_cliente, "Indicação direta decidida pela Salmazos");
    assert.deepEqual([...canaisDoEvento("indicacao_decidida_cliente")], ["sino", "popup"]);
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 5); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
  });

  await caso("data da entrevista para o cliente: dd/mm/aaaa às hh:mm (fuso de Brasília)", () => {
    assert.equal(dataEntrevistaParaCliente("2026-10-20T17:30:00Z"), "20/10/2026 às 14:30");
    assert.equal(dataEntrevistaParaCliente("2026-10-20T03:30:00Z"), "20/10/2026 às 00:30");
  });
  await caso("data da entrevista para o cliente: horário 12:00 (convenção do Kanban) fica só com a data; sem data = null", () => {
    assert.equal(horaEntrevistaReal("2026-10-20T15:00:00Z"), null);
    assert.equal(dataEntrevistaParaCliente("2026-10-20T15:00:00Z"), "20/10/2026");
    assert.equal(dataEntrevistaParaCliente(null), null); assert.equal(dataEntrevistaParaCliente(undefined), null); assert.equal(dataEntrevistaParaCliente(""), null);
    assert.equal(dataEntrevistaParaCliente("não é data"), null);
  });

  await caso("texto do candidato enviado: com vaga e SEM data de entrevista", () => {
    const t = textoAvisoCandidatoEnviado({ candidato: "Maria Souza", vagaTitulo: "Auxiliar de Produção" });
    assert.equal(t.titulo, "Novo candidato para avaliar");
    assert.equal(t.mensagem, "Novo candidato para avaliar: Maria Souza — vaga Auxiliar de Produção");
  });
  await caso("texto do candidato enviado: COM data de entrevista (formato do portal)", () => {
    const t = textoAvisoCandidatoEnviado({ candidato: "Maria Souza", vagaTitulo: "Auxiliar de Produção", entrevista: dataEntrevistaParaCliente("2026-10-20T17:30:00Z") });
    assert.equal(t.mensagem, "Novo candidato para avaliar: Maria Souza — vaga Auxiliar de Produção — entrevista em 20/10/2026 às 14:30");
  });
  await caso("texto do candidato enviado: nome e/ou vaga nulos não quebram (texto neutro)", () => {
    assert.equal(textoAvisoCandidatoEnviado({ candidato: null, vagaTitulo: null }).mensagem, "Novo candidato para avaliar");
    assert.equal(textoAvisoCandidatoEnviado({ candidato: "  ", vagaTitulo: "Operador" }).mensagem, "Novo candidato para avaliar — vaga Operador");
    assert.equal(textoAvisoCandidatoEnviado({ candidato: "Ana" }).mensagem, "Novo candidato para avaliar: Ana");
    assert.equal(textoAvisoCandidatoEnviado({}).mensagem, "Novo candidato para avaliar");
    assert.equal(textoAvisoCandidatoEnviado({ candidato: undefined, vagaTitulo: undefined, entrevista: null }).titulo, "Novo candidato para avaliar");
  });
  await caso("texto do candidato enviado: nada interno (observações, notas, responsável, contatos, fee, status do funil)", () => {
    const entrada = { candidato: "Maria", vagaTitulo: "Operador", entrevista: "20/10/2026", observacoes: "nota interna X", responsavel: "Analista Y", telefone: "(19) 99999-0000", email: "m@x.com", fee_rs_percentual: 15, etapa: "triagem", status: "aguardando" };
    const t = textoAvisoCandidatoEnviado(entrada as never);
    const texto = JSON.stringify(t);
    for (const proibido of ["nota interna", "Analista Y", "99999", "m@x.com", "15", "triagem", "aguardando"]) assert.ok(!texto.includes(proibido), proibido);
  });
  await caso("link do candidato enviado: perfil do candidato no portal (id do encaminhamento) e válido", () => {
    const enc = "3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f";
    assert.equal(linkPortalValido(`/portal/candidato/${enc}`), true);
    assert.ok(`/portal/candidato/${enc}`.startsWith("/portal/"));
  });

  await caso("dedup do candidato enviado: primeiro envio avisa, versão 'novo'", () => {
    assert.deepEqual(decidirAvisoCandidatoEnviado(null), { avisar: true, versao: "novo" });
    assert.deepEqual(decidirAvisoCandidatoEnviado(undefined), { avisar: true, versao: "novo" });
  });
  await caso("dedup do candidato enviado: encaminhamento já aberto (nenhuma mudança) NÃO avisa de novo", () => {
    for (const status of ["aguardando", "aguardando_agendamento_cliente"]) {
      assert.equal(decidirAvisoCandidatoEnviado({ status, avaliado_em: null, updated_at: "2026-10-01T10:00:00Z" }).avisar, false, status);
    }
  });
  await caso("dedup do candidato enviado: reenvio real (anterior encerrado) avisa com versão do estado anterior", () => {
    for (const status of ["aprovado", "reprovado", "desistiu"]) {
      assert.deepEqual(decidirAvisoCandidatoEnviado({ status, avaliado_em: null, updated_at: "2026-10-01T10:00:00Z" }), { avisar: true, versao: "reenvio:2026-10-01T10:00:00Z" }, status);
    }
    assert.equal(decidirAvisoCandidatoEnviado({ status: "aguardando", avaliado_em: "2026-10-02T09:00:00Z", updated_at: "2026-10-02T09:00:00Z" }).avisar, true);
  });
  await caso("dedup do candidato enviado: MESMA requisição = mesma chave; reenvio diferente = chave diferente", () => {
    const enc = "enc-1", ev = "candidato_enviado_cliente";
    const chave = (a: Parameters<typeof decidirAvisoCandidatoEnviado>[0]) => chaveDedupAviso(ev, enc, decidirAvisoCandidatoEnviado(a).versao);
    const fechado = { status: "reprovado", avaliado_em: "2026-10-01T09:00:00Z", updated_at: "2026-10-01T09:00:00Z" };
    // duas requisições simultâneas e idênticas leem o mesmo estado anterior → mesma chave (a 2ª não duplica)
    assert.equal(chave(fechado), chave({ ...fechado }));
    assert.equal(chave(null), chave(undefined));
    // outro reenvio, depois de o ciclo seguinte também encerrar → estado anterior diferente → chave diferente
    assert.notEqual(chave(fechado), chave({ ...fechado, updated_at: "2026-10-09T09:00:00Z", avaliado_em: "2026-10-09T09:00:00Z" }));
    // primeiro envio × reenvio no mesmo encaminhamento → chaves diferentes
    assert.notEqual(chave(null), chave(fechado));
    // outro encaminhamento → outra chave
    assert.notEqual(chaveDedupAviso(ev, "enc-1", "novo"), chaveDedupAviso(ev, "enc-2", "novo"));
    assert.equal(chave(null), "candidato_enviado_cliente:enc-1:novo");
  });

  // ── Avisos ao cliente: bloco 3 (entrevista agendada e remarcada) ──
  await caso("bloco 3 catálogo: 2 eventos novos no grupo (agora 4), sem lista, sino/popup, com rótulo e nota", () => {
    assert.equal(EVENTOS_POR_GRUPO.avisos_cliente.length, 4);
    assert.equal(ROTULO_EVENTO.entrevista_agendada_cliente, "Entrevista agendada");
    assert.equal(ROTULO_EVENTO.entrevista_remarcada_cliente, "Entrevista remarcada");
    for (const ev of ["entrevista_agendada_cliente", "entrevista_remarcada_cliente"]) {
      assert.equal(grupoDoEvento(ev), "avisos_cliente", ev); assert.equal(eventoSemLista(ev), true, ev);
      assert.deepEqual([...canaisDoEvento(ev)], ["sino", "popup"], ev); assert.ok(NOTA_EVENTO[ev], ev);
      assert.equal(descricaoPadraoDoSistema("avisos_cliente", "sino", ev), FRASE_SEM_LISTA, ev);
    }
    assert.match(NOTA_EVENTO.entrevista_agendada_cliente, /Agenda do portal/); assert.match(NOTA_EVENTO.entrevista_remarcada_cliente, /apagada/);
  });
  await caso("bloco 3 catálogo: os eventos dos blocos 1 e 2 e os outros grupos não mudaram", () => {
    assert.equal(ROTULO_EVENTO.indicacao_decidida_cliente, "Indicação direta decidida pela Salmazos");
    assert.equal(ROTULO_EVENTO.candidato_enviado_cliente, "Candidato enviado ao cliente");
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 5); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
  });

  const AB = "aguardando", AG = "aguardando_agendamento_cliente";
  const D1 = "2026-10-20T17:30:00Z" /* 20/10 14:30 */, D1b = "2026-10-20T17:30:45Z", D2 = "2026-10-21T17:30:00Z", D3 = "2026-10-20T19:00:00Z" /* 20/10 16:00 */;
  const CONV = "2026-10-20T15:00:00Z" /* 20/10 12:00 = convenção, sem horário real */, CONV2 = "2026-10-20T15:00:30Z";
  const U = "2026-10-10T10:00:00Z";
  const dec = (a: [string, string | null] | null, n: [string, string | null], upd = U) =>
    decidirAvisoEntrevista(a ? { status: a[0], data_entrevista: a[1], updated_at: upd } : null, { status: n[0], data_entrevista: n[1] });

  await caso("decisão entrevista: sem data antes e com data agora = AGENDADA", () => {
    const r = dec([AG, null], [AB, D1]);
    assert.equal(r.tipo, "agendada"); assert.equal(r.antes, null); assert.equal(r.depois, "20/10/2026 às 14:30");
    assert.equal(dec([AB, null], [AB, D1]).tipo, "agendada");
  });
  await caso("decisão entrevista: com data antes e data/horário diferente agora = REMARCADA", () => {
    const r = dec([AB, D1], [AB, D2]); assert.equal(r.tipo, "remarcada"); assert.equal(r.antes, "20/10/2026 às 14:30"); assert.equal(r.depois, "21/10/2026 às 14:30");
    assert.equal(dec([AB, D1], [AB, D3]).tipo, "remarcada", "mesmo dia, outro horário");
  });
  await caso("decisão entrevista: nenhuma mudança NÃO avisa (inclui diferença de segundos)", () => {
    assert.equal(dec([AB, D1], [AB, D1]).tipo, null); assert.equal(dec([AB, D1], [AB, D1b]).tipo, null);
  });
  await caso("decisão entrevista: só limpou a data (ou nova data vazia/inválida) NÃO avisa", () => {
    assert.equal(dec([AB, D1], [AG, null]).tipo, null); assert.equal(dec([AB, D1], [AB, ""]).tipo, null); assert.equal(dec([AB, D1], [AB, "não é data"]).tipo, null);
    assert.equal(dec([AG, null], [AG, null]).tipo, null);
  });
  await caso("decisão entrevista: convenção 12:00 não é mudança de horário", () => {
    assert.equal(dec([AB, CONV], [AB, CONV2]).tipo, null, "12:00 e 12:00:30 aparecem iguais ao cliente");
    assert.equal(dec([AB, CONV], [AB, "2026-10-21T15:00:00Z"]).tipo, "remarcada", "outro dia continua sendo remarcação");
    const r = dec([AB, CONV], [AB, "2026-10-21T15:00:00Z"]); assert.equal(r.antes, "20/10/2026"); assert.equal(r.depois, "21/10/2026");
    assert.equal(dec([AB, CONV], [AB, D1]).tipo, "remarcada", "passou a ter horário real no mesmo dia");
    assert.equal(dec([AG, null], [AB, CONV]).depois, "20/10/2026", "agendada só com a data");
  });
  await caso("decisão entrevista: encaminhamento encerrado (antes OU depois) ou sem estado anterior NÃO avisa", () => {
    for (const st of ["aprovado", "reprovado", "desistiu"]) {
      assert.equal(dec([st, null], [AB, D1]).tipo, null, `antes ${st}`); assert.equal(dec([AB, D1], [st, D2]).tipo, null, `depois ${st}`);
    }
    assert.equal(dec(null, [AB, D1]).tipo, null); assert.equal(decidirAvisoEntrevista(undefined, { status: AB, data_entrevista: D1 }).tipo, null);
    assert.equal(decidirAvisoEntrevista({ status: AB, data_entrevista: D1 }, null).tipo, null);
  });
  await caso("decisão entrevista: o primeiro envio e o reenvio de encerrado são do bloco 2 (nunca os dois avisos)", () => {
    for (const anterior of [null, { status: "reprovado", avaliado_em: "2026-10-01T10:00:00Z", updated_at: U, data_entrevista: D1 }]) {
      const bloco2 = decidirAvisoCandidatoEnviado(anterior).avisar;
      const bloco3 = decidirAvisoEntrevista(anterior, { status: AB, data_entrevista: D2 }).tipo !== null;
      assert.equal(bloco2, true); assert.equal(bloco3, false);
    }
    const aberto = { status: AB, avaliado_em: null, updated_at: U, data_entrevista: D1 };
    assert.equal(decidirAvisoCandidatoEnviado(aberto).avisar, false);
    assert.equal(decidirAvisoEntrevista(aberto, { status: AB, data_entrevista: D2 }).tipo, "remarcada");
  });

  await caso("texto da entrevista agendada: nome, vaga e data/hora; com e sem horário real", () => {
    const comHora = textoAvisoEntrevista({ tipo: "agendada", candidato: "Maria Souza", vagaTitulo: "Auxiliar", depois: dataEntrevistaParaCliente(D1) });
    assert.equal(comHora.titulo, "Entrevista agendada");
    assert.equal(comHora.mensagem, "Entrevista agendada: Maria Souza — vaga Auxiliar — 20/10/2026 às 14:30");
    assert.equal(textoAvisoEntrevista({ tipo: "agendada", candidato: "Maria", vagaTitulo: "Auxiliar", depois: dataEntrevistaParaCliente(CONV) }).mensagem, "Entrevista agendada: Maria — vaga Auxiliar — 20/10/2026");
  });
  await caso("texto da entrevista remarcada: de ... para ... (hora omitida quando é a convenção 12:00)", () => {
    const t = textoAvisoEntrevista({ tipo: "remarcada", candidato: "João Lima", vagaTitulo: "Operador", antes: dataEntrevistaParaCliente(D1), depois: dataEntrevistaParaCliente(D2) });
    assert.equal(t.titulo, "Entrevista remarcada");
    assert.equal(t.mensagem, "Entrevista remarcada: João Lima — vaga Operador — de 20/10/2026 às 14:30 para 21/10/2026 às 14:30");
    assert.equal(textoAvisoEntrevista({ tipo: "remarcada", candidato: "J", vagaTitulo: "O", antes: dataEntrevistaParaCliente(CONV), depois: dataEntrevistaParaCliente("2026-10-21T15:00:00Z") }).mensagem, "Entrevista remarcada: J — vaga O — de 20/10/2026 para 21/10/2026");
    assert.equal(textoAvisoEntrevista({ tipo: "remarcada", candidato: "J", antes: "20/10/2026", depois: "22/10/2026 às 09:00" }).mensagem, "Entrevista remarcada: J — de 20/10/2026 para 22/10/2026 às 09:00");
  });
  await caso("texto da entrevista: nome/vaga nulos só encurtam a frase e nada interno aparece", () => {
    assert.equal(textoAvisoEntrevista({ tipo: "agendada", candidato: null, vagaTitulo: null, depois: "20/10/2026" }).mensagem, "Entrevista agendada — 20/10/2026");
    assert.equal(textoAvisoEntrevista({ tipo: "remarcada", candidato: "  ", vagaTitulo: undefined, antes: null, depois: "20/10/2026" }).mensagem, "Entrevista remarcada — para 20/10/2026");
    assert.equal(textoAvisoEntrevista({ tipo: "remarcada" }).mensagem, "Entrevista remarcada");
    const t = textoAvisoEntrevista({ tipo: "agendada", candidato: "Maria", vagaTitulo: "Operador", depois: "20/10/2026", observacoes: "nota interna", responsavel: "Analista Y", telefone: "(19) 99999-0000", fee: 15, etapa: "triagem", motivo: "motivo interno" } as never);
    const texto = JSON.stringify(t);
    for (const proibido of ["nota interna", "Analista Y", "99999", "motivo interno", "triagem", "15"]) assert.ok(!texto.includes(proibido), proibido);
  });
  await caso("link da entrevista: dentro do portal (agenda ou perfil do encaminhamento)", () => {
    for (const l of ["/portal/agenda", "/portal/candidato/3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f"]) assert.equal(linkPortalValido(l), true, l);
  });

  await caso("dedup da entrevista: mesma requisição = mesma chave (agendada e remarcada)", () => {
    const k = (a: [string, string | null] | null, n: [string, string | null]) => chaveDedupAviso("entrevista_x", "enc-1", dec(a, n).versao);
    assert.equal(k([AG, null], [AB, D1]), k([AG, null], [AB, D1]), "agendada: mesma data nova, mesmo estado anterior");
    assert.notEqual(k([AG, null], [AB, D1]), k([AG, null], [AB, D2]), "agendada para outra data = outra chave");
    assert.equal(k([AB, D1], [AB, D2]), k([AB, D1], [AB, D2]));
    assert.equal(dec([AB, D1], [AB, D2]).versao, `${new Date(D1).toISOString()}>${new Date(D2).toISOString()}@${U}`);
    assert.equal(dec([AG, null], [AB, D1]).versao, `${new Date(D1).toISOString()}@${U}`);
  });
  await caso("dedup da entrevista: remarcações sucessivas para datas diferentes = chaves diferentes", () => {
    const k = (a: string, n: string, upd = U) => chaveDedupAviso("entrevista_remarcada_cliente", "enc-1", dec([AB, a], [AB, n], upd).versao);
    const chaves = new Set([k(D1, D2), k(D2, D3, "2026-10-11T10:00:00Z"), k(D3, D1, "2026-10-12T10:00:00Z")]);
    assert.equal(chaves.size, 3);
  });
  await caso("dedup da entrevista: voltar a uma data já usada (A>B, B>A, A>B) NÃO é engolido: updated_at anterior muda", () => {
    const k = (a: string, n: string, upd: string) => chaveDedupAviso("entrevista_remarcada_cliente", "enc-1", dec([AB, a], [AB, n], upd).versao);
    const primeira = k(D1, D2, "2026-10-10T10:00:00Z"), terceira = k(D1, D2, "2026-10-12T10:00:00Z");
    assert.notEqual(primeira, terceira);
    assert.notEqual(chaveDedupAviso("entrevista_agendada_cliente", "enc-1", dec([AG, null], [AB, D1], "2026-10-10T10:00:00Z").versao), chaveDedupAviso("entrevista_agendada_cliente", "enc-1", dec([AG, null], [AB, D1], "2026-10-12T10:00:00Z").versao));
  });
  await caso("dedup da entrevista: encaminhamentos diferentes = chaves diferentes", () => {
    const v = dec([AB, D1], [AB, D2]).versao;
    assert.notEqual(chaveDedupAviso("entrevista_remarcada_cliente", "enc-1", v), chaveDedupAviso("entrevista_remarcada_cliente", "enc-2", v));
    assert.ok(chaveDedupAviso("entrevista_remarcada_cliente", "enc-1", v).startsWith("entrevista_remarcada_cliente:enc-1:"));
  });

  console.log(`\n${total} casos OK${process.exitCode ? " (com falhas acima)" : ""}`);
})();
