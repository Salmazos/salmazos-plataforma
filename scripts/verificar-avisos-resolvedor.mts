// Verificação do resolvedor de destinatários de avisos (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-avisos-resolvedor.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolverComFonte, analistaAtendeUnidade, emailsOuPadrao, emailsSomenteConfigurado, executarCanaisIndependentes,
  type DadosAviso, type FonteAvisos, type LinhaDestinatario, type PerfilAnalista,
} from "../src/lib/avisosResolucao.ts";
import { PADRAO_AVISOS, PADRAO_EMAIL_CLIENTE, grupoTemPadrao, montarPayloadRestauracao } from "../src/lib/avisosPadrao.ts";
import { AVISOS_RESTANTES, EVENTOS_AVISOS_RESTANTES, eventoAvisoRestante, EVENTO_POS_VENDA_RS as EVENTO_POS_VENDA_RS_CATALOGO, eventoPosVendaRS, EVENTOS_GARANTIA_RS, eventoGarantiaRS, eventoComResponsavelNoSino, EVENTOS_DECISAO_CLIENTE, eventoDecisaoCliente, canalSemListaPermitido, canalSoInterruptor, ligadoSemLinha, EVENTOS_EMAIL_CLIENTE, eventoEmailCliente, FRASE_EMAIL_CLIENTE, APOIO_EMAILS_CLIENTE, EVENTOS_POR_GRUPO, EVENTOS_SEM_LISTA, eventoSemLista, FRASE_SEM_LISTA, ROTULO_GRUPO, grupoDoEvento, EVENTOS_PEDIDO_CLIENTE, canaisDoEvento, descricaoPadraoDoSistema, NOTA_EVENTO, ROTULO_EVENTO } from "../src/lib/avisosCatalogo.ts";
import {
  canalClienteLigado, emailClienteLigadoRegra, montarDestinatariosEmailCliente, inicioJanelaAvisos, avisoVisivelParaUsuario, linkPortalValido, chaveDedupAviso, textoAvisoIndicacaoDecidida,
  haQuantoTempo, textoAvisoSolicitacaoDecidida, textoAvisoPedidoDecidido, tipoPedidoDaAcao, chaveDedupSolicitacaoDecidida, chaveDedupPedidoDecidido, textoAvisoCandidatoEnviado, textoAvisoEntrevista, decidirAvisoCandidatoEnviado, naoLidosDoSino, pendentesDoPopup, limitarMensagemAviso, DIAS_VISIVEL_AVISO_CLIENTE, type AvisoPortal,
} from "../src/lib/avisoClienteRegras.ts";
import {
  EVENTO_POR_DECISAO, TIPO_NOTIFICACAO_POR_DECISAO, TIPOS_NOTIFICACAO_DECISAO, EVENTO_POR_TIPO_NOTIFICACAO, sinoDecisaoLigado, popupDecisaoLigado, textoAvisoDecisaoCliente,
  userIdsDestinoDecisao, TIPOS_NOTIFICACAO_POPUP, inicioJanelaPopupDecisao, tiposComPopupLigado, DIAS_JANELA_POPUP_DECISAO,
} from "../src/lib/decisaoClienteCandidato.ts";
import {
  EVENTO_POR_GARANTIA, TIPO_NOTIFICACAO_POR_GARANTIA, DIAS_RECUPERACAO_GARANTIA, dataBrasilia, somarDiasISO, janelaAlertaGarantia, garantiaExpirada,
  formatarDataBR, textoAvisoGarantiaVencendo, textoAvisoGarantiaAcionada, textosEmailGarantiaVencendo, deveCarimbarGarantia, erroColunaCarimboInexistente,
} from "../src/lib/garantiaRS.ts";
import {
  EVENTO_CANDIDATO_TRANSFERIDO, EVENTO_CURRICULO_ATUALIZADO, EVENTO_FUNCIONARIO_NAO_CRIADO, TIPO_TRANSFERENCIA_RESPONSAVEL, TIPO_ATUALIZACAO_CURRICULO, TIPO_FUNCIONARIO_NAO_CRIADO,
  EVENTO_LEMBRETE_COMERCIAL, EVENTO_SUPERVISAO_ATRASADA, EVENTO_CONTA_HORTOLANDIA_ATRASADA, TIPO_LEMBRETE_COMERCIAL, TIPO_SUPERVISAO_ATRASADA, TIPO_CONTA_HORTOLANDIA_ATRASADA, PREFIXO_MENSAGEM_VENDEDOR,
  textoLembreteComercial, textoLembreteComercialGestao, textoSupervisaoAtrasada, textoContaReceberAtrasada,
  EVENTO_FEE_RS_NAO_CONFIGURADO, TIPO_FEE_RS_NAO_CONFIGURADO,
  EVENTO_ANIVERSARIO_MES_SEGUINTE, EVENTO_ANIVERSARIO_TRES_DIAS, EVENTO_ANIVERSARIO_NO_DIA, TIPO_ANIVERSARIO_MES_SEGUINTE, TIPO_ANIVERSARIO_TRES_DIAS, TIPO_ANIVERSARIO_NO_DIA,
  situacaoAniversario, textoAniversarioTresDias, textoAniversarioNoDia, DIAS_ANTECEDENCIA_ANIVERSARIO, DIAS_RECUPERACAO_ANIVERSARIO,
  unirUserIds, deveCarimbarAviso, textoTransferenciaResponsavel, textoCurriculoAtualizado, textoFuncionarioNaoCriado, inicioJanelaSemRepetir, HORAS_SEM_REPETIR_AVISO,
} from "../src/lib/avisosRestantesRegras.ts";
import {
  EVENTO_POS_VENDA_RS, TIPO_NOTIFICACAO_POS_VENDA_RS, EVENTO_POR_TIPO_POS_VENDA, DIAS_POS_VENDA_RS, DIAS_RECUPERACAO_POS_VENDA_RS, janelaInicioPosVenda, posVendaNaJanela,
  textoAvisoPosVendaRS, userIdsSinoPosVenda, deveCarimbarPosVenda, dataBrasilia as dataBrasiliaPV, somarDiasISO as somarDiasISOPV,
} from "../src/lib/posVendaRSRegras.ts";
import {
  EVENTO_COBRANCA_RS_GERADA, EVENTO_COBRANCA_RS_VALIDADA, EVENTO_COBRANCA_RS_PAGA, EVENTO_COBRANCA_RS_CANCELADA, EVENTO_COBRANCA_RS_ATRASADA, EVENTOS_COBRANCA_RS,
  TIPO_EMAIL_COBRANCA_GERADA, TIPO_EMAIL_COBRANCA_VALIDADA, TIPO_EMAIL_COBRANCA_PAGA, TIPO_EMAIL_COBRANCA_CANCELADA, TIPO_COBRANCA_ATRASADA, DIAS_COOLDOWN_ATRASO_COBRANCA,
  dataBrasilia as dataBrasiliaCobranca, inicioDiaBrasilia, corteLembreteAtraso, diasDeAtraso, textoSinoAtrasoCobranca, destinatariosPagaLegado, type PerfilAnalistaCobranca,
  EVENTO_COBRANCA_RS_PENDENTE_REVISAO, EVENTO_COBRANCA_RS_AGUARDANDO_VALIDACAO, TIPO_COBRANCA_PENDENTE_REVISAO, TIPO_COBRANCA_AGUARDANDO_VALIDACAO, DIAS_ESPERA_VALIDACAO, DIAS_COOLDOWN_VALIDACAO,
  somarDiasISO as somarDiasISOCobranca, limiteDiasBrasilia, limiteEnvioValidacao, limiteCooldownValidacao, diasParadoDesde, ehErroColunaLembreteValidacao,
  textoSinoPendenteRevisao, textoSinoAguardandoValidacao, destinatariosComAcessoCobranca, type PerfilComAcessoCobranca,
} from "../src/lib/cobrancaRSRegras.ts";
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
  await caso("padrão vagas: 26 eventos (5 da carga inicial: e-mail 2/3/3/0/3, sino 7/7/7/7/3; mais os 2 da garantia R&S, o pós-venda R&S os 3 avisos restantes do bloco B o lembrete de agendamento do bloco C os 3 crons de lembrete do bloco D a taxa de R&S não configurada do bloco E e os 3 aniversários do bloco F os 5 avisos da cobrança R&S e os 2 das pendências da cobrança)", () => {
    const p = PADRAO_AVISOS.vagas;
    assert.deepEqual(Object.keys(p).sort(), ["candidato_curriculo_atualizado", "candidato_transferido", "funcionario_nao_criado", "garantia_rs_acionada", "garantia_rs_vencendo", "conta_receber_hortolandia_atrasada", "lembrete_agendamento_pendente_analista", "lembrete_comercial", "pos_venda_rs_7dias", "solicitacao_vaga", "supervisao_cliente_atrasada", "vaga_cancelada", "vaga_criada", "vaga_fechada", "vaga_reativada", "fee_rs_nao_configurado", "aniversario_mes_seguinte", "aniversario_tres_dias", "aniversario_no_dia", "cobranca_rs_gerada", "cobranca_rs_validada", "cobranca_rs_paga", "cobranca_rs_cancelada", "cobranca_rs_atrasada", "cobranca_rs_pendente_revisao", "cobranca_rs_aguardando_validacao"].sort());
    const n = (ev: string, c: "email" | "sino") => p[ev][c]!.destinatarios.length;
    assert.deepEqual(["vaga_criada", "solicitacao_vaga", "vaga_cancelada", "vaga_fechada", "vaga_reativada"].map((ev) => n(ev, "email")), [2, 3, 3, 0, 3]);
    assert.deepEqual(["vaga_criada", "solicitacao_vaga", "vaga_cancelada", "vaga_fechada", "vaga_reativada"].map((ev) => n(ev, "sino")), [7, 7, 7, 7, 3]);
    assert.equal(p.vaga_fechada.email!.ativo, false);
    for (const ev of ["candidato_transferido", "candidato_curriculo_atualizado", "funcionario_nao_criado"]) assert.deepEqual(p[ev], { sino: { ativo: true, destinatarios: [] } }, ev);
    assert.deepEqual(p.lembrete_agendamento_pendente_analista.sino, { ativo: true, destinatarios: [] }); assert.equal(p.lembrete_agendamento_pendente_analista.email!.ativo, true);
    assert.deepEqual(p.lembrete_agendamento_pendente_analista.email!.destinatarios, p.vaga_cancelada.email!.destinatarios, "mesma lista de e-mail de vaga_cancelada"); assert.equal(p.lembrete_agendamento_pendente_analista.popup, undefined);
    for (const ev of ["lembrete_comercial", "conta_receber_hortolandia_atrasada"]) assert.deepEqual(p[ev], { sino: { ativo: true, destinatarios: [] }, popup: { ativo: true, destinatarios: [] } }, ev);
    assert.deepEqual(Object.keys(p.aniversario_mes_seguinte), ["email"]); assert.deepEqual(Object.keys(p.aniversario_tres_dias).sort(), ["email", "sino"]); assert.deepEqual(Object.keys(p.aniversario_no_dia).sort(), ["email", "popup", "sino"]);
    for (const ev of ["aniversario_mes_seguinte", "aniversario_tres_dias", "aniversario_no_dia"]) assert.deepEqual(p[ev].email!.destinatarios, p.vaga_cancelada.email!.destinatarios, `${ev}: mesma lista de e-mail de vaga_cancelada`);
    assert.deepEqual(p.fee_rs_nao_configurado, { sino: { ativo: true, destinatarios: [] } });
    assert.deepEqual(p.supervisao_cliente_atrasada.sino, { ativo: true, destinatarios: [] }); assert.deepEqual(p.supervisao_cliente_atrasada.popup, { ativo: true, destinatarios: [] });
    assert.deepEqual(p.supervisao_cliente_atrasada.email!.destinatarios, p.vaga_cancelada.email!.destinatarios, "mesma lista de e-mail de vaga_cancelada");
    for (const ev of ["garantia_rs_vencendo", "garantia_rs_acionada", "pos_venda_rs_7dias"]) {
      assert.equal(n(ev, "email"), 3); assert.equal(p[ev].email!.ativo, true);
      assert.deepEqual(p[ev].sino, { ativo: true, destinatarios: [] }); assert.deepEqual(p[ev].popup, { ativo: true, destinatarios: [] });
      assert.deepEqual(p[ev].email!.destinatarios, p.vaga_cancelada.email!.destinatarios, "mesma lista de e-mail de vaga_cancelada");
    }
  });
  await caso("padrão vagas: sem duplicados por evento/canal e todo canal ligado tem destinatário", () => {
    for (const [ev, canais] of Object.entries(PADRAO_AVISOS.vagas)) for (const [canal, c] of Object.entries(canais)) {
      const chaves = c.destinatarios.map((d) => (d.tipo_destinatario === "usuario" ? d.usuario_id : d.email.toLowerCase()));
      assert.equal(new Set(chaves).size, chaves.length, `${ev}/${canal} duplicado`);
      // Exceção deliberada: sino e popup da garantia R&S podem ficar ligados com a lista vazia.
      if (c.ativo && !canalSemListaPermitido(ev, canal)) assert.ok(c.destinatarios.length > 0, `${ev}/${canal} ligado sem destinatário`);
    }
  });
  await caso("restauração: todos ativos = payload completo, nada ignorado", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    assert.deepEqual(r.ignorados, []); assert.deepEqual(r.semDestinatario, []);
    assert.equal(r.payload.eventos.length, 26);
    // 10 canais de e-mail/sino + o popup de solicitacao_vaga (Fase 3, bloco 1) + e-mail, sino e popup dos 2 da garantia R&S e do pós-venda R&S + o sino dos 3 avisos restantes do bloco B + sino e e-mail do lembrete de agendamento (bloco C) + sino/popup do comercial, sino/e-mail/popup da supervisão e sino/popup do faturamento (bloco D) + sino da taxa não configurada (bloco E) + e-mail, sino e popup dos 3 aniversários (bloco F)
    assert.equal(r.payload.eventos.flatMap((e) => e.canais).length, 48);
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
    assert.match(NOTA_EVENTO.agendamento_cliente, /responsável/); assert.match(NOTA_EVENTO.agendamento_cliente, /filtro de unidade desta lista é fixo/); assert.match(NOTA_EVENTO.agendamento_cliente, /SEMPRE/);
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
      // Exceção deliberada: sino e popup dos avisos de decisão do cliente podem ficar ligados com a lista vazia.
      if (c.ativo && !canalSemListaPermitido(ev, canal)) assert.ok(c.destinatarios.length > 0, `${ev}/${canal} ligado sem destinatário`);
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
  await caso("avisos ao cliente: grupo novo, com os eventos dos 4 blocos, rótulo e canais sino/popup", () => {
    assert.deepEqual(EVENTOS_POR_GRUPO.avisos_cliente, ["indicacao_decidida_cliente", "candidato_enviado_cliente", "entrevista_agendada_cliente", "entrevista_remarcada_cliente", "solicitacao_vaga_decidida_cliente", "pedido_vaga_decidido_cliente"]);
    assert.equal(ROTULO_GRUPO.avisos_cliente, "Avisos ao cliente");
    assert.equal(ROTULO_EVENTO.indicacao_decidida_cliente, "Indicação direta decidida pela Salmazos");
    assert.deepEqual([...canaisDoEvento("indicacao_decidida_cliente")], ["sino", "popup"]);
    assert.equal(grupoDoEvento("indicacao_decidida_cliente"), "avisos_cliente");
    assert.ok(NOTA_EVENTO.indicacao_decidida_cliente.includes("Minhas Indicações"));
  });
  await caso("avisos ao cliente: evento SEM lista (só liga/desliga), sem Restaurar padrão e com a frase combinada", () => {
    assert.deepEqual([...EVENTOS_SEM_LISTA].slice(0, 6), ["indicacao_decidida_cliente", "candidato_enviado_cliente", "entrevista_agendada_cliente", "entrevista_remarcada_cliente", "solicitacao_vaga_decidida_cliente", "pedido_vaga_decidido_cliente"]);
    assert.equal(eventoSemLista("indicacao_decidida_cliente"), true);
    assert.equal(eventoSemLista("candidato_enviado_cliente"), true);
    for (const ev of ["solicitacao_vaga", "vaga_pausa_pedida", "portal_candidato_aprovado", "rescisao_paga", ""]) assert.equal(eventoSemLista(ev), false, ev);
    assert.equal(grupoTemPadrao("avisos_cliente"), false);
    assert.equal(FRASE_SEM_LISTA, "Ligado: todos os usuários do portal do cliente recebem. Desligado: ninguém.");
    for (const canal of ["sino", "popup"]) assert.equal(descricaoPadraoDoSistema("avisos_cliente", canal, "indicacao_decidida_cliente"), FRASE_SEM_LISTA);
  });
  await caso("avisos ao cliente: os eventos e a lista dos outros grupos não mudaram", () => {
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 26); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
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
    assert.match(NOTA_EVENTO.candidato_enviado_cliente, /Encaminhar/); assert.ok(NOTA_EVENTO.candidato_enviado_cliente.includes('O sino e o popup são independentes dos e-mails: os e-mails ao cliente são configurados na seção "E-mails ao cliente" desta aba e vão para o login de cada usuário do portal.')); assert.ok(!NOTA_EVENTO.candidato_enviado_cliente.includes("contato do cliente não muda"));
  });
  await caso("bloco 2 catálogo: o evento do bloco 1 e os outros grupos não mudaram", () => {
    assert.equal(ROTULO_EVENTO.indicacao_decidida_cliente, "Indicação direta decidida pela Salmazos");
    assert.deepEqual([...canaisDoEvento("indicacao_decidida_cliente")], ["sino", "popup"]);
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 26); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
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
  await caso("bloco 3 catálogo: 2 eventos novos no grupo (os 4 primeiros), sem lista, sino/popup, com rótulo e nota", () => {
    assert.deepEqual(EVENTOS_POR_GRUPO.avisos_cliente.slice(0, 4), ["indicacao_decidida_cliente", "candidato_enviado_cliente", "entrevista_agendada_cliente", "entrevista_remarcada_cliente"]);
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
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 26); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
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

  // ── Avisos ao cliente: bloco 4 (solicitação de vaga decidida e pedido decidido) ──
  await caso("bloco 4 catálogo: 2 eventos novos, grupo avisos_cliente passa a ter 6, sem lista, só sino e popup", () => {
    assert.equal(EVENTOS_POR_GRUPO.avisos_cliente.length, 6);
    assert.equal(ROTULO_EVENTO.solicitacao_vaga_decidida_cliente, "Solicitação de vaga decidida");
    assert.equal(ROTULO_EVENTO.pedido_vaga_decidido_cliente, "Pedido do cliente decidido");
    for (const ev of ["solicitacao_vaga_decidida_cliente", "pedido_vaga_decidido_cliente"]) {
      assert.equal(grupoDoEvento(ev), "avisos_cliente", ev); assert.equal(eventoSemLista(ev), true, ev); assert.ok(EVENTOS_SEM_LISTA.includes(ev), ev);
      assert.deepEqual([...canaisDoEvento(ev)], ["sino", "popup"], ev); assert.ok(NOTA_EVENTO[ev], ev);
      assert.equal(descricaoPadraoDoSistema("avisos_cliente", "popup", ev), FRASE_SEM_LISTA, ev);
    }
    assert.match(NOTA_EVENTO.pedido_vaga_decidido_cliente, /sempre \"encerramento\"/); assert.match(NOTA_EVENTO.solicitacao_vaga_decidida_cliente, /Minhas Solicitações/);
  });
  await caso("bloco 4 catálogo: os 4 eventos antigos e os outros grupos não mudaram", () => {
    assert.equal(ROTULO_EVENTO.indicacao_decidida_cliente, "Indicação direta decidida pela Salmazos");
    assert.equal(ROTULO_EVENTO.entrevista_remarcada_cliente, "Entrevista remarcada");
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 26); assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8);
    assert.equal(grupoTemPadrao("avisos_cliente"), false, "avisos_cliente continua sem Restaurar padrão");
  });
  await caso("texto da solicitação aprovada: cargo e 'já está no ar'; cargo nulo só encurta", () => {
    const t = textoAvisoSolicitacaoDecidida({ decisao: "aprovada", cargo: "Auxiliar de Produção" });
    assert.equal(t.titulo, "Solicitação aprovada"); assert.equal(t.mensagem, "Sua solicitação de vaga Auxiliar de Produção foi aprovada e já está no ar");
    assert.equal(textoAvisoSolicitacaoDecidida({ decisao: "aprovada", cargo: null }).mensagem, "Sua solicitação de vaga foi aprovada e já está no ar");
    assert.equal(textoAvisoSolicitacaoDecidida({ decisao: "aprovada", cargo: "  " }).mensagem, "Sua solicitação de vaga foi aprovada e já está no ar");
  });
  await caso("texto da solicitação recusada: com motivo, sem motivo (vazio/nulo) e cargo nulo", () => {
    const t = textoAvisoSolicitacaoDecidida({ decisao: "recusada", cargo: "Operador", motivo: "  Fora do escopo  " });
    assert.equal(t.titulo, "Solicitação não aprovada"); assert.equal(t.mensagem, "Sua solicitação Operador não foi aprovada. Motivo: Fora do escopo");
    assert.equal(textoAvisoSolicitacaoDecidida({ decisao: "recusada", cargo: "Operador", motivo: "" }).mensagem, "Sua solicitação Operador não foi aprovada.");
    assert.equal(textoAvisoSolicitacaoDecidida({ decisao: "recusada", cargo: "Operador", motivo: null }).mensagem, "Sua solicitação Operador não foi aprovada.");
    assert.equal(textoAvisoSolicitacaoDecidida({ decisao: "recusada", cargo: null, motivo: "X" }).mensagem, "Sua solicitação não foi aprovada. Motivo: X");
    assert.equal(textoAvisoSolicitacaoDecidida({ decisao: "recusada" }).mensagem, "Sua solicitação não foi aprovada.");
  });
  await caso("texto do pedido decidido: alteração, encerramento e reativação, aprovado e recusado (com e sem motivo)", () => {
    assert.deepEqual(textoAvisoPedidoDecidido({ tipo: "alteracao", decisao: "aprovado", cargo: "Operador" }), { titulo: "Pedido aprovado", mensagem: "Seu pedido de alteração para Operador foi aprovado" });
    assert.deepEqual(textoAvisoPedidoDecidido({ tipo: "encerramento", decisao: "aprovado", cargo: "Operador" }), { titulo: "Pedido aprovado", mensagem: "Seu pedido de encerramento para Operador foi aprovado" });
    assert.equal(textoAvisoPedidoDecidido({ tipo: "reativacao", decisao: "aprovado", cargo: "Operador" }).mensagem, "Seu pedido de reativação para Operador foi aprovado");
    assert.deepEqual(textoAvisoPedidoDecidido({ tipo: "alteracao", decisao: "recusado", cargo: "Operador", motivo: " Salário fora da faixa " }), { titulo: "Pedido não aprovado", mensagem: "Seu pedido de alteração para Operador não foi aprovado. Motivo: Salário fora da faixa" });
    assert.equal(textoAvisoPedidoDecidido({ tipo: "encerramento", decisao: "recusado", cargo: "Operador", motivo: "" }).mensagem, "Seu pedido de encerramento para Operador não foi aprovado.");
    assert.equal(textoAvisoPedidoDecidido({ tipo: "reativacao", decisao: "recusado", cargo: "Operador", motivo: null }).mensagem, "Seu pedido de reativação para Operador não foi aprovado.");
  });
  await caso("texto do pedido decidido: cargo nulo só encurta; motivo nunca aparece na aprovação", () => {
    assert.equal(textoAvisoPedidoDecidido({ tipo: "encerramento", decisao: "aprovado", cargo: null }).mensagem, "Seu pedido de encerramento foi aprovado");
    assert.equal(textoAvisoPedidoDecidido({ tipo: "alteracao", decisao: "recusado" }).mensagem, "Seu pedido de alteração não foi aprovado.");
    assert.ok(!textoAvisoPedidoDecidido({ tipo: "alteracao", decisao: "aprovado", cargo: "X", motivo: "motivo antigo" }).mensagem.includes("motivo antigo"));
  });
  await caso("para o cliente a palavra é SEMPRE 'encerramento' (nunca pausa/pausar); acao -> tipo", () => {
    assert.equal(tipoPedidoDaAcao("pausar"), "encerramento"); assert.equal(tipoPedidoDaAcao("reabrir"), "reativacao");
    assert.equal(tipoPedidoDaAcao("outra"), null); assert.equal(tipoPedidoDaAcao(null), null); assert.equal(tipoPedidoDaAcao(undefined), null);
    for (const tipo of ["alteracao", "encerramento", "reativacao"] as const) for (const decisao of ["aprovado", "recusado"] as const) {
      const t = JSON.stringify(textoAvisoPedidoDecidido({ tipo, decisao, cargo: "Operador", motivo: "m" }));
      assert.ok(!/paus/i.test(t), `${tipo}/${decisao}`);
    }
    assert.ok(!/paus/i.test(NOTA_EVENTO.pedido_vaga_decidido_cliente.replace(/\(para o cliente é sempre "encerramento"\)/, "")));
  });
  await caso("textos do bloco 4: nada interno (decisor, notas, observações, responsável, fee, motivo_texto)", () => {
    const interno = { decidido_por: "Analista Interno", observacoes: "nota interna X", responsavel: "Analista Y", fee_rs_percentual: 15, motivo_texto: "texto interno" };
    const textos = [
      textoAvisoSolicitacaoDecidida({ decisao: "aprovada", cargo: "Operador", ...interno } as never),
      textoAvisoSolicitacaoDecidida({ decisao: "recusada", cargo: "Operador", motivo: "ok", ...interno } as never),
      textoAvisoPedidoDecidido({ tipo: "alteracao", decisao: "aprovado", cargo: "Operador", ...interno } as never),
      textoAvisoPedidoDecidido({ tipo: "encerramento", decisao: "recusado", cargo: "Operador", motivo: "ok", ...interno } as never),
    ];
    for (const t of textos) for (const proibido of ["Analista Interno", "nota interna", "Analista Y", "15", "texto interno"]) assert.ok(!JSON.stringify(t).includes(proibido), proibido);
  });
  await caso("link do bloco 4: /portal/solicitacoes é válido e fica dentro do portal", () => {
    assert.equal(linkPortalValido("/portal/solicitacoes"), true); assert.ok("/portal/solicitacoes".startsWith("/portal/"));
  });
  await caso("dedup do bloco 4: formato combinado, mesma decisão = mesma chave, decisão nova = chave nova", () => {
    const D = "2026-10-20T17:30:00.123456+00:00";
    assert.equal(chaveDedupSolicitacaoDecidida("sol-1", "aprovada", D), `solicitacao_vaga_decidida_cliente:sol-1:aprovada:${D}`);
    assert.equal(chaveDedupSolicitacaoDecidida("sol-1", "aprovada", D), chaveDedupSolicitacaoDecidida("sol-1", "aprovada", D));
    assert.notEqual(chaveDedupSolicitacaoDecidida("sol-1", "aprovada", D), chaveDedupSolicitacaoDecidida("sol-1", "recusada", D));
    assert.notEqual(chaveDedupSolicitacaoDecidida("sol-1", "aprovada", D), chaveDedupSolicitacaoDecidida("sol-1", "aprovada", "2026-10-21T10:00:00+00:00"));
    assert.notEqual(chaveDedupSolicitacaoDecidida("sol-1", "aprovada", D), chaveDedupSolicitacaoDecidida("sol-2", "aprovada", D));
    assert.equal(chaveDedupSolicitacaoDecidida("sol-1", "recusada", null), "solicitacao_vaga_decidida_cliente:sol-1:recusada:sem-data");
    assert.equal(chaveDedupPedidoDecidido("encerramento", "ped-1", "aprovado", D), `pedido_vaga_decidido_cliente:encerramento:ped-1:aprovado:${D}`);
    assert.notEqual(chaveDedupPedidoDecidido("alteracao", "ped-1", "aprovado", D), chaveDedupPedidoDecidido("encerramento", "ped-1", "aprovado", D));
    assert.notEqual(chaveDedupPedidoDecidido("alteracao", "ped-1", "aprovado", D), chaveDedupPedidoDecidido("alteracao", "ped-2", "aprovado", D));
    assert.notEqual(chaveDedupPedidoDecidido("alteracao", "ped-1", "aprovado", D), chaveDedupPedidoDecidido("alteracao", "ped-1", "recusado", D));
    assert.equal(chaveDedupPedidoDecidido("reativacao", "ped-1", "recusado", undefined), "pedido_vaga_decidido_cliente:reativacao:ped-1:recusado:sem-data");
  });

  // ── E-mails ao cliente: interruptor "E-mail" e destinatários ──
  const LISTA_EMAIL = ["email_cliente_candidato_entrevista", "email_cliente_lembrete_entrevista_hoje", "email_cliente_vaga_aprovada", "email_cliente_vaga_status_decidido", "email_cliente_solicitacao_recusada", "email_cliente_alteracao_decidida", "email_cliente_lembrete_agendamento"];
  await caso("e-mail ao cliente, regra do interruptor: SEM linha = ligado; ERRO de leitura = ligado; só ativo=false desliga", () => {
    assert.equal(emailClienteLigadoRegra({ linha: null, erro: false }), true);
    assert.equal(emailClienteLigadoRegra({ linha: undefined, erro: false }), true);
    assert.equal(emailClienteLigadoRegra({ linha: null, erro: true }), true);
    assert.equal(emailClienteLigadoRegra({ linha: { ativo: false }, erro: true }), true, "erro vale mais que a linha");
    assert.equal(emailClienteLigadoRegra({ linha: { ativo: true }, erro: false }), true);
    assert.equal(emailClienteLigadoRegra({ linha: { ativo: false }, erro: false }), false);
    assert.equal(emailClienteLigadoRegra({ linha: { ativo: null }, erro: false }), true, "nulo não desliga");
  });
  await caso("e-mail ao cliente, regra do interruptor é INVERSA à de sino/popup (sem linha: sino desliga, e-mail liga)", () => {
    assert.equal(canalClienteLigado({ linha: null, erro: false }), false); assert.equal(emailClienteLigadoRegra({ linha: null, erro: false }), true);
    assert.equal(canalClienteLigado({ linha: null, erro: true }), false); assert.equal(emailClienteLigadoRegra({ linha: null, erro: true }), true);
  });
  await caso("destinatários: 0 usuários no portal -> contato_email (último recurso)", () => {
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: [], contatoEmail: "contato@x.com", erro: false }), ["contato@x.com"]);
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: [], contatoEmail: "  contato@x.com  ", erro: false }), ["contato@x.com"]);
  });
  await caso("destinatários: 1, 2 e 3 usuários -> um endereço por pessoa, na ordem, sem o contato_email", () => {
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: ["a@x.com"], contatoEmail: "contato@x.com", erro: false }), ["a@x.com"]);
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: ["a@x.com", "b@x.com"], contatoEmail: "contato@x.com", erro: false }), ["a@x.com", "b@x.com"]);
    const tres = montarDestinatariosEmailCliente({ emailsLogin: ["a@x.com", "b@x.com", "c@x.com"], contatoEmail: null, erro: false });
    assert.deepEqual(tres, ["a@x.com", "b@x.com", "c@x.com"]);
    for (const e of tres) assert.ok(!e.includes(",") && !e.includes(";") && !e.includes(" "), "nunca vários endereços no mesmo destinatário");
  });
  await caso("destinatários: duplicados (sem diferenciar maiúsculas) e vazios/nulos são ignorados", () => {
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: ["A@x.com", "a@X.com ", "", "  ", null, undefined, "b@x.com"], contatoEmail: "c@x.com", erro: false }), ["A@x.com", "b@x.com"]);
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: ["", null, "  "], contatoEmail: "c@x.com", erro: false }), ["c@x.com"], "todos vazios = como sem usuário");
  });
  await caso("destinatários: erro de leitura -> contato_email (nunca bloqueia), mesmo com logins em mãos", () => {
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: [], contatoEmail: "c@x.com", erro: true }), ["c@x.com"]);
    assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: ["a@x.com"], contatoEmail: "c@x.com", erro: true }), ["c@x.com"]);
  });
  await caso("destinatários: sem contato_email (nulo, vazio ou só espaços) e sem usuários -> lista vazia", () => {
    for (const contato of [null, undefined, "", "   "]) {
      assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: [], contatoEmail: contato, erro: false }), [], String(contato));
      assert.deepEqual(montarDestinatariosEmailCliente({ emailsLogin: [], contatoEmail: contato, erro: true }), [], `erro ${contato}`);
    }
  });
  await caso("catálogo dos e-mails ao cliente: 7 eventos, só canal e-mail, sem lista, grupo avisos_cliente, com rótulo e nota", () => {
    assert.deepEqual([...EVENTOS_EMAIL_CLIENTE], LISTA_EMAIL);
    for (const ev of LISTA_EMAIL) {
      assert.equal(eventoEmailCliente(ev), true, ev); assert.equal(grupoDoEvento(ev), "avisos_cliente", ev); assert.equal(eventoSemLista(ev), true, ev);
      assert.deepEqual([...canaisDoEvento(ev)], ["email"], ev); assert.ok(ROTULO_EVENTO[ev] && NOTA_EVENTO[ev], ev);
      assert.equal(descricaoPadraoDoSistema("avisos_cliente", "email", ev), FRASE_EMAIL_CLIENTE, ev);
      assert.ok(ev.length <= 80 && ev.startsWith("email_cliente_"), ev);
    }
    assert.equal(APOIO_EMAILS_CLIENTE, "Os e-mails vão para o login de cada usuário do portal do cliente. Sem usuário no portal, vão para o e-mail de contato.");
  });
  await caso("catálogo: os 6 eventos de sino/popup não mudaram e nenhum nome colide com os e-mails ao cliente", () => {
    assert.equal(EVENTOS_POR_GRUPO.avisos_cliente.length, 6);
    for (const ev of EVENTOS_POR_GRUPO.avisos_cliente) { assert.equal(eventoEmailCliente(ev), false, ev); assert.deepEqual([...canaisDoEvento(ev)], ["sino", "popup"], ev); }
    assert.equal(new Set([...EVENTOS_POR_GRUPO.avisos_cliente, ...LISTA_EMAIL, ...EVENTOS_POR_GRUPO.portal_cliente, ...EVENTOS_POR_GRUPO.vagas]).size, 6 + 7 + 8 + 26);
    assert.equal(EVENTOS_SEM_LISTA.length, 13);
    for (const ev of ["solicitacao_vaga", "vaga_pausa_pedida", "portal_candidato_aprovado", "rescisao_paga"]) assert.equal(eventoSemLista(ev), false, ev);
  });
  await caso("padrão dos e-mails ao cliente (documentação): 5 ligados e 2 desligados; grupo continua sem Restaurar padrão", () => {
    assert.deepEqual(Object.keys(PADRAO_EMAIL_CLIENTE).sort(), [...LISTA_EMAIL].sort());
    const desligados = Object.entries(PADRAO_EMAIL_CLIENTE).filter(([, v]) => !v).map(([k]) => k).sort();
    assert.deepEqual(desligados, ["email_cliente_vaga_aprovada", "email_cliente_vaga_status_decidido"]);
    assert.equal(Object.values(PADRAO_EMAIL_CLIENTE).filter(Boolean).length, 5);
    assert.equal(grupoTemPadrao("avisos_cliente"), false);
  });

  // ── Decisão do cliente (aprovou/reprovou candidato): sino e popup internos ──
  const BASE_DEC = { cliente: "Maxsoy", candidato: "Maria Souza", vagaTitulo: "Auxiliar de Produção" };
  await caso("decisão do cliente, interruptor do SINO: sem linha = ligado; erro = ligado; só ativo=false desliga", () => {
    assert.equal(sinoDecisaoLigado({ linha: null, erro: false }), true);
    assert.equal(sinoDecisaoLigado({ linha: undefined, erro: false }), true);
    assert.equal(sinoDecisaoLigado({ linha: null, erro: true }), true);
    assert.equal(sinoDecisaoLigado({ linha: { ativo: false }, erro: true }), true, "erro vale mais que a linha");
    assert.equal(sinoDecisaoLigado({ linha: { ativo: true }, erro: false }), true);
    assert.equal(sinoDecisaoLigado({ linha: { ativo: false }, erro: false }), false);
    assert.equal(sinoDecisaoLigado({ linha: { ativo: null }, erro: false }), true);
  });
  await caso("decisão do cliente, interruptor do POPUP: sem linha = NÃO mostra; erro = não mostra; só ativo=true liga", () => {
    assert.equal(popupDecisaoLigado({ linha: null, erro: false }), false);
    assert.equal(popupDecisaoLigado({ linha: undefined, erro: false }), false);
    assert.equal(popupDecisaoLigado({ linha: null, erro: true }), false);
    assert.equal(popupDecisaoLigado({ linha: { ativo: true }, erro: true }), false, "erro vale mais que a linha");
    assert.equal(popupDecisaoLigado({ linha: { ativo: true }, erro: false }), true);
    assert.equal(popupDecisaoLigado({ linha: { ativo: false }, erro: false }), false);
    assert.equal(popupDecisaoLigado({ linha: { ativo: null }, erro: false }), false);
  });
  await caso("decisão do cliente: o resolvedor dá desligado só com ativo=false; sem linha ou erro cai em legado (= sino ligado)", async () => {
    for (const ev of Object.values(EVENTO_POR_DECISAO)) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado", ev);
      const semLinha = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino");
      assert.equal(semLinha.modo, "legado"); assert.equal(semLinha.falhou, false);
      const erro = await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "sino");
      assert.equal(erro.modo, "legado"); assert.equal(erro.falhou, true);
      const lista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2")] } }), ev, "sino");
      assert.equal(lista.modo, "configurado"); assert.deepEqual(lista.userIds, ["u1", "u2"]);
    }
  });
  await caso("decisão do cliente: responsável + lista sem duplicar; sem responsável; sem os dois = vazio (linha geral)", () => {
    assert.deepEqual(userIdsDestinoDecisao("resp", ["a", "b"]), ["resp", "a", "b"]);
    assert.deepEqual(userIdsDestinoDecisao("resp", ["a", "resp", "b", "a"]), ["resp", "a", "b"], "quem está nos dois não repete");
    assert.deepEqual(userIdsDestinoDecisao(null, ["a"]), ["a"]); assert.deepEqual(userIdsDestinoDecisao(undefined, ["a", ""]), ["a"]);
    assert.deepEqual(userIdsDestinoDecisao("resp", []), ["resp"]);
    assert.deepEqual(userIdsDestinoDecisao(null, []), []); assert.deepEqual(userIdsDestinoDecisao("", []), []);
  });
  await caso("decisão do cliente, texto: aprovação com comentário e reprovação com motivo", () => {
    const a = textoAvisoDecisaoCliente({ decisao: "aprovado", ...BASE_DEC, feedback: "  Ótimo perfil, pode contratar  " });
    assert.equal(a.titulo, "Candidato aprovado pelo cliente");
    assert.equal(a.mensagem, "Maxsoy aprovou a candidatura de Maria Souza para a vaga Auxiliar de Produção — Comentário do cliente: Ótimo perfil, pode contratar");
    const r = textoAvisoDecisaoCliente({ decisao: "reprovado", ...BASE_DEC, feedback: "Perfil não aderiu à cultura da empresa" });
    assert.equal(r.titulo, "Candidato reprovado pelo cliente");
    assert.equal(r.mensagem, "Maxsoy reprovou a candidatura de Maria Souza para a vaga Auxiliar de Produção — Motivo: Perfil não aderiu à cultura da empresa");
  });
  await caso("decisão do cliente, texto: dado nulo só encurta (sem vaga, sem feedback, nomes vazios)", () => {
    assert.equal(textoAvisoDecisaoCliente({ decisao: "aprovado", cliente: "Maxsoy", candidato: "Maria" }).mensagem, "Maxsoy aprovou a candidatura de Maria");
    assert.equal(textoAvisoDecisaoCliente({ decisao: "reprovado", cliente: "Maxsoy", candidato: "Maria", vagaTitulo: "  ", feedback: "" }).mensagem, "Maxsoy reprovou a candidatura de Maria");
    assert.equal(textoAvisoDecisaoCliente({ decisao: "aprovado", cliente: null, candidato: undefined, vagaTitulo: null, feedback: null }).mensagem, "Cliente aprovou a candidatura de Candidato");
    assert.equal(textoAvisoDecisaoCliente({ decisao: "reprovado" }).mensagem, "Cliente reprovou a candidatura de Candidato");
  });
  await caso("decisão do cliente, texto: comentário/motivo longo é resumido (mesmo corte de limitarMensagemAviso)", () => {
    const longo = "x".repeat(900);
    for (const decisao of ["aprovado", "reprovado"] as const) {
      const t = textoAvisoDecisaoCliente({ decisao, ...BASE_DEC, feedback: longo });
      assert.equal(t.mensagem.length, 400); assert.ok(t.mensagem.endsWith("…"));
      const completo = `Maxsoy ${decisao === "aprovado" ? "aprovou" : "reprovou"} a candidatura de Maria Souza para a vaga Auxiliar de Produção — ${decisao === "aprovado" ? "Comentário do cliente" : "Motivo"}: ${longo}`;
      assert.equal(t.mensagem, limitarMensagemAviso(completo), "mesmo corte da função do bloco de avisos ao cliente");
    }
    assert.equal(limitarMensagemAviso("a".repeat(400)).length, 400);
  });
  await caso("decisão do cliente, texto: nada interno (fee, admissão, notas, quem decidiu)", () => {
    const entrada = { decisao: "aprovado", ...BASE_DEC, feedback: "ok", fee_rs_percentual: 15, admissao_salario: 3500, admissao_centro_custo: "CC-77", admissao_gestor: "Gestor Secreto", observacoes: "nota interna X", decidido_por: "Analista Interno", responsavel: "Responsável Y" };
    for (const decisao of ["aprovado", "reprovado"] as const) {
      const texto = JSON.stringify(textoAvisoDecisaoCliente({ ...entrada, decisao } as never));
      for (const proibido of ["15", "3500", "CC-77", "Gestor Secreto", "nota interna", "Analista Interno", "Responsável Y"]) assert.ok(!texto.includes(proibido), `${decisao}: ${proibido}`);
    }
  });
  await caso("decisão do cliente: tipos de notificação e evento de cada decisão (os tipos antigos se mantêm)", () => {
    assert.deepEqual(TIPO_NOTIFICACAO_POR_DECISAO, { aprovado: "aprovacao_cliente", reprovado: "reprovacao_cliente" });
    assert.deepEqual([...TIPOS_NOTIFICACAO_DECISAO].sort(), ["aprovacao_cliente", "reprovacao_cliente"]);
    assert.deepEqual(EVENTO_POR_DECISAO, { aprovado: "portal_candidato_aprovado", reprovado: "portal_candidato_reprovado" });
    assert.equal(EVENTO_POR_TIPO_NOTIFICACAO.aprovacao_cliente, "portal_candidato_aprovado"); assert.equal(EVENTO_POR_TIPO_NOTIFICACAO.reprovacao_cliente, "portal_candidato_reprovado");
  });
  await caso("decisão do cliente, popup: janela de 30 dias e quais tipos aparecem conforme o canal popup de cada evento", () => {
    assert.equal(DIAS_JANELA_POPUP_DECISAO, 30);
    assert.equal(inicioJanelaPopupDecisao(new Date("2026-10-20T12:00:00Z")), "2026-09-20T12:00:00.000Z");
    assert.deepEqual(tiposComPopupLigado([]), []);
    assert.deepEqual(tiposComPopupLigado(["portal_candidato_aprovado"]), ["aprovacao_cliente"]);
    assert.deepEqual(tiposComPopupLigado(["portal_candidato_reprovado"]), ["reprovacao_cliente"]);
    assert.deepEqual(tiposComPopupLigado(["portal_candidato_aprovado", "portal_candidato_reprovado"]).sort(), ["aprovacao_cliente", "reprovacao_cliente"]);
    assert.deepEqual(tiposComPopupLigado(["evento_desconhecido"]), []);
  });
  await caso("decisão do cliente, catálogo: os 2 eventos têm e-mail, sino e popup; popup sem lista; e-mail inalterado", () => {
    assert.deepEqual([...EVENTOS_DECISAO_CLIENTE], ["portal_candidato_aprovado", "portal_candidato_reprovado"]);
    for (const ev of EVENTOS_DECISAO_CLIENTE) {
      assert.equal(eventoDecisaoCliente(ev), true, ev); assert.equal(grupoDoEvento(ev), "portal_cliente", ev);
      assert.deepEqual([...canaisDoEvento(ev)], ["email", "sino", "popup"], ev);
      assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(canalSemListaPermitido(ev, "popup"), true); assert.equal(canalSemListaPermitido(ev, "email"), false);
      assert.equal(canalSoInterruptor(ev, "popup"), true); assert.equal(canalSoInterruptor(ev, "sino"), false); assert.equal(canalSoInterruptor(ev, "email"), false);
      assert.equal(eventoSemLista(ev), false, "continua com lista (e-mail e sino)");
      assert.match(NOTA_EVENTO[ev], /responsável pelo candidato SEMPRE/); assert.match(NOTA_EVENTO[ev], /Popup/);
      assert.match(descricaoPadraoDoSistema("portal_cliente", "sino", ev), /só o responsável pelo candidato/);
      assert.match(descricaoPadraoDoSistema("portal_cliente", "popup", ev), /nenhuma|ninguém vê o popup/);
    }
    assert.equal(descricaoPadraoDoSistema("portal_cliente", "email", "portal_candidato_aprovado"), "Padrão do sistema: Olver e RH (olver@ e rh@) recebem.");
    assert.equal(descricaoPadraoDoSistema("portal_cliente", "email", "portal_candidato_reprovado"), "Sem destinatários: ninguém recebe.");
    assert.equal(EVENTOS_POR_GRUPO.portal_cliente.length, 8, "nenhum evento novo no grupo");
  });
  await caso("decisão do cliente, tela: sem linha o sino e o e-mail aparecem ligados e o popup desligado (coerente com o código)", () => {
    for (const ev of EVENTOS_DECISAO_CLIENTE) { assert.equal(ligadoSemLinha(ev, "email"), true); assert.equal(ligadoSemLinha(ev, "sino"), true); assert.equal(ligadoSemLinha(ev, "popup"), false); }
    assert.equal(ligadoSemLinha("indicacao_decidida_cliente", "sino"), false, "avisos ao cliente: sem linha = desligado");
    assert.equal(ligadoSemLinha("email_cliente_vaga_aprovada", "email"), true);
    assert.equal(ligadoSemLinha("vaga_criada", "email"), true); assert.equal(ligadoSemLinha("vaga_criada", "sino"), true);
  });
  await caso("decisão do cliente, padrão: sino e popup ligados com lista vazia; e-mail igual a antes (reprovado desligado)", () => {
    const p = PADRAO_AVISOS.portal_cliente;
    for (const ev of EVENTOS_DECISAO_CLIENTE) {
      assert.deepEqual(p[ev].sino, { ativo: true, destinatarios: [] }); assert.deepEqual(p[ev].popup, { ativo: true, destinatarios: [] });
      assert.equal(p[ev].email!.destinatarios.length, 2);
    }
    assert.equal(p.portal_candidato_aprovado.email!.ativo, true); assert.equal(p.portal_candidato_reprovado.email!.ativo, false);
  });
  await caso("decisão do cliente, restauração: sino e popup vazios NÃO são 409 e levam permite_vazio; as outras regras seguem", () => {
    const r = montarPayloadRestauracao("portal_cliente", new Set(PADRAO_AVISOS.portal_cliente.indicacao_candidato_recebida.email!.destinatarios.flatMap((d) => (d.tipo_destinatario === "usuario" ? [d.usuario_id] : []))));
    assert.deepEqual(r.semDestinatario, []);
    const marcados: string[] = [];
    for (const e of r.payload.eventos) for (const c of e.canais) {
      // a cópia em avisosPadrao e a regra do catálogo têm de dar o mesmo resultado (drift = falha aqui)
      assert.equal(c.permite_vazio === true, canalSemListaPermitido(e.evento, c.canal), `${e.evento}/${c.canal}`);
      if (c.permite_vazio) marcados.push(`${e.evento}/${c.canal}`);
    }
    assert.deepEqual(marcados.sort(), ["portal_candidato_aprovado/popup", "portal_candidato_aprovado/sino", "portal_candidato_reprovado/popup", "portal_candidato_reprovado/sino"]);
    const vazio = montarPayloadRestauracao("portal_cliente", new Set());
    assert.ok(!vazio.semDestinatario.some((x) => EVENTOS_DECISAO_CLIENTE.includes(x.evento as never) && x.canal !== "email"));
    assert.ok(!vazio.semDestinatario.some((x) => x.evento === "portal_candidato_aprovado" && x.canal === "email"), "e-mail aprovado usa endereços livres (olver@ e rh@): não depende de usuário ativo");
    assert.ok(vazio.semDestinatario.some((x) => x.evento === "indicacao_candidato_recebida" && x.canal === "popup"));
  });

  // ── Garantia R&S: sino, popup e e-mail internos configuráveis ──
  const GAR = ["garantia_rs_vencendo", "garantia_rs_acionada"];
  await caso("garantia R&S: eventos novos no grupo vagas; os tipos de gravação de sempre (alerta_garantia_rs, garantia_acionada) não mudam", () => {
    assert.deepEqual([...EVENTOS_GARANTIA_RS], GAR);
    assert.deepEqual(EVENTO_POR_GARANTIA, { vencendo: "garantia_rs_vencendo", acionada: "garantia_rs_acionada" });
    assert.deepEqual(TIPO_NOTIFICACAO_POR_GARANTIA, { vencendo: "alerta_garantia_rs", acionada: "garantia_acionada" });
    for (const ev of GAR) {
      assert.equal(eventoGarantiaRS(ev), true); assert.equal(eventoComResponsavelNoSino(ev), true); assert.equal(grupoDoEvento(ev), "vagas", ev);
      assert.ok(EVENTOS_POR_GRUPO.vagas.includes(ev)); assert.deepEqual([...canaisDoEvento(ev)], ["email", "sino", "popup"], ev);
      assert.ok(ROTULO_EVENTO[ev] && NOTA_EVENTO[ev], ev); assert.equal(eventoSemLista(ev), false, "e-mail e sino têm lista");
      assert.match(NOTA_EVENTO[ev], /responsável pelo candidato SEMPRE/); assert.match(NOTA_EVENTO[ev], /O cliente não recebe nada/);
    }
    assert.equal(EVENTOS_POR_GRUPO.vagas.length, 26); assert.equal(eventoGarantiaRS("vaga_criada"), false);
  });
  await caso("garantia R&S, tela: sino e popup vazios permitidos, popup só interruptor, e sem linha: e-mail e sino ligados, popup desligado", () => {
    for (const ev of GAR) {
      assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(canalSemListaPermitido(ev, "popup"), true); assert.equal(canalSemListaPermitido(ev, "email"), false);
      assert.equal(canalSoInterruptor(ev, "popup"), true); assert.equal(canalSoInterruptor(ev, "sino"), false);
      assert.equal(ligadoSemLinha(ev, "email"), true); assert.equal(ligadoSemLinha(ev, "sino"), true); assert.equal(ligadoSemLinha(ev, "popup"), false);
      assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /só o responsável pelo candidato/); assert.match(descricaoPadraoDoSistema("vagas", "popup", ev), /ninguém vê o popup/);
      assert.match(descricaoPadraoDoSistema("vagas", "email", ev), /como sempre/);
    }
    assert.match(descricaoPadraoDoSistema("vagas", "email", "garantia_rs_vencendo"), /sem diretoria e superuser/);
    assert.doesNotMatch(descricaoPadraoDoSistema("vagas", "email", "garantia_rs_acionada"), /sem diretoria/);
    assert.equal(canalSemListaPermitido("vaga_criada", "sino"), false, "os outros eventos de vagas seguem com a regra do último destinatário");
    assert.equal(ligadoSemLinha("vaga_criada", "popup"), true, "regra antiga dos outros eventos de vagas não mudou");
  });
  await caso("garantia R&S, resolvedor: sino sem linha/erro = ligado; ativo=false desliga; lista = configurado", async () => {
    for (const ev of GAR) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado", ev);
      const semLinha = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino"); assert.equal(semLinha.modo, "legado"); assert.equal(semLinha.falhou, false);
      const erro = await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "sino"); assert.equal(erro.modo, "legado"); assert.equal(erro.falhou, true);
      const lista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2")] } }), ev, "sino"); assert.equal(lista.modo, "configurado"); assert.deepEqual(lista.userIds, ["u1", "u2"]);
    }
  });
  await caso("garantia R&S, resolvedor: e-mail LIGADO SEM lista = legado (comportamento de sempre); com lista = configurado; desligado = ninguém", async () => {
    for (const ev of GAR) {
      const ligadoSemLista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [] }, perfis: [] }), ev, "email", null);
      assert.equal(ligadoSemLista.modo, "legado"); assert.equal(ligadoSemLista.falhou, false); assert.deepEqual(ligadoSemLista.emails, []);
      const comLista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com"), email("b@x.com")] } }), ev, "email", null);
      assert.equal(comLista.modo, "configurado"); assert.deepEqual(comLista.emails.map((e) => e.email), ["a@x.com", "b@x.com"]);
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("a@x.com")] } }), ev, "email", null)).modo, "desligado");
      const erro = await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "email", null); assert.equal(erro.modo, "legado"); assert.equal(erro.falhou, true);
    }
  });
  await caso("garantia R&S: responsável + lista sem duplicar; sem os dois = vazio (linha geral da unidade)", () => {
    assert.deepEqual(userIdsDestinoDecisao("resp", ["a", "resp", "b"]), ["resp", "a", "b"]);
    assert.deepEqual(userIdsDestinoDecisao(null, []), []); assert.deepEqual(userIdsDestinoDecisao("resp", []), ["resp"]);
  });
  await caso("garantia R&S, texto do vencimento: usa a DATA de vencimento (nunca 'hoje') e nada interno", () => {
    const t = textoAvisoGarantiaVencendo({ candidato: "Maria Souza", vagaTitulo: "Auxiliar", cliente: "Maxsoy", dataFim: "2026-10-20" });
    assert.equal(t.titulo, "⚠️ Garantia R&S com vencimento em 20/10/2026: Maria Souza");
    assert.equal(t.mensagem, 'A garantia de reposição de Maria Souza na vaga "Auxiliar" (Maxsoy) tem vencimento em 20/10/2026.');
    assert.ok(!/hoje/i.test(t.titulo + t.mensagem));
    const n = textoAvisoGarantiaVencendo({ dataFim: "2026-01-05" });
    assert.equal(n.mensagem, 'A garantia de reposição de Candidato na vaga "Vaga" (Cliente) tem vencimento em 05/01/2026.');
    const interno = textoAvisoGarantiaVencendo({ candidato: "A", vagaTitulo: "B", cliente: "C", dataFim: "2026-10-20", fee_rs_percentual: 15, admissao_fee_valor: 4200, observacoes: "nota interna", decidido_por: "Analista Interno" } as never);
    for (const proibido of ["15", "4200", "nota interna", "Analista Interno"]) assert.ok(!JSON.stringify(interno).includes(proibido), proibido);
  });
  await caso("garantia R&S, texto da garantia acionada: os textos de sempre; nulos só encurtam", () => {
    assert.deepEqual(textoAvisoGarantiaAcionada({ candidato: "Maria", vagaTitulo: "Auxiliar", cliente: "Maxsoy" }), { titulo: "🔄 Garantia acionada: Maria", mensagem: "Reposição gratuita iniciada para Auxiliar (Maxsoy). Nova vaga aberta." });
    assert.equal(textoAvisoGarantiaAcionada({}).mensagem, "Reposição gratuita iniciada para vaga (Cliente). Nova vaga aberta.");
    assert.equal(textoAvisoGarantiaAcionada({ vagaTitulo: null }).titulo, "🔄 Garantia acionada: Candidato");
  });
  await caso("garantia R&S, e-mail do vencimento: no dia sai EXATAMENTE o texto de sempre; em recuperação fala da data (nunca 'hoje')", () => {
    const hoje = textosEmailGarantiaVencendo({ candidato: "Maria", cliente: "Maxsoy", dataFim: "2026-10-20", hojeISO: "2026-10-20" });
    assert.deepEqual(hoje, { assunto: "⚠️ Hoje é o último dia da garantia de Maria — Maxsoy", titulo: "⚠️ Último dia da garantia R&S", destaque: "🚨 A garantia vence HOJE!" });
    for (const dataFim of ["2026-10-19", "2026-10-18"]) {
      const t = textosEmailGarantiaVencendo({ candidato: "Maria", cliente: "Maxsoy", dataFim, hojeISO: "2026-10-20" });
      assert.ok(!/hoje/i.test(JSON.stringify(t)), dataFim); assert.ok(t.assunto.includes(formatarDataBR(dataFim)) && t.destaque.includes(formatarDataBR(dataFim)));
    }
  });
  await caso("garantia R&S, datas em horário de Brasília: hoje, janela de recuperação de 2 dias e virada de mês", () => {
    assert.equal(dataBrasilia(new Date("2026-10-20T09:00:00Z")), "2026-10-20");
    assert.equal(dataBrasilia(new Date("2026-10-21T02:59:00Z")), "2026-10-20", "23:59 em Brasília ainda é dia 20");
    assert.equal(dataBrasilia(new Date("2026-10-21T03:00:00Z")), "2026-10-21");
    assert.equal(DIAS_RECUPERACAO_GARANTIA, 2);
    assert.deepEqual(janelaAlertaGarantia(new Date("2026-10-20T09:00:00Z")), { inicio: "2026-10-18", fim: "2026-10-20" });
    assert.deepEqual(janelaAlertaGarantia(new Date("2026-11-01T09:00:00Z")), { inicio: "2026-10-30", fim: "2026-11-01" });
    assert.deepEqual(janelaAlertaGarantia(new Date("2027-01-01T09:00:00Z")), { inicio: "2026-12-30", fim: "2027-01-01" });
    assert.equal(somarDiasISO("2026-03-01", -1), "2026-02-28");
  });
  await caso("garantia R&S, prazo da rota acionar: vale até o fim do dia do vencimento em Brasília (antes expirava às 20:59)", () => {
    assert.equal(garantiaExpirada("2026-10-20", new Date("2026-10-21T01:30:00Z")), false, "22:30 do dia 20 em Brasília: ainda vale");
    assert.equal(garantiaExpirada("2026-10-20", new Date("2026-10-21T02:59:58Z")), false);
    assert.equal(garantiaExpirada("2026-10-20", new Date("2026-10-21T03:00:01Z")), true, "00:00:01 do dia 21 em Brasília: expirou");
    assert.equal(garantiaExpirada("2026-10-20", new Date("2026-10-19T12:00:00Z")), false);
    assert.equal(garantiaExpirada(null), false); assert.equal(garantiaExpirada(undefined), false); assert.equal(garantiaExpirada(""), false);
  });
  await caso("garantia R&S, carimbo do cron: grava se algum canal entregou ou se tudo está desligado; não grava se tudo que está ligado falhou", () => {
    assert.equal(deveCarimbarGarantia(["enviado", "enviado"]), true);
    assert.equal(deveCarimbarGarantia(["enviado", "falhou"]), true, "um canal entregou");
    assert.equal(deveCarimbarGarantia(["desligado", "enviado"]), true);
    assert.equal(deveCarimbarGarantia(["desligado", "desligado"]), true, "nada a enviar");
    assert.equal(deveCarimbarGarantia(["falhou", "falhou"]), false);
    assert.equal(deveCarimbarGarantia(["falhou", "desligado"]), false, "o único canal ligado falhou");
  });
  await caso("garantia R&S, fallback do cron: só para coluna do carimbo inexistente (42703 ou mensagem citando a coluna)", () => {
    assert.equal(erroColunaCarimboInexistente({ code: "42703", message: "qualquer" }), true);
    assert.equal(erroColunaCarimboInexistente({ code: "42703" }), true);
    assert.equal(erroColunaCarimboInexistente({ code: "PGRST204", message: "Could not find the 'garantia_alerta_enviado_em' column of 'candidatos_vagas' in the schema cache" }), true);
    assert.equal(erroColunaCarimboInexistente({ message: 'column candidatos_vagas.garantia_alerta_enviado_em does not exist' }), true);
    assert.equal(erroColunaCarimboInexistente({ code: "57014", message: "canceling statement due to statement timeout" }), false);
    assert.equal(erroColunaCarimboInexistente({ message: "TypeError: fetch failed" }), false);
    assert.equal(erroColunaCarimboInexistente({ code: "PGRST201", message: "Could not embed because more than one relationship was found" }), false);
    assert.equal(erroColunaCarimboInexistente({ code: "42P01", message: 'relation "x" does not exist' }), false);
    assert.equal(erroColunaCarimboInexistente({}), false);
    assert.equal(erroColunaCarimboInexistente(null), false); assert.equal(erroColunaCarimboInexistente(undefined), false);
  });
  await caso("garantia R&S, popup: os tipos alerta_garantia_rs e garantia_acionada seguem o canal popup dos seus eventos", () => {
    assert.deepEqual([...TIPOS_NOTIFICACAO_POPUP].sort(), ["alerta_garantia_rs", "aprovacao_cliente", "garantia_acionada", "reprovacao_cliente"]);
    assert.equal(EVENTO_POR_TIPO_NOTIFICACAO[TIPO_NOTIFICACAO_POR_GARANTIA.vencendo], EVENTO_POR_GARANTIA.vencendo);
    assert.equal(EVENTO_POR_TIPO_NOTIFICACAO[TIPO_NOTIFICACAO_POR_GARANTIA.acionada], EVENTO_POR_GARANTIA.acionada);
    assert.deepEqual(tiposComPopupLigado(["garantia_rs_vencendo"]), ["alerta_garantia_rs"]);
    assert.deepEqual(tiposComPopupLigado(["garantia_rs_acionada"]), ["garantia_acionada"]);
    assert.deepEqual(tiposComPopupLigado(["garantia_rs_vencendo", "garantia_rs_acionada", "portal_candidato_aprovado"]).sort(), ["alerta_garantia_rs", "aprovacao_cliente", "garantia_acionada"]);
    assert.deepEqual(tiposComPopupLigado([]), []);
  });
  await caso("garantia R&S, restauração do grupo vagas: sino e popup vazios com permite_vazio; e-mail com a lista de vaga_cancelada; as regras dos outros eventos seguem", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    assert.deepEqual(r.semDestinatario, []);
    const marcados: string[] = [];
    for (const e of r.payload.eventos) for (const c of e.canais) {
      assert.equal(c.permite_vazio === true, canalSemListaPermitido(e.evento, c.canal), `${e.evento}/${c.canal} (cópia em avisosPadrao × catálogo)`);
      if (c.permite_vazio) marcados.push(`${e.evento}/${c.canal}`);
    }
    assert.deepEqual(marcados.sort(), ["garantia_rs_acionada/popup", "garantia_rs_acionada/sino", "garantia_rs_vencendo/popup", "garantia_rs_vencendo/sino", "pos_venda_rs_7dias/popup", "pos_venda_rs_7dias/sino"].concat(["candidato_curriculo_atualizado/sino", "candidato_transferido/sino", "cobranca_rs_aguardando_validacao/sino", "cobranca_rs_atrasada/sino", "cobranca_rs_pendente_revisao/sino", "funcionario_nao_criado/sino", "lembrete_agendamento_pendente_analista/sino", "lembrete_comercial/popup", "lembrete_comercial/sino", "supervisao_cliente_atrasada/popup", "supervisao_cliente_atrasada/sino", "conta_receber_hortolandia_atrasada/popup", "conta_receber_hortolandia_atrasada/sino", "fee_rs_nao_configurado/sino", "aniversario_tres_dias/sino", "aniversario_no_dia/sino", "aniversario_no_dia/popup"]).sort());
    for (const ev of GAR) assert.equal(r.payload.eventos.find((e) => e.evento === ev)!.canais.find((c) => c.canal === "email")!.destinatarios.length, 3);
    const vazio = montarPayloadRestauracao("vagas", new Set());
    assert.ok(!vazio.semDestinatario.some((x) => GAR.includes(x.evento) && x.canal !== "email"), "sino e popup da garantia não são 409");
    assert.ok(vazio.semDestinatario.some((x) => x.evento === "vaga_criada" && x.canal === "sino"), "vaga_criada/sino continua exigindo destinatário");
  });

  // ── Pós-venda R&S: sino, popup e e-mail internos configuráveis ──
  await caso("pós-venda R&S: evento novo no grupo vagas; o tipo de gravação de sempre (pos_venda_rs) não muda; cópias de constantes coincidem", () => {
    assert.equal(EVENTO_POS_VENDA_RS, "pos_venda_rs_7dias"); assert.equal(EVENTO_POS_VENDA_RS_CATALOGO, EVENTO_POS_VENDA_RS);
    assert.equal(TIPO_NOTIFICACAO_POS_VENDA_RS, "pos_venda_rs");
    assert.deepEqual(EVENTO_POR_TIPO_POS_VENDA, { pos_venda_rs: "pos_venda_rs_7dias" });
    assert.equal(eventoPosVendaRS(EVENTO_POS_VENDA_RS), true); assert.equal(eventoPosVendaRS("vaga_criada"), false); assert.equal(eventoComResponsavelNoSino(EVENTO_POS_VENDA_RS), true);
    assert.equal(grupoDoEvento(EVENTO_POS_VENDA_RS), "vagas"); assert.ok(EVENTOS_POR_GRUPO.vagas.includes(EVENTO_POS_VENDA_RS));
    assert.deepEqual([...canaisDoEvento(EVENTO_POS_VENDA_RS)], ["email", "sino", "popup"]); assert.equal(eventoSemLista(EVENTO_POS_VENDA_RS), false);
    assert.ok(ROTULO_EVENTO[EVENTO_POS_VENDA_RS] && NOTA_EVENTO[EVENTO_POS_VENDA_RS]);
    assert.match(NOTA_EVENTO[EVENTO_POS_VENDA_RS], /responsáveis comerciais de sempre/); assert.match(NOTA_EVENTO[EVENTO_POS_VENDA_RS], /O cliente não recebe nada/);
    assert.equal(DIAS_POS_VENDA_RS, 7); assert.equal(DIAS_RECUPERACAO_POS_VENDA_RS, 2);
    for (const d of ["2026-10-20T09:00:00Z", "2026-10-21T02:59:00Z", "2026-10-21T03:00:00Z", "2027-01-01T09:00:00Z"]) assert.equal(dataBrasiliaPV(new Date(d)), dataBrasilia(new Date(d)));
    assert.equal(somarDiasISOPV("2026-03-01", -1), somarDiasISO("2026-03-01", -1));
  });
  await caso("pós-venda R&S, tela: sino e popup vazios permitidos, popup só interruptor, sem linha: e-mail e sino ligados e popup desligado; textos próprios", () => {
    const ev = EVENTO_POS_VENDA_RS;
    assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(canalSemListaPermitido(ev, "popup"), true); assert.equal(canalSemListaPermitido(ev, "email"), false);
    assert.equal(canalSoInterruptor(ev, "popup"), true); assert.equal(canalSoInterruptor(ev, "sino"), false);
    assert.equal(ligadoSemLinha(ev, "email"), true); assert.equal(ligadoSemLinha(ev, "sino"), true); assert.equal(ligadoSemLinha(ev, "popup"), false);
    assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /responsáveis comerciais de sempre/); assert.doesNotMatch(descricaoPadraoDoSistema("vagas", "sino", ev), /responsável pelo candidato/);
    assert.match(descricaoPadraoDoSistema("vagas", "popup", ev), /ninguém vê o popup/); assert.match(descricaoPadraoDoSistema("vagas", "email", ev), /como sempre/);
  });
  await caso("pós-venda R&S, resolvedor: sino sem linha/erro = ligado; ativo=false desliga; e-mail ligado sem lista = legado; com lista = configurado", async () => {
    const ev = EVENTO_POS_VENDA_RS;
    assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado");
    const semLinha = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino"); assert.equal(semLinha.modo, "legado"); assert.equal(semLinha.falhou, false);
    const erro = await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "sino"); assert.equal(erro.modo, "legado"); assert.equal(erro.falhou, true);
    const lista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2")] } }), ev, "sino"); assert.equal(lista.modo, "configurado"); assert.deepEqual(lista.userIds, ["u1", "u2"]);
    const ligadoSemLista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [] }, perfis: [] }), ev, "email", null);
    assert.equal(ligadoSemLista.modo, "legado"); assert.equal(ligadoSemLista.falhou, false);
    const comLista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com")] } }), ev, "email", null); assert.equal(comLista.modo, "configurado");
    assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("a@x.com")] } }), ev, "email", null)).modo, "desligado");
    assert.equal((await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "email", null)).modo, "legado");
  });
  await caso("pós-venda R&S: destinatários de sempre + lista sem duplicar, na ordem; vazio quando não há ninguém", () => {
    assert.deepEqual(userIdsSinoPosVenda(["com1", "com2"], ["a", "com1", "b"]), ["com1", "com2", "a", "b"]);
    assert.deepEqual(userIdsSinoPosVenda(["com1"], []), ["com1"]); assert.deepEqual(userIdsSinoPosVenda([], ["a", "a"]), ["a"]); assert.deepEqual(userIdsSinoPosVenda([], []), []);
  });
  await caso("pós-venda R&S, janela em Brasília: início + 7 entre hoje - 2 e hoje (início entre hoje - 9 e hoje - 7), virada de mês e de ano", () => {
    assert.deepEqual(janelaInicioPosVenda(new Date("2026-10-20T09:00:00Z")), { inicioMin: "2026-10-11", inicioMax: "2026-10-13", hoje: "2026-10-20" });
    assert.deepEqual(janelaInicioPosVenda(new Date("2026-10-21T02:59:00Z")), { inicioMin: "2026-10-11", inicioMax: "2026-10-13", hoje: "2026-10-20" }, "23:59 em Brasília ainda é dia 20");
    assert.deepEqual(janelaInicioPosVenda(new Date("2026-11-03T09:00:00Z")), { inicioMin: "2026-10-25", inicioMax: "2026-10-27", hoje: "2026-11-03" });
    assert.deepEqual(janelaInicioPosVenda(new Date("2027-01-05T09:00:00Z")), { inicioMin: "2026-12-27", inicioMax: "2026-12-29", hoje: "2027-01-05" });
    const agora = new Date("2026-10-20T09:00:00Z");
    for (const [ini, esperado] of [["2026-10-13", true], ["2026-10-12", true], ["2026-10-11", true], ["2026-10-10", false], ["2026-10-14", false], ["2026-10-20", false], [null, false], ["", false]] as const) assert.equal(posVendaNaJanela(ini, agora), esperado, String(ini));
  });
  await caso("pós-venda R&S, decisão do carimbo: entregue = grava; tudo desligado = grava; canal ligado sem entrega (falha ou sem destinatário) = NÃO grava", () => {
    assert.equal(deveCarimbarPosVenda(["enviado", "enviado"]), true); assert.equal(deveCarimbarPosVenda(["enviado", "falhou"]), true); assert.equal(deveCarimbarPosVenda(["desligado", "enviado"]), true);
    assert.equal(deveCarimbarPosVenda(["sem_destinatario", "enviado"]), true);
    assert.equal(deveCarimbarPosVenda(["desligado", "desligado"]), true);
    assert.equal(deveCarimbarPosVenda(["falhou", "falhou"]), false); assert.equal(deveCarimbarPosVenda(["sem_destinatario", "sem_destinatario"]), false);
    assert.equal(deveCarimbarPosVenda(["desligado", "sem_destinatario"]), false); assert.equal(deveCarimbarPosVenda(["falhou", "desligado"]), false); assert.equal(deveCarimbarPosVenda(["sem_destinatario", "falhou"]), false);
  });
  await caso("pós-venda R&S, texto: o de sempre ('completou 7 dias', com a data de início; nunca 'hoje') e nada interno", () => {
    const t = textoAvisoPosVendaRS({ candidato: "Maria Souza", vagaTitulo: "Auxiliar", cliente: "Maxsoy", dataInicio: "2026-10-13" });
    assert.equal(t.titulo, "🤝 Hora do pós-venda: Maria Souza — Maxsoy");
    assert.equal(t.mensagem, 'Maria Souza completou 7 dias na vaga "Auxiliar" (Maxsoy), início em 13/10/2026. Hora de fazer o contato de pós-venda com o cliente.');
    assert.ok(!/hoje/i.test(t.mensagem));
    assert.equal(textoAvisoPosVendaRS({ dataInicio: "2026-01-05" }).mensagem, 'Candidato completou 7 dias na vaga "Vaga" (Cliente), início em 05/01/2026. Hora de fazer o contato de pós-venda com o cliente.');
    const interno = textoAvisoPosVendaRS({ candidato: "A", vagaTitulo: "B", cliente: "C", dataInicio: "2026-10-13", fee_rs_percentual: 15, admissao_fee_valor: 4200, observacoes: "nota interna", decidido_por: "Analista Interno" } as never);
    for (const proibido of ["15", "4200", "nota interna", "Analista Interno"]) assert.ok(!JSON.stringify(interno).includes(proibido), proibido);
  });
  await caso("pós-venda R&S, popup: o tipo pos_venda_rs segue o canal popup do evento pos_venda_rs_7dias, e NÃO entra no popup de decisões (sem aviso duplicado)", () => {
    assert.equal(EVENTO_POR_TIPO_POS_VENDA[TIPO_NOTIFICACAO_POS_VENDA_RS], EVENTO_POS_VENDA_RS);
    assert.ok(!TIPOS_NOTIFICACAO_POPUP.includes(TIPO_NOTIFICACAO_POS_VENDA_RS)); assert.deepEqual(tiposComPopupLigado([EVENTO_POS_VENDA_RS]), []);
    assert.equal(popupDecisaoLigado({ linha: null, erro: false }), false, "sem linha = não mostra"); assert.equal(popupDecisaoLigado({ linha: { ativo: true }, erro: true }), false, "erro = não mostra");
    assert.equal(popupDecisaoLigado({ linha: { ativo: true }, erro: false }), true); assert.equal(popupDecisaoLigado({ linha: { ativo: false }, erro: false }), false);
  });
  await caso("pós-venda R&S, restauração do grupo vagas: sino e popup vazios com permite_vazio; e-mail com a lista de vaga_cancelada", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    const ev = r.payload.eventos.find((e) => e.evento === EVENTO_POS_VENDA_RS)!;
    assert.deepEqual(ev.canais.map((c) => c.canal).sort(), ["email", "popup", "sino"]);
    assert.equal(ev.canais.find((c) => c.canal === "email")!.destinatarios.length, 3);
    for (const c of ev.canais.filter((x) => x.canal !== "email")) { assert.equal(c.permite_vazio, true); assert.equal(c.destinatarios.length, 0); assert.equal(c.ativo, true); }
    const vazio = montarPayloadRestauracao("vagas", new Set());
    assert.ok(!vazio.semDestinatario.some((x) => x.evento === EVENTO_POS_VENDA_RS && x.canal !== "email"), "sino e popup do pós-venda não são 409");
  });

  // ── Avisos restantes: bloco B (transferência, currículo atualizado, funcionário não criado) ──
  const BLOCO_B = ["candidato_transferido", "candidato_curriculo_atualizado", "funcionario_nao_criado"];
  await caso("avisos restantes (B): eventos no grupo vagas, só canal sino, com rótulo, nota e padrão; nomes do código coincidem com o catálogo", () => {
    assert.deepEqual([EVENTO_CANDIDATO_TRANSFERIDO, EVENTO_CURRICULO_ATUALIZADO, EVENTO_FUNCIONARIO_NAO_CRIADO], BLOCO_B);
    assert.deepEqual(TIPO_TRANSFERENCIA_RESPONSAVEL, "transferencia_responsavel"); assert.deepEqual(TIPO_ATUALIZACAO_CURRICULO, "atualizacao_curriculo"); assert.deepEqual(TIPO_FUNCIONARIO_NAO_CRIADO, "funcionario_nao_criado_automaticamente");
    for (const ev of BLOCO_B) {
      assert.ok(eventoAvisoRestante(ev) && EVENTOS_AVISOS_RESTANTES.includes(ev) && EVENTOS_POR_GRUPO.vagas.includes(ev), ev); assert.equal(grupoDoEvento(ev), "vagas", ev);
      assert.deepEqual([...canaisDoEvento(ev)], ["sino"], ev); assert.ok(ROTULO_EVENTO[ev] && NOTA_EVENTO[ev] && AVISOS_RESTANTES[ev].padrao.sino, ev);
      assert.equal(eventoComResponsavelNoSino(ev), true, ev); assert.equal(eventoSemLista(ev), false, ev);
      assert.equal(canalSemListaPermitido(ev, "sino"), true, "sino pode ficar com a lista vazia"); assert.equal(ligadoSemLinha(ev, "sino"), true, "sem linha = sino ligado");
      assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /Desligado: ninguém/);
    }
    assert.equal(eventoAvisoRestante("garantia_rs_vencendo"), false); assert.equal(eventoAvisoRestante("agendamento_cliente"), false);
  });
  await caso("avisos restantes (B), resolvedor do sino: sem linha/erro = ligado; ativo=false desliga; com lista = configurado", async () => {
    for (const ev of BLOCO_B) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado", ev);
      const semLinha = await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino"); assert.equal(semLinha.modo, "legado"); assert.equal(semLinha.falhou, false);
      const erro = await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "sino"); assert.equal(erro.modo, "legado"); assert.equal(erro.falhou, true);
      const lista = await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("u1"), usuario("u2")] } }), ev, "sino"); assert.deepEqual(lista.userIds, ["u1", "u2"]);
    }
  });
  await caso("avisos restantes: união de destinatários sem duplicar (os de sempre primeiro) e decisão de carimbo", () => {
    assert.deepEqual(unirUserIds(["antigo", "novo"], ["a", "novo", "b"]), ["antigo", "novo", "a", "b"]);
    assert.deepEqual(unirUserIds([null, undefined, "x"], ["x"]), ["x"]); assert.deepEqual(unirUserIds([], []), []); assert.deepEqual(unirUserIds(["a", "a"], []), ["a"]);
    assert.equal(deveCarimbarAviso(["enviado", "falhou"]), true); assert.equal(deveCarimbarAviso(["desligado", "desligado"]), true); assert.equal(deveCarimbarAviso(["sem_destinatario", "enviado"]), true);
    assert.equal(deveCarimbarAviso(["falhou", "falhou"]), false); assert.equal(deveCarimbarAviso(["sem_destinatario", "sem_destinatario"]), false); assert.equal(deveCarimbarAviso(["desligado", "sem_destinatario"]), false);
  });
  await caso("avisos restantes (B), textos: o de sempre para o responsável antigo; texto próprio para o novo e para a lista; sem dado interno", () => {
    const t = textoTransferenciaResponsavel({ candidato: "Maria Souza", antigo: "Ana Analista", novo: "Bia Souza" });
    assert.deepEqual(t.antigo, { titulo: "Candidato transferido", mensagem: "Maria Souza foi transferido para Bia Souza" });
    assert.deepEqual(t.novo, { titulo: "Candidato transferido para você", mensagem: "Maria Souza foi transferido para você (antes: Ana Analista)." });
    assert.deepEqual(t.lista, { titulo: "Candidato transferido", mensagem: "Maria Souza foi transferido de Ana Analista para Bia Souza." });
    const sem = textoTransferenciaResponsavel({ candidato: "Maria", antigo: null, novo: null });
    assert.equal(sem.antigo.mensagem, "Maria foi transferido para Sem responsável"); assert.match(sem.novo.mensagem, /antes: Sem responsável/);
    assert.deepEqual(textoCurriculoAtualizado({ candidato: "Maria", resumo: "Novo telefone e nova experiência." }), { titulo: "Currículo atualizado: Maria", mensagem: "Novo telefone e nova experiência." });
    assert.equal(textoCurriculoAtualizado({}).titulo, "Currículo atualizado: Candidato");
    assert.deepEqual(textoFuncionarioNaoCriado({ candidato: "Maria" }), { titulo: "Funcionário não foi criado automaticamente", mensagem: 'O pacote de admissão de "Maria" foi gerado, mas o registro em Funcionários não foi criado automaticamente. Verifique e crie manualmente se necessário.' });
    assert.equal(HORAS_SEM_REPETIR_AVISO, 24); assert.equal(inicioJanelaSemRepetir(new Date("2026-10-20T12:00:00Z")), "2026-10-19T12:00:00.000Z");
    const interno = JSON.stringify([t, textoFuncionarioNaoCriado({ candidato: "A", fee_rs_percentual: 15, observacoes: "nota interna" } as never)]);
    for (const proibido of ["15", "nota interna", "fee"]) assert.ok(!interno.includes(proibido), proibido);
  });
  await caso("avisos restantes (B), restauração do grupo vagas: sino dos 3 eventos com permite_vazio, sem 409", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    for (const ev of BLOCO_B) {
      const e = r.payload.eventos.find((x) => x.evento === ev)!; assert.deepEqual(e.canais.map((c) => c.canal), ["sino"]);
      assert.equal(e.canais[0].permite_vazio, true); assert.equal(e.canais[0].ativo, true); assert.equal(e.canais[0].destinatarios.length, 0);
    }
    assert.ok(!montarPayloadRestauracao("vagas", new Set()).semDestinatario.some((x) => BLOCO_B.includes(x.evento)));
  });

  // ── Avisos restantes: bloco C (agendamento do cliente: responsável + lista) ──
  await caso("avisos restantes (C): lembrete_agendamento_pendente_analista no grupo vagas (sino e e-mail); agendamento_cliente segue no catálogo com a nota nova", () => {
    const ev = "lembrete_agendamento_pendente_analista";
    assert.ok(eventoAvisoRestante(ev) && EVENTOS_POR_GRUPO.vagas.includes(ev)); assert.deepEqual([...canaisDoEvento(ev)], ["sino", "email"]);
    assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(canalSemListaPermitido(ev, "email"), false); assert.equal(ligadoSemLinha(ev, "email"), true); assert.equal(ligadoSemLinha(ev, "sino"), true);
    assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /responsável pelo candidato/); assert.match(descricaoPadraoDoSistema("vagas", "email", ev), /como sempre/);
    assert.match(NOTA_EVENTO[ev], /SEMPRE/); assert.match(NOTA_EVENTO[ev], /ao CLIENTE é outro aviso/);
    assert.ok(EVENTOS_POR_GRUPO.portal_cliente.includes("agendamento_cliente")); assert.equal(eventoAvisoRestante("agendamento_cliente"), false, "o evento já existia: não é recriado");
    assert.match(NOTA_EVENTO.agendamento_cliente, /SEMPRE é avisado/); assert.match(NOTA_EVENTO.agendamento_cliente, /nem o responsável/); assert.equal(ROTULO_EVENTO.agendamento_cliente, "Cliente agendou entrevista");
    assert.deepEqual([...canaisDoEvento("agendamento_cliente")], ["email", "sino"]);
  });
  await caso("avisos restantes (C), resolvedor: sino e e-mail do lembrete e do agendamento (sem linha/erro, desligado, lista)", async () => {
    for (const ev of ["lembrete_agendamento_pendente_analista", "agendamento_cliente"]) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado", ev);
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("a@x.com")] } }), ev, "email", null)).modo, "desligado", ev);
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [] }, perfis: [] }), ev, "email", null)).modo, "legado", ev);
      assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com")] } }), ev, "email", null)).emails.map((e) => e.email), ["a@x.com"]);
    }
  });

  // ── Avisos restantes: bloco D (crons de lembrete: comercial, supervisão, faturamento) ──
  const BLOCO_D = ["lembrete_comercial", "supervisao_cliente_atrasada", "conta_receber_hortolandia_atrasada"];
  await caso("avisos restantes (D): eventos no grupo vagas com os canais certos, rótulo, nota e padrão; tipos de gravação de sempre", () => {
    assert.deepEqual([EVENTO_LEMBRETE_COMERCIAL, EVENTO_SUPERVISAO_ATRASADA, EVENTO_CONTA_HORTOLANDIA_ATRASADA], BLOCO_D);
    assert.deepEqual([TIPO_LEMBRETE_COMERCIAL, TIPO_SUPERVISAO_ATRASADA, TIPO_CONTA_HORTOLANDIA_ATRASADA], ["lembrete_comercial", "supervisao_cliente_atrasada", "conta_receber_hortolandia_atrasada"]);
    assert.deepEqual([...canaisDoEvento("lembrete_comercial")], ["sino", "popup"]); assert.deepEqual([...canaisDoEvento("supervisao_cliente_atrasada")], ["sino", "email", "popup"]); assert.deepEqual([...canaisDoEvento("conta_receber_hortolandia_atrasada")], ["sino", "popup"]);
    for (const ev of BLOCO_D) {
      assert.ok(eventoAvisoRestante(ev) && EVENTOS_POR_GRUPO.vagas.includes(ev) && ROTULO_EVENTO[ev] && NOTA_EVENTO[ev], ev);
      assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(canalSemListaPermitido(ev, "popup"), true); assert.equal(canalSoInterruptor(ev, "popup"), true); assert.equal(canalSoInterruptor(ev, "sino"), false);
      assert.equal(ligadoSemLinha(ev, "sino"), true); assert.equal(ligadoSemLinha(ev, "popup"), false, "sem linha = popup NÃO mostra");
      assert.match(descricaoPadraoDoSistema("vagas", "popup", ev), /ninguém vê o popup/); assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /Desligado: ninguém/);
    }
    assert.equal(canalSemListaPermitido("supervisao_cliente_atrasada", "email"), false); assert.equal(ligadoSemLinha("supervisao_cliente_atrasada", "email"), true); assert.match(descricaoPadraoDoSistema("vagas", "email", "supervisao_cliente_atrasada"), /só o supervisor responsável/);
    assert.match(NOTA_EVENTO.conta_receber_hortolandia_atrasada, /nunca o valor/);
  });
  await caso("avisos restantes (D), resolvedor: sino e popup dos 3 eventos (sem linha/erro, desligado, lista); e-mail da supervisão legado/lista/desligado", async () => {
    for (const ev of BLOCO_D) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado", ev);
      assert.equal((await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino")).modo, "legado", ev);
      assert.equal((await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "sino")).falhou, true, ev);
      assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("g1")] } }), ev, "sino")).userIds, ["g1"], ev);
    }
    const ev = "supervisao_cliente_atrasada";
    assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [] }, perfis: [] }), ev, "email", null)).modo, "legado");
    assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("g@x.com")] } }), ev, "email", null)).emails.map((e) => e.email), ["g@x.com"]);
    assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("g@x.com")] } }), ev, "email", null)).modo, "desligado");
  });
  await caso("avisos restantes (D), textos: os de sempre; a gestão recebe o nome do vendedor; faturamento sem valor", () => {
    assert.deepEqual(textoLembreteComercial({ quantidade: 1 }), { titulo: "Hora de retomar contato", mensagem: "Você tem 1 empresa esperando seu retorno." });
    assert.equal(textoLembreteComercial({ quantidade: 3 }).mensagem, "Você tem 3 empresas esperando seu retorno."); assert.ok(textoLembreteComercial({ quantidade: 2 }).mensagem.startsWith(PREFIXO_MENSAGEM_VENDEDOR));
    assert.deepEqual(textoLembreteComercialGestao({ vendedor: "Rebecca Zambonini", quantidade: 2 }), { titulo: "Equipe comercial: retomar contato", mensagem: "Rebecca Zambonini tem 2 empresas esperando retorno." });
    assert.ok(!textoLembreteComercialGestao({ vendedor: "R", quantidade: 1 }).mensagem.startsWith(PREFIXO_MENSAGEM_VENDEDOR), "a mensagem da gestão não é confundida com a do vendedor"); assert.equal(textoLembreteComercialGestao({ quantidade: 1 }).mensagem, "Um vendedor tem 1 empresa esperando retorno.");
    assert.deepEqual(textoSupervisaoAtrasada({ cliente: "Maxsoy", dias: 12 }), { titulo: "🔴 Supervisão pendente — Maxsoy", mensagem: "Maxsoy — atrasado há 12 dias." });
    assert.equal(textoSupervisaoAtrasada({ cliente: "Maxsoy", dias: 1 }).mensagem, "Maxsoy — atrasado há 1 dia."); assert.equal(textoSupervisaoAtrasada({ cliente: "Maxsoy", dias: null }).mensagem, "Maxsoy — sem registro.");
    const t = textoContaReceberAtrasada({ unidade: "Hortolândia", diasAtraso: 4, cliente: "Maxsoy", numeroNf: "1234", vencimentoISO: "2026-10-16", valor: 98765.43 } as never);
    assert.deepEqual(t, { titulo: "🔴 Faturamento Hortolândia atrasado há 4 dias", mensagem: "Maxsoy — NF 1234 — vencida em 16/10/2026, ainda não paga." });
    assert.equal(textoContaReceberAtrasada({ unidade: "SBC", diasAtraso: 1, cliente: "X", vencimentoISO: "2026-10-16" }).mensagem, "X — vencida em 16/10/2026, ainda não paga."); assert.ok(!JSON.stringify(t).includes("98765"), "o valor não entra");
  });
  await caso("avisos restantes (D), restauração do grupo vagas: sino/popup dos 3 com permite_vazio; e-mail da supervisão com a lista de vaga_cancelada", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    for (const ev of BLOCO_D) {
      const e = r.payload.eventos.find((x) => x.evento === ev)!;
      for (const c of e.canais.filter((x) => x.canal !== "email")) { assert.equal(c.permite_vazio, true, `${ev}/${c.canal}`); assert.equal(c.destinatarios.length, 0); assert.equal(c.ativo, true); }
    }
    assert.equal(r.payload.eventos.find((x) => x.evento === "supervisao_cliente_atrasada")!.canais.find((c) => c.canal === "email")!.destinatarios.length, 3);
    assert.ok(!montarPayloadRestauracao("vagas", new Set()).semDestinatario.some((x) => BLOCO_D.includes(x.evento) && x.canal !== "email"));
  });

  // ── Avisos restantes: bloco E (taxa de R&S não configurada) ──
  await caso("avisos restantes (E): fee_rs_nao_configurado no grupo vagas (só sino), rótulo, nota e padrão; tipo de gravação de sempre", () => {
    const ev = "fee_rs_nao_configurado";
    assert.equal(EVENTO_FEE_RS_NAO_CONFIGURADO, ev); assert.equal(TIPO_FEE_RS_NAO_CONFIGURADO, "fee_rs_nao_configurado");
    assert.ok(eventoAvisoRestante(ev) && EVENTOS_POR_GRUPO.vagas.includes(ev) && ROTULO_EVENTO[ev] && NOTA_EVENTO[ev]); assert.deepEqual([...canaisDoEvento(ev)], ["sino"]);
    assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(ligadoSemLinha(ev, "sino"), true); assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /aviso geral para a equipe da unidade/);
    assert.match(NOTA_EVENTO[ev], /Só avisa/); assert.match(NOTA_EVENTO[ev], /24 horas/); assert.ok(!/R\$|valor|decisor/i.test(NOTA_EVENTO[ev]) || /não é calculado/.test(NOTA_EVENTO[ev]));
  });
  await caso("avisos restantes (E), resolvedor do sino: sem linha/erro = ligado, ativo=false desliga, lista entra por cima", async () => {
    const ev = "fee_rs_nao_configurado";
    assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado");
    assert.equal((await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino")).modo, "legado");
    assert.equal((await resolverComFonte(fonte({ novoErro: true, antigo: null }), ev, "sino")).falhou, true);
    assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("g1"), usuario("g2")] } }), ev, "sino")).userIds, ["g1", "g2"]);
  });
  await caso("avisos restantes (E), restauração do grupo vagas: sino com permite_vazio", () => {
    const e = montarPayloadRestauracao("vagas", TODOS).payload.eventos.find((x) => x.evento === "fee_rs_nao_configurado")!;
    assert.deepEqual(e.canais.map((c) => c.canal), ["sino"]); assert.equal(e.canais[0].permite_vazio, true); assert.equal(e.canais[0].ativo, true); assert.equal(e.canais[0].destinatarios.length, 0);
  });

  // ── Avisos restantes: bloco F (aniversários de contatos de clientes) ──
  const BLOCO_F = ["aniversario_mes_seguinte", "aniversario_tres_dias", "aniversario_no_dia"];
  await caso("avisos restantes (F): 3 eventos no grupo vagas com os canais certos; tipos de gravação de sempre", () => {
    assert.deepEqual([EVENTO_ANIVERSARIO_MES_SEGUINTE, EVENTO_ANIVERSARIO_TRES_DIAS, EVENTO_ANIVERSARIO_NO_DIA], BLOCO_F);
    assert.deepEqual([TIPO_ANIVERSARIO_MES_SEGUINTE, TIPO_ANIVERSARIO_TRES_DIAS, TIPO_ANIVERSARIO_NO_DIA], BLOCO_F);
    assert.deepEqual([...canaisDoEvento("aniversario_mes_seguinte")], ["email"]); assert.deepEqual([...canaisDoEvento("aniversario_tres_dias")], ["sino", "email"]); assert.deepEqual([...canaisDoEvento("aniversario_no_dia")], ["sino", "email", "popup"]);
    for (const ev of BLOCO_F) { assert.ok(eventoAvisoRestante(ev) && EVENTOS_POR_GRUPO.vagas.includes(ev) && ROTULO_EVENTO[ev] && NOTA_EVENTO[ev], ev); assert.equal(canalSemListaPermitido(ev, "email"), false); assert.equal(ligadoSemLinha(ev, "email"), true); assert.match(descricaoPadraoDoSistema("vagas", "email", ev), /como sempre/); }
    for (const ev of ["aniversario_tres_dias", "aniversario_no_dia"]) { assert.equal(canalSemListaPermitido(ev, "sino"), true); assert.equal(ligadoSemLinha(ev, "sino"), true); assert.match(descricaoPadraoDoSistema("vagas", "sino", ev), /aviso geral para a equipe da unidade/); }
    assert.equal(canalSoInterruptor("aniversario_no_dia", "popup"), true); assert.equal(ligadoSemLinha("aniversario_no_dia", "popup"), false); assert.match(descricaoPadraoDoSistema("vagas", "popup", "aniversario_no_dia"), /ninguém vê o popup/);
    assert.match(NOTA_EVENTO.aniversario_no_dia, /e-mail e o telefone do contato/); assert.match(NOTA_EVENTO.aniversario_mes_seguinte, /tentado de novo/);
    assert.equal(DIAS_ANTECEDENCIA_ANIVERSARIO, 3); assert.equal(DIAS_RECUPERACAO_ANIVERSARIO, 2);
  });
  await caso("avisos restantes (F), janela: 'faltam 1 a 3 dias' e 'no dia + até 2 dias depois', no fuso de Brasília, com o ano da ocorrência para o dedup", () => {
    const sit = (nasc: string, hoje: string) => situacaoAniversario(nasc, hoje);
    assert.deepEqual(sit("1990-10-23", "2026-10-20"), { tresDias: { dias: 3, ano: 2026 }, noDia: null }, "faltam 3 = o dia de sempre");
    assert.deepEqual(sit("1990-10-22", "2026-10-20"), { tresDias: { dias: 2, ano: 2026 }, noDia: null }); assert.deepEqual(sit("1990-10-21", "2026-10-20"), { tresDias: { dias: 1, ano: 2026 }, noDia: null });
    assert.deepEqual(sit("1990-10-24", "2026-10-20"), { tresDias: null, noDia: null }, "faltam 4: ainda não");
    assert.deepEqual(sit("1990-10-20", "2026-10-20"), { tresDias: null, noDia: { atraso: 0, ano: 2026 } }); assert.deepEqual(sit("1990-10-19", "2026-10-20"), { tresDias: null, noDia: { atraso: 1, ano: 2026 } }); assert.deepEqual(sit("1990-10-18", "2026-10-20"), { tresDias: null, noDia: { atraso: 2, ano: 2026 } });
    assert.deepEqual(sit("1990-10-17", "2026-10-20"), { tresDias: null, noDia: null }, "3 dias depois: passou da recuperação");
    assert.deepEqual(sit("1990-01-02", "2026-12-30"), { tresDias: { dias: 3, ano: 2027 }, noDia: null }, "virada de ano: o aniversário de 02/01 cai em 2027");
    assert.deepEqual(sit("1990-01-01", "2027-01-01"), { tresDias: null, noDia: { atraso: 0, ano: 2027 } }); assert.deepEqual(sit("1990-12-31", "2027-01-01"), { tresDias: null, noDia: { atraso: 1, ano: 2026 } }, "recuperação cruzando o ano: o aniversário foi em 2026");
    assert.deepEqual(sit("1990-01-03", "2027-01-01"), { tresDias: { dias: 2, ano: 2027 }, noDia: null });
    assert.deepEqual(sit("1992-02-29", "2027-02-26"), { tresDias: { dias: 3, ano: 2027 }, noDia: null }, "29/02 em ano comum: o 'faltam' usa 01/03, como sempre");
    assert.deepEqual(sit("1992-02-29", "2027-03-01"), { tresDias: null, noDia: null }, "29/02 em ano comum: nunca há aviso 'no dia', como sempre");
    assert.deepEqual(sit("1992-02-29", "2028-02-29"), { tresDias: null, noDia: { atraso: 0, ano: 2028 } }, "29/02 em ano bissexto: no dia");
    assert.deepEqual(sit("1990-03-15", "2026-10-20"), { tresDias: null, noDia: null });
  });
  await caso("avisos restantes (F), textos: com 3 dias e no dia são EXATAMENTE os de sempre; recuperação fala da data/dias que faltam (nunca 'hoje')", () => {
    const t3 = textoAniversarioTresDias({ nome: "Maria Souza", empresa: "Maxsoy", dataFmt: "23/10", dias: 3 });
    assert.deepEqual(t3, { titulo: "🎂 Faltam 3 dias — aniversário de Maria Souza", mensagem: "Maria Souza (Maxsoy) faz aniversário em 3 dias, dia 23/10.", assunto: "🎂 Faltam 3 dias — aniversário de Maria Souza (Maxsoy)", tituloEmail: "🎂 Faltam 3 dias!" });
    const t1 = textoAniversarioTresDias({ nome: "Maria Souza", empresa: "Maxsoy", dataFmt: "21/10", dias: 1 }); assert.match(t1.titulo, /Faltam 1 dia —/); assert.match(t1.mensagem, /em 1 dia, dia 21\/10/); assert.equal(t1.tituloEmail, "🎂 Faltam 1 dia!");
    const n0 = textoAniversarioNoDia({ nome: "Maria Souza", empresa: "Maxsoy", dataFmt: "20/10", atraso: 0 });
    assert.deepEqual(n0, { titulo: "🎂 Hoje é aniversário de Maria Souza!", mensagem: "Hoje é o aniversário de Maria Souza (Maxsoy).", assunto: "🎂 Hoje é aniversário de Maria Souza (Maxsoy)!", tituloEmail: "🎂 Hoje é aniversário de Maria Souza!" });
    for (const atraso of [1, 2]) { const n = textoAniversarioNoDia({ nome: "Maria Souza", empresa: "Maxsoy", dataFmt: "18/10", atraso }); assert.ok(!/hoje/i.test(JSON.stringify(n)), String(atraso)); assert.ok(n.mensagem.includes("18/10") && n.titulo.includes("18/10") && n.assunto.includes("18/10")); }
  });
  await caso("avisos restantes (F), resolvedor: sino/popup dos aniversários (sem linha/erro, desligado, lista) e e-mail (legado, lista, desligado)", async () => {
    for (const ev of ["aniversario_tres_dias", "aniversario_no_dia"]) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [usuario("u1")] } }), ev, "sino")).modo, "desligado", ev);
      assert.equal((await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "sino")).modo, "legado", ev);
      assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [usuario("g1")] } }), ev, "sino")).userIds, ["g1"], ev);
    }
    for (const ev of BLOCO_F) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [] }, perfis: [] }), ev, "email", "MM")).modo, "legado", ev);
      assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("g@x.com")] } }), ev, "email", null)).emails.map((e) => e.email), ["g@x.com"], ev);
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("g@x.com")] } }), ev, "email", null)).modo, "desligado", ev);
    }
  });
  await caso("avisos restantes (F), restauração do grupo vagas: sino/popup com permite_vazio; e-mail dos 3 com a lista de vaga_cancelada", () => {
    const r = montarPayloadRestauracao("vagas", TODOS);
    for (const ev of BLOCO_F) {
      const e = r.payload.eventos.find((x) => x.evento === ev)!;
      assert.equal(e.canais.find((c) => c.canal === "email")!.destinatarios.length, 3, ev);
      for (const c of e.canais.filter((x) => x.canal !== "email")) { assert.equal(c.permite_vazio, true, `${ev}/${c.canal}`); assert.equal(c.destinatarios.length, 0); }
    }
    assert.ok(!montarPayloadRestauracao("vagas", new Set()).semDestinatario.some((x) => BLOCO_F.includes(x.evento) && x.canal !== "email"));
  });

  // ── Cobrança R&S ──
  await caso("cobrança R&S: eventos e tipos de e-mail/sino (os tipos gravados NÃO mudam)", () => {
    assert.deepEqual([...EVENTOS_COBRANCA_RS], ["cobranca_rs_gerada", "cobranca_rs_validada", "cobranca_rs_paga", "cobranca_rs_cancelada", "cobranca_rs_atrasada", "cobranca_rs_pendente_revisao", "cobranca_rs_aguardando_validacao"]);
    assert.equal(EVENTOS_COBRANCA_RS.length, 7); assert.equal(EVENTO_COBRANCA_RS_PENDENTE_REVISAO, "cobranca_rs_pendente_revisao"); assert.equal(EVENTO_COBRANCA_RS_AGUARDANDO_VALIDACAO, "cobranca_rs_aguardando_validacao");
    assert.equal(TIPO_COBRANCA_PENDENTE_REVISAO, "cobranca_rs_pendente_revisao"); assert.equal(TIPO_COBRANCA_AGUARDANDO_VALIDACAO, "cobranca_rs_aguardando_validacao");
    assert.equal(DIAS_ESPERA_VALIDACAO, 2); assert.equal(DIAS_COOLDOWN_VALIDACAO, 2);
    assert.equal(EVENTO_COBRANCA_RS_GERADA, "cobranca_rs_gerada"); assert.equal(EVENTO_COBRANCA_RS_VALIDADA, "cobranca_rs_validada"); assert.equal(EVENTO_COBRANCA_RS_PAGA, "cobranca_rs_paga");
    assert.equal(EVENTO_COBRANCA_RS_CANCELADA, "cobranca_rs_cancelada"); assert.equal(EVENTO_COBRANCA_RS_ATRASADA, "cobranca_rs_atrasada");
    assert.equal(TIPO_EMAIL_COBRANCA_GERADA, "cobranca_rs_gerada"); assert.equal(TIPO_EMAIL_COBRANCA_VALIDADA, "cobranca_rs_validada_diretoria");
    assert.equal(TIPO_EMAIL_COBRANCA_PAGA, "cobranca_rs_paga"); assert.equal(TIPO_EMAIL_COBRANCA_CANCELADA, "cobranca_rs_cancelada"); assert.equal(TIPO_COBRANCA_ATRASADA, "cobranca_rs_atrasada");
    for (const ev of EVENTOS_COBRANCA_RS) assert.ok(ev.length <= 80 && /^[a-z0-9_]+$/.test(ev), ev);
    assert.equal(DIAS_COOLDOWN_ATRASO_COBRANCA, 2);
  });
  await caso("cobrança R&S, datas em Brasília: 23:59 de Brasília ainda é o dia anterior em UTC; corte do cooldown é o instante exato de 2 dias", () => {
    assert.equal(dataBrasiliaCobranca(new Date("2026-10-20T09:00:00Z")), "2026-10-20");
    assert.equal(dataBrasiliaCobranca(new Date("2026-10-21T02:59:00Z")), "2026-10-20", "23:59 em Brasília");
    assert.equal(dataBrasiliaCobranca(new Date("2026-10-21T03:00:00Z")), "2026-10-21");
    assert.equal(inicioDiaBrasilia(new Date("2026-10-21T02:59:00Z")), "2026-10-20T00:00:00-03:00");
    assert.equal(corteLembreteAtraso(new Date("2026-10-20T09:00:00Z")), "2026-10-18T09:00:00.000Z");
  });
  await caso("cobrança R&S: dias de atraso por data de calendário em Brasília (igual à conta antiga na hora do cron, correto fora dela)", () => {
    assert.equal(diasDeAtraso("2026-10-16", "2026-10-20"), 4); assert.equal(diasDeAtraso("2026-10-19", "2026-10-20"), 1); assert.equal(diasDeAtraso("2026-09-30", "2026-10-01"), 1);
    assert.equal(diasDeAtraso("2026-12-31", "2027-01-02"), 2, "virada de ano");
    const antiga = (venc: string, agora: Date) => Math.floor((agora.getTime() - new Date(venc + "T00:00:00Z").getTime()) / 86400000); // servidor em UTC
    for (const venc of ["2026-10-16", "2026-10-19", "2026-10-01", "2026-09-30", "2026-12-31"]) {
      for (const hora of ["2026-10-20T09:00:00Z", "2026-11-03T09:00:00Z", "2027-01-02T09:00:00Z"]) {
        const agora = new Date(hora);
        if (venc >= dataBrasiliaCobranca(agora)) continue;
        assert.equal(diasDeAtraso(venc, dataBrasiliaCobranca(agora)), antiga(venc, agora), `${venc} em ${hora}`);
      }
    }
    // Às 22:00 de Brasília (01:00 UTC do dia seguinte) a conta antiga em UTC já contava um dia a mais; a nova segue o calendário de Brasília.
    const tarde = new Date("2026-10-21T01:00:00Z");
    assert.equal(antiga("2026-10-16", tarde), 5); assert.equal(diasDeAtraso("2026-10-16", dataBrasiliaCobranca(tarde)), 4);
  });
  await caso("cobrança R&S: texto do sino do atraso é o de sempre e não traz fee, valor, CNPJ nem dado bancário", () => {
    const t = textoSinoAtrasoCobranca({ diasAtraso: 4, cliente: "Maxsoy", vaga: "Operador", vencimentoISO: "2026-10-16" });
    assert.equal(t.titulo, "🔴 Cobrança R&S atrasada há 4 dias"); assert.equal(t.mensagem, "Maxsoy — Operador — vencida em 16/10/2026, ainda não paga.");
    assert.equal(textoSinoAtrasoCobranca({ diasAtraso: 1, cliente: "C", vaga: "V", vencimentoISO: "2026-10-19" }).titulo, "🔴 Cobrança R&S atrasada há 1 dia");
    assert.ok(!/R\$|fee|cnpj|banco|agência|conta|\d{2}\.\d{3}\.\d{3}/i.test(t.titulo + t.mensagem));
  });

  // Dados simulados como os de hoje: toda a diretoria/superuser é exatamente os 4 e-mails excluídos pelo código antigo; o único revisor com
  // acesso configurado é o Giovanni; mais analistas comuns, um sem e-mail e um sem login.
  const P = (user_id: string | null, email: string | null, nome: string, nivel: string): PerfilAnalistaCobranca & { id: string } => ({ id: `perfil-${nome}`, user_id, email, nome_completo: nome, nivel_acesso: nivel });
  const PERFIS_ATUAIS = [
    P("u-eliz", "consultoria@salmazos.com.br", "Elizabete Salmazo", "diretoria"), P("u-andr", "rh@salmazos.com.br", "Andreza Salmazo", "diretoria"),
    P("u-luca", "comercial@salmazos.com.br", "Lucas Miguel", "diretoria"), P("u-olve", "olver@salmazos.com.br", "Olver Pereira", "superuser"),
    P("u-giov", "vagas@salmazos.com.br", "Giovanni Prado", "analista"), P("u-rebe", "curriculos@salmazos.com.br", "Rebecca Zambonini", "analista"),
    P("u-edi", "edivan@salmazos.com.br", "Edivan Souza", "analista"), P("u-sup", "supervisor@salmazos.com.br", "Supervisor Silva", "supervisor"),
    P("u-sememail", null, "Sem E-mail", "analista"), P(null, "semlogin@salmazos.com.br", "Sem Login", "analista"),
  ];
  // Cópia FIEL de obterDestinatariosCobrancaRS (src/lib/cobrancaRS.ts) com o que o marcar-paga antigo passava: os 4 e-mails excluídos e sempreIncluirRevisor=true.
  const ANTIGO_EXCLUIDOS = ["consultoria@salmazos.com.br", "rh@salmazos.com.br", "comercial@salmazos.com.br", "olver@salmazos.com.br"];
  function destinatariosPagaCodigoAntigo(analistas: ReturnType<typeof P>[], acessoIds: Set<string>, revisadoPor: string | null) {
    const excluirSet = new Set(ANTIGO_EXCLUIDOS.map((e) => e.toLowerCase())); const out = new Map<string, { user_id: string; email: string; nome_completo: string }>();
    for (const a of analistas) {
      if (!a.user_id || !a.email) continue;
      if (excluirSet.has(a.email.toLowerCase())) continue;
      const ehFullAccess = a.nivel_acesso === "diretoria" || a.nivel_acesso === "superuser";
      const ehRevisor = revisadoPor != null && a.user_id === revisadoPor;
      if (ehFullAccess || (ehRevisor && acessoIds.has(a.id)) || (ehRevisor && true)) out.set(a.user_id, { user_id: a.user_id, email: a.email, nome_completo: a.nome_completo ?? "" });
    }
    return [...out.values()];
  }
  await caso("cobrança R&S, marcar paga: a regra nova dá EXATAMENTE os mesmos destinatários do código antigo com os dados atuais, para cada revisor possível", () => {
    const acesso = new Set(["perfil-Giovanni Prado"]);
    const revisores: (string | null)[] = [null, "u-inexistente", ...PERFIS_ATUAIS.map((p) => p.user_id)];
    for (const rev of revisores) {
      const antigo = destinatariosPagaCodigoAntigo(PERFIS_ATUAIS, acesso, rev), novo = destinatariosPagaLegado(PERFIS_ATUAIS, rev);
      assert.deepEqual(novo.map((d) => d.email).sort(), antigo.map((d) => d.email).sort(), `revisor=${rev}`);
      assert.deepEqual(novo.map((d) => d.user_id).sort(), antigo.map((d) => d.user_id).sort(), `revisor=${rev}`);
    }
    assert.deepEqual(destinatariosPagaLegado(PERFIS_ATUAIS, "u-giov").map((d) => d.email), ["vagas@salmazos.com.br"], "Giovanni revisou: só ele");
    assert.deepEqual(destinatariosPagaLegado(PERFIS_ATUAIS, "u-rebe").map((d) => d.email), ["curriculos@salmazos.com.br"], "revisor sem acesso configurado ainda recebe (sempre incluir revisor)");
  });
  await caso("cobrança R&S, marcar paga: revisor da diretoria/superuser, sem revisor, sem e-mail ou sem login = ninguém; NÃO é 'todos os revisores com acesso'", () => {
    for (const rev of ["u-eliz", "u-andr", "u-luca", "u-olve", null, "", "u-sememail"]) assert.deepEqual(destinatariosPagaLegado(PERFIS_ATUAIS, rev), [], String(rev));
    assert.deepEqual(destinatariosPagaLegado(PERFIS_ATUAIS, "u-edi").map((d) => d.email), ["edivan@salmazos.com.br"], "Giovanni (com acesso) NÃO entra quando o revisor é o Edivan");
    assert.deepEqual(destinatariosPagaLegado([], "u-giov"), []);
  });
  await caso("cobrança R&S, marcar paga: compara por nivel_acesso, não por e-mail (o único desvio do código antigo é uma pessoa da diretoria com e-mail fora da lista fixa)", () => {
    const nova = [...PERFIS_ATUAIS, P("u-dir2", "nova.diretora@salmazos.com.br", "Nova Diretora", "diretoria")];
    assert.deepEqual(destinatariosPagaLegado(nova, "u-dir2"), [], "regra nova: diretoria nunca recebe, qualquer que seja o e-mail");
    assert.equal(destinatariosPagaCodigoAntigo(nova, new Set(), "u-dir2").some((d) => d.user_id === "u-dir2"), true, "código antigo: o e-mail novo da diretoria escapava da exclusão fixa");
    const trocado = PERFIS_ATUAIS.map((p) => (p.user_id === "u-giov" ? { ...p, email: "OUTRO@salmazos.com.br" } : p));
    assert.deepEqual(destinatariosPagaLegado(trocado, "u-giov").map((d) => d.email), ["OUTRO@salmazos.com.br"]);
  });

  // ── Cobrança R&S: catálogo, padrão, restauração e migration ──
  const COBR = [...EVENTOS_COBRANCA_RS] as string[];
  const COBR5 = COBR.slice(0, 5); // os 5 da primeira rodada (migration_avisos_cobranca_rs.sql)
  const CANAIS_COBR: Record<string, string[]> = {
    cobranca_rs_gerada: ["email"], cobranca_rs_validada: ["email"], cobranca_rs_paga: ["email"], cobranca_rs_cancelada: ["email"], cobranca_rs_atrasada: ["email", "sino"],
    cobranca_rs_pendente_revisao: ["sino"], cobranca_rs_aguardando_validacao: ["email", "sino"],
  };
  await caso("cobrança R&S, catálogo: 7 eventos no grupo vagas, rótulo, nota e padrão em português para cada canal; os canais de cada um; NENHUM popup", () => {
    for (const ev of COBR) {
      assert.ok(eventoAvisoRestante(ev) && EVENTOS_POR_GRUPO.vagas.includes(ev) && grupoDoEvento(ev) === "vagas", ev); assert.ok(ROTULO_EVENTO[ev].length > 5 && NOTA_EVENTO[ev].length > 40, ev);
      assert.ok(!canaisDoEvento(ev).includes("popup"), ev); assert.deepEqual([...canaisDoEvento(ev)].sort(), [...CANAIS_COBR[ev]].sort(), ev);
      for (const c of canaisDoEvento(ev)) assert.ok((AVISOS_RESTANTES[ev].padrao as Record<string, string>)[c], `${ev}/${c}`);
    }
    assert.match(NOTA_EVENTO.cobranca_rs_paga, /Por padrão avisa o revisor da cobrança, sem diretoria/);
    assert.match(NOTA_EVENTO.cobranca_rs_pendente_revisao, /quem gerou/); assert.match(NOTA_EVENTO.cobranca_rs_pendente_revisao, /Não envia e-mail nem popup/);
    assert.match(NOTA_EVENTO.cobranca_rs_aguardando_validacao, /a cada 2 dias/); assert.match(NOTA_EVENTO.cobranca_rs_aguardando_validacao, /Não envia popup/);
    assert.equal(EVENTOS_POR_GRUPO.vagas.filter((e) => e.startsWith("cobranca_rs_")).length, 7);
    assert.deepEqual(EVENTOS_POR_GRUPO.portal_cliente.filter((e) => e.startsWith("cobranca_rs_")), []);
  });
  await caso("cobrança R&S, tela: sem linha, e-mail e sino ficam ligados (legado); popup nunca existe; sino pode ficar sem lista, e-mail não", () => {
    for (const ev of COBR) {
      for (const c of CANAIS_COBR[ev]) { assert.equal(ligadoSemLinha(ev, c), true, `${ev}/${c}`); assert.equal(canalSemListaPermitido(ev, c), c === "sino", `${ev}/${c}`); assert.equal(canalSoInterruptor(ev, c), false, `${ev}/${c}`); }
      assert.equal(ligadoSemLinha(ev, "popup"), false, ev);
    }
  });
  await caso("cobrança R&S, padrão: e-mail com lista curta (Andreza e Giovanni; aguardando validação: Elizabete, Andreza e Giovanni; validada e paga só o Giovanni, nunca diretoria na paga); sinos ligados e vazios; as 2 pendências sem popup; restauração com permite_vazio só no sino", () => {
    const p = PADRAO_AVISOS.vagas; const emails = (ev: string) => p[ev].email!.destinatarios.map((d) => (d.tipo_destinatario === "email" ? d.email : ""));
    for (const ev of ["cobranca_rs_gerada", "cobranca_rs_cancelada", "cobranca_rs_atrasada"]) assert.deepEqual(emails(ev), ["rh@salmazos.com.br", "vagas@salmazos.com.br"], ev);
    assert.deepEqual(emails("cobranca_rs_aguardando_validacao"), ["consultoria@salmazos.com.br", "rh@salmazos.com.br", "vagas@salmazos.com.br"]);
    for (const ev of ["cobranca_rs_validada", "cobranca_rs_paga"]) assert.deepEqual(emails(ev), ["vagas@salmazos.com.br"], ev);
    for (const ev of COBR) { assert.equal(p[ev].popup, undefined, ev); assert.equal(p[ev].email === undefined, !CANAIS_COBR[ev].includes("email"), ev); assert.equal(p[ev].sino === undefined, !CANAIS_COBR[ev].includes("sino"), ev); if (p[ev].email) assert.equal(p[ev].email!.ativo, true, ev); }
    for (const ev of ["cobranca_rs_atrasada", "cobranca_rs_pendente_revisao", "cobranca_rs_aguardando_validacao"]) assert.deepEqual(p[ev].sino, { ativo: true, destinatarios: [] }, ev);
    assert.deepEqual(Object.keys(p.cobranca_rs_pendente_revisao), ["sino"]);
    const r = montarPayloadRestauracao("vagas", TODOS);
    for (const ev of COBR) {
      const e = r.payload.eventos.find((x) => x.evento === ev)!; assert.deepEqual(e.canais.map((c) => c.canal).sort(), [...CANAIS_COBR[ev]].sort(), ev);
      for (const c of e.canais) { if (c.canal === "email") { assert.ok(c.destinatarios.length >= 1, ev); assert.equal(c.permite_vazio, undefined, ev); } else { assert.equal(c.permite_vazio, true, ev); assert.equal(c.destinatarios.length, 0, ev); } }
    }
    assert.ok(!r.semDestinatario.some((x) => COBR.includes(x.evento)));
  });
  await caso("cobrança R&S, resolvedor: e-mail ligado SEM lista = legado; com lista = só a lista; desligado = ninguém; sino sem linha/erro = ligado, ativo=false desliga, lista soma", async () => {
    for (const ev of COBR.filter((x) => CANAIS_COBR[x].includes("email"))) {
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [] }, perfis: [] }), ev, "email")).modo, "legado", ev);
      assert.deepEqual((await resolverComFonte(fonte({ novo: { canalAtivo: true, linhas: [email("a@x.com")] } }), ev, "email")).emails.map((e) => e.email), ["a@x.com"], ev);
      assert.equal((await resolverComFonte(fonte({ novo: { canalAtivo: false, linhas: [email("a@x.com")] } }), ev, "email")).modo, "desligado", ev);
      assert.equal((await resolverComFonte(fonte({ novo: null, antigo: { canalAtivo: null, linhas: [] } }), ev, "email")).modo, "legado", ev);
    }
    for (const ev of COBR.filter((x) => CANAIS_COBR[x].includes("sino"))) {
      const s = (c: Cenario) => resolverComFonte(fonte(c), ev, "sino");
      assert.equal((await s({ novo: null, antigo: { canalAtivo: null, linhas: [] } })).modo, "legado", ev); assert.equal((await s({ novoErro: true, antigo: { canalAtivo: null, linhas: [] } })).modo, "legado", ev);
      assert.equal((await s({ novo: { canalAtivo: false, linhas: [usuario("u1")] } })).modo, "desligado", ev); assert.deepEqual((await s({ novo: { canalAtivo: true, linhas: [usuario("g1")] } })).userIds, ["g1"], ev);
    }
    assert.deepEqual(unirUserIds(["u-eliz", "u-giov"], ["u-giov", "u-edi"]), ["u-eliz", "u-giov", "u-edi"], "lista sem duplicar quem já recebe");
  });
  await caso("cobrança R&S, carimbo do atraso: grava se algo foi entregue ou se tudo está desligado; não grava se o que está ligado falhou ou não tinha a quem avisar", () => {
    assert.equal(deveCarimbarAviso(["enviado", "falhou"]), true); assert.equal(deveCarimbarAviso(["falhou", "enviado"]), true); assert.equal(deveCarimbarAviso(["desligado", "enviado"]), true);
    assert.equal(deveCarimbarAviso(["desligado", "desligado"]), true); assert.equal(deveCarimbarAviso(["falhou", "falhou"]), false); assert.equal(deveCarimbarAviso(["sem_destinatario", "sem_destinatario"]), false);
    assert.equal(deveCarimbarAviso(["desligado", "falhou"]), false); assert.equal(deveCarimbarAviso(["desligado", "sem_destinatario"]), false); assert.equal(deveCarimbarAviso(["sem_destinatario", "falhou"]), false);
  });
  await caso("cobrança R&S, migration (1ª rodada): 5 eventos no grupo vagas e 6 canais, iguais ao catálogo; só inserts com on conflict do nothing; sem DDL", () => {
    const sql = readFileSync(new URL("../supabase/migration_avisos_cobranca_rs.sql", import.meta.url), "utf8");
    const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    assert.ok(!/\b(alter|create|drop|trigger|policy|constraint|update|delete|grant|function)\b/i.test(codigo), "só inserts");
    assert.equal((codigo.match(/on conflict/gi) ?? []).length, 2); assert.equal((codigo.match(/\binsert into\b/gi) ?? []).length, 2);
    assert.ok(!/cobrancas_rs\b/.test(codigo.replace(/'cobranca_rs_[a-z]+'/g, "")), "nenhuma alteração em cobrancas_rs");
    const eventos = [...codigo.matchAll(/\('(cobranca_rs_[a-z]+)', 'vagas',/g)].map((m) => m[1]).sort(); assert.deepEqual(eventos, [...COBR5].sort());
    for (const ev of COBR5) { const m = codigo.match(new RegExp(`\\('${ev}', 'vagas',\\s*'[^']+',\\s*array\\[([^\\]]+)\\]`)); assert.ok(m, ev); assert.deepEqual(m![1].split(",").map((x) => x.trim().replace(/'/g, "")).sort(), [...canaisDoEvento(ev)].sort(), ev); }
    const canais = [...codigo.matchAll(/\('(cobranca_rs_[a-z]+)', '(email|sino|popup)', true\)/g)].map((m) => `${m[1]}/${m[2]}`).sort();
    assert.deepEqual(canais, COBR5.flatMap((ev) => [...canaisDoEvento(ev)].map((c) => `${ev}/${c}`)).sort()); assert.equal(canais.length, 6);
    assert.ok(!/aviso_destinatarios\b/.test(codigo), "0 destinatários");
  });

  // ── Cobrança R&S: pendências (rascunho recém-criado e "Aguardando validação") ──
  await caso("pendências: limites por data em Brasília (2 dias), sem depender de segundos entre execuções do cron", () => {
    assert.equal(somarDiasISOCobranca("2026-10-07", -1), "2026-10-06"); assert.equal(somarDiasISOCobranca("2026-10-01", -1), "2026-09-30");
    assert.equal(limiteDiasBrasilia("2026-10-07", 2), "2026-10-06T03:00:00.000Z", "início de 06/10 em Brasília");
    assert.equal(limiteEnvioValidacao("2026-10-07"), "2026-10-06T03:00:00.000Z"); assert.equal(limiteCooldownValidacao("2026-10-07"), "2026-10-06T03:00:00.000Z");
    // Enviada em 05/10 13:27 (16:27Z): ainda não passou 2 dias em 06/10, passa em 07/10 (por data).
    const enviada = "2026-10-05T16:27:00.000Z"; assert.equal(enviada < limiteEnvioValidacao("2026-10-06"), false); assert.equal(enviada < limiteEnvioValidacao("2026-10-07"), true);
    // Carimbo às 09:00:03Z de 08/09; o cron de 10/09 roda às 09:00:01Z: o lembrete volta no dia 10 (e não só no 11).
    const carimbo = "2026-09-08T09:00:03.000Z"; assert.equal(carimbo < limiteCooldownValidacao("2026-09-09"), false); assert.equal(carimbo < limiteCooldownValidacao("2026-09-10"), true);
    assert.equal(limiteDiasBrasilia("2026-10-07", 1), "2026-10-07T03:00:00.000Z");
  });
  await caso("pendências: dias parado desde o envio (Brasília) e erro de coluna ausente só para 42703 ou a coluna citada", () => {
    assert.equal(diasParadoDesde("2026-09-08T13:23:00.000Z", "2026-10-06"), 28); assert.equal(diasParadoDesde("2026-10-05T16:27:00.000Z", "2026-10-07"), 2);
    assert.equal(diasParadoDesde("2026-10-06T02:30:00.000Z", "2026-10-06"), 1, "23:30 de 05/10 em Brasília");
    assert.equal(ehErroColunaLembreteValidacao({ code: "42703", message: "column does not exist" }), true);
    assert.equal(ehErroColunaLembreteValidacao({ code: "PGRST200", message: "column cobrancas_rs.ultimo_lembrete_validacao_em does not exist" }), true);
    for (const e of [{ code: "42P01", message: "relation x does not exist" }, { code: "PGRST301", message: "JWT expired" }, { code: "23505", message: "duplicate key" }, { message: "timeout" }, null, undefined]) assert.equal(ehErroColunaLembreteValidacao(e as any), false, JSON.stringify(e));
  });
  await caso("pendências: textos do sino sem valor, fee, CNPJ nem salário (contratação com candidato; cancelamento com 'taxa de cancelamento')", () => {
    const c = textoSinoPendenteRevisao({ tipo: "contratacao", cliente: "Columbia", vaga: "Operador", candidato: "Maria" });
    assert.equal(c.titulo, "🟡 Cobrança R&S pendente de revisão"); assert.equal(c.mensagem, "Columbia — Operador — candidato Maria: rascunho aguardando revisão.");
    const k = textoSinoPendenteRevisao({ tipo: "cancelamento", cliente: "Columbia", vaga: "Operador", candidato: null });
    assert.equal(k.mensagem, "Columbia — Operador — taxa de cancelamento: rascunho aguardando revisão."); assert.ok(!/candidato/.test(k.mensagem));
    const v = textoSinoAguardandoValidacao({ dias: 4, tipo: "contratacao", cliente: "Columbia", vaga: "Operador", candidato: "Maria" });
    assert.equal(v.titulo, "🟠 Cobrança R&S aguardando validação há 4 dias"); assert.equal(v.mensagem, "Columbia — Operador — candidato Maria: enviada para validação e ainda sem vencimento definido.");
    assert.equal(textoSinoAguardandoValidacao({ dias: 1, tipo: "cancelamento", cliente: "C", vaga: "V" }).titulo, "🟠 Cobrança R&S aguardando validação há 1 dia");
    for (const t of [c, k, v]) assert.ok(!/R\$|fee|cnpj|salário|salario|\d{2}\.\d{3}\.\d{3}|\d+,\d{2}/i.test(t.titulo + t.mensagem), t.mensagem);
  });
  const perf = (id: string, user_id: string | null, nome: string, nivel: string, email: string | null): PerfilComAcessoCobranca => ({ id, user_id, email, nome_completo: nome, nivel_acesso: nivel });
  const PERFIS_P = [perf("p1", "u-eliz", "Elizabete", "diretoria", "consultoria@x.com"), perf("p2", "u-andr", "Andreza", "diretoria", "rh@x.com"), perf("p3", "u-luca", "Lucas", "diretoria", "comercial@x.com"), perf("p4", "u-olve", "Olver", "superuser", "olver@x.com"),
    perf("p5", "u-giov", "Giovanni", "analista", "vagas@x.com"), perf("p6", "u-rebe", "Rebecca", "analista", "curriculos@x.com"), perf("p7", "u-edi", "Edivan", "analista", "edi@x.com"), perf("p8", null, "Sem login", "diretoria", "a@x.com"), perf("p9", "u-sem", "Sem e-mail", "diretoria", null)];
  const ACESSO_P = new Set(["p5"]);
  await caso("pendências, rascunho: diretoria/superuser + acesso configurado, EXCETO o gerador; gerador nulo não exclui ninguém; sem login/e-mail fora", () => {
    const ids = (o: any) => destinatariosComAcessoCobranca(PERFIS_P, ACESSO_P, o).map((d) => d.user_id).sort();
    assert.deepEqual(ids({}), ["u-andr", "u-eliz", "u-giov", "u-luca", "u-olve"]);
    assert.deepEqual(ids({ excluirUserId: null }), ["u-andr", "u-eliz", "u-giov", "u-luca", "u-olve"], "cancelamento: gerador nulo");
    assert.deepEqual(ids({ excluirUserId: "u-rebe" }), ["u-andr", "u-eliz", "u-giov", "u-luca", "u-olve"], "gerador sem acesso: nada a excluir");
    assert.deepEqual(ids({ excluirUserId: "u-giov" }), ["u-andr", "u-eliz", "u-luca", "u-olve"], "o gerador com acesso é excluído");
    assert.deepEqual(ids({ excluirUserId: "u-andr" }), ["u-eliz", "u-giov", "u-luca", "u-olve"], "o gerador da diretoria é excluído");
    assert.deepEqual(destinatariosComAcessoCobranca([], ACESSO_P, {}), []);
  });
  await caso("pendências, aguardando validação: as mesmas pessoas que podem definir o vencimento (podeRevisarCobranca) = acesso amplo + o gerador daquela cobrança", () => {
    const ids = (o: any) => destinatariosComAcessoCobranca(PERFIS_P, ACESSO_P, o).map((d) => d.user_id).sort();
    assert.deepEqual(ids({ incluirUserId: "u-rebe" }), ["u-andr", "u-eliz", "u-giov", "u-luca", "u-olve", "u-rebe"]);
    assert.deepEqual(ids({ incluirUserId: null }), ["u-andr", "u-eliz", "u-giov", "u-luca", "u-olve"], "sem gerador: só o acesso amplo");
    assert.deepEqual(ids({ incluirUserId: "u-giov" }), ["u-andr", "u-eliz", "u-giov", "u-luca", "u-olve"], "sem duplicar quem já tem acesso");
    assert.equal(destinatariosComAcessoCobranca(PERFIS_P, ACESSO_P, { incluirUserId: "u-rebe" }).find((d) => d.user_id === "u-rebe")!.email, "curriculos@x.com");
  });
  await caso("pendências, migration: só add column if not exists + inserts (2 eventos, 3 canais, on conflict do nothing); 1 coluna nullable sem default e sem índice; 0 destinatários", () => {
    const sql = readFileSync(new URL("../supabase/migration_avisos_cobranca_pendencias.sql", import.meta.url), "utf8");
    const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    const comandos = codigo.split(";").map((c) => c.trim()).filter(Boolean); assert.equal(comandos.length, 3);
    assert.match(comandos[0], /^alter table public\.cobrancas_rs add column if not exists ultimo_lembrete_validacao_em timestamptz$/i);
    assert.ok(!/default|not null|index|unique|references/i.test(comandos[0]), "nullable, sem default, sem índice");
    assert.ok(!/\b(drop|create|truncate|update|delete|grant|function|trigger|policy|constraint)\b/i.test(codigo), "nenhuma outra mudança");
    assert.equal((codigo.match(/\balter table\b/gi) ?? []).length, 1); assert.equal((codigo.match(/\binsert into\b/gi) ?? []).length, 2); assert.equal((codigo.match(/on conflict/gi) ?? []).length, 2);
    const eventos = [...codigo.matchAll(/\('(cobranca_rs_[a-z_]+)', 'vagas',/g)].map((m) => m[1]).sort(); assert.deepEqual(eventos, ["cobranca_rs_aguardando_validacao", "cobranca_rs_pendente_revisao"]);
    for (const ev of eventos) { const m = codigo.match(new RegExp(`\\('${ev}', 'vagas',\\s*'[^']+',\\s*array\\[([^\\]]+)\\]`)); assert.ok(m, ev); assert.deepEqual(m![1].split(",").map((x) => x.trim().replace(/'/g, "")).sort(), [...canaisDoEvento(ev)].sort(), ev); }
    const canais = [...codigo.matchAll(/\('(cobranca_rs_[a-z_]+)', '(email|sino|popup)', true\)/g)].map((m) => `${m[1]}/${m[2]}`).sort();
    assert.deepEqual(canais, ["cobranca_rs_aguardando_validacao/email", "cobranca_rs_aguardando_validacao/sino", "cobranca_rs_pendente_revisao/sino"]);
    assert.ok(!/aviso_destinatarios\b/.test(codigo.replace(/--.*$/gm, "")), "0 destinatários"); assert.ok(!/update public\.cobrancas_rs|insert into public\.cobrancas_rs/i.test(codigo), "nenhum dado de cobrancas_rs alterado");
    assert.match(sql, /Deploy ANTES desta migration é seguro/);
  });

  console.log(`\n${total} casos OK${process.exitCode ? " (com falhas acima)" : ""}`);
})();
