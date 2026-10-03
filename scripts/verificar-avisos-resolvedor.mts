// Verificação do resolvedor de destinatários de avisos (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-avisos-resolvedor.mts
import assert from "node:assert/strict";
import {
  resolverComFonte, analistaAtendeUnidade, emailsOuPadrao, emailsSomenteConfigurado,
  type DadosAviso, type FonteAvisos, type LinhaDestinatario, type PerfilAnalista,
} from "../src/lib/avisosResolucao.ts";
import { PADRAO_AVISOS, grupoTemPadrao, montarPayloadRestauracao } from "../src/lib/avisosPadrao.ts";

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

  await caso("padrão: só vagas tem padrão", () => { assert.equal(grupoTemPadrao("vagas"), true); assert.equal(grupoTemPadrao("rescisao"), false); });
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
    assert.equal(r.payload.eventos.flatMap((e) => e.canais).length, 10);
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

  console.log(`\n${total} casos OK${process.exitCode ? " (com falhas acima)" : ""}`);
})();
