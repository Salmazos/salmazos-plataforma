// Verificação do resolvedor de destinatários de avisos (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-avisos-resolvedor.mts
import assert from "node:assert/strict";
import {
  resolverComFonte, analistaAtendeUnidade, emailsOuPadrao, emailsSomenteConfigurado, executarCanaisIndependentes,
  type DadosAviso, type FonteAvisos, type LinhaDestinatario, type PerfilAnalista,
} from "../src/lib/avisosResolucao.ts";
import { PADRAO_AVISOS, grupoTemPadrao, montarPayloadRestauracao } from "../src/lib/avisosPadrao.ts";
import { EVENTOS_POR_GRUPO, EVENTOS_PEDIDO_CLIENTE, canaisDoEvento, descricaoPadraoDoSistema, NOTA_EVENTO, ROTULO_EVENTO } from "../src/lib/avisosCatalogo.ts";
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

  console.log(`\n${total} casos OK${process.exitCode ? " (com falhas acima)" : ""}`);
})();
