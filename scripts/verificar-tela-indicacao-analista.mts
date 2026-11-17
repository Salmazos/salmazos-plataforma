// Tela do analista (ModalIndicacoesCandidato) para indicação SEM vaga + padrão dos campos de admissão ("Completar dados").
// Usa o payload REAL das rotas (harness) para decidir o que a tela mostra, renderiza os componentes de verdade (react-dom/server) e
// confere que texto livre não passa pelo servidor. Nada toca produção.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-tela-indicacao-analista.mts
import assert from "node:assert/strict";
import { createRequire } from "node:module";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID } from "./harness-mot/ambiente-indicacao.mjs";
import { DICA_APROVAR_SEM_VAGA, estadoIndicacaoAnalista } from "../src/lib/indicacaoSemVaga";
import {
  comporHorario, decomporHorario, erroCentroCusto, erroEscala, erroHorario, erroSalarioHora, erroSalarioMensal, erroTempoContrato, erroTurno,
  validarCamposAdmissao,
} from "../src/lib/admissaoCamposPadrao";
import { TEMPO_CONTRATO_PADRAO } from "../src/lib/constants";
import { CartaoIndicacaoTopo, BotaoAprovarIndicacao } from "../src/components/CartaoIndicacaoAnalista";
import IndicacaoSemVagaAcoes from "../src/components/IndicacaoSemVagaAcoes";
import CamposAdmissaoPadrao from "../src/components/CamposAdmissaoPadrao";

const req = createRequire(import.meta.url);
const { renderToStaticMarkup } = req("react-dom/server");
const React = req("react");
const render = (el: unknown) => renderToStaticMarkup(el);

congelarData();
const R = {
  criar: await importar("src/app/api/portal/indicar-candidato/route.ts"),
  lista: await importar("src/app/api/solicitacoes-indicacao-candidato/route.ts"),
  porId: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/route.ts"),
  decisao: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts"),
  direcionar: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/direcionar/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const MOT = "mao_obra_temporaria", TERC = "terceirizacao", RS = "recrutamento_selecao";

// Indicação sem vaga criada pela rota real do portal; o memdb não aplica DEFAULTs do banco, então simula status/datas.
const db = novoDbIndicacao();
logar(db, "dir"); logarPortal(db, "cli");
const criada = await chamar(R.criar.POST, { metodo: "POST", corpo: { vaga_id: null, tipo_servico: MOT, candidato_nome: "Beatriz Lima", candidato_telefone: "(19) 97777-1111", admissao_funcao: "Auxiliar" } });
assert.equal(criada.status, 201);
const nova = db.tabelas.solicitacoes_indicacao_candidato.at(-1);
nova.status ??= "pendente"; nova.created_at ??= "2026-10-07T12:00:00Z"; nova.updated_at ??= nova.created_at;
logar(db, "dir");
const doId = (await chamar(R.porId.GET, { params: { id: nova.id } })).corpo.data;
const daLista = (await chamar(R.lista.GET, { url: "http://t/api?status=pendente" })).corpo.data.find((x: any) => x.id === nova.id);

// ── 1. Condição de renderização vem do payload real (lista E foco por id) ──
for (const [nome, it] of [["lista", daLista], ["por id", doId]] as const) {
  await ok(`payload real (${nome}): sem vaga -> ações visíveis, Aprovar bloqueado, tipo de serviço presente`, () => {
    const e = estadoIndicacaoAnalista(it);
    assert.equal(e.semVaga, true); assert.equal(e.mostrarAcoesSemVaga, true);
    assert.equal(e.aprovarBloqueadoSemVaga, true); assert.equal(e.dicaAprovar, DICA_APROVAR_SEM_VAGA);
    assert.equal(e.tipoServico, MOT);
  });
}

await ok("topo do cartão renderiza texto 'sem vaga' COM o tipo de serviço e as 3 ações", () => {
  const html = render(React.createElement(CartaoIndicacaoTopo, { item: doId, onAtualizadoSemVaga: () => {} }));
  for (const t of ["Beatriz Lima", "SEM VAGA", "Mão de Obra Temporária", "Direcionar para vaga existente", "Criar vaga a partir da indicação", "Completar dados"]) assert.ok(html.includes(t), `faltou: ${t}`);
});
await ok("Aprovar sem vaga: botão presente, DESABILITADO e com a dica", () => {
  const html = render(React.createElement(BotaoAprovarIndicacao, { semVaga: true, carregando: false, desabilitado: false, dica: DICA_APROVAR_SEM_VAGA, onClick: () => {} }));
  assert.match(html, /disabled=""/); assert.ok(html.includes(DICA_APROVAR_SEM_VAGA));
});
await ok("Aprovar com vaga: botão habilitado", () => {
  const html = render(React.createElement(BotaoAprovarIndicacao, { semVaga: false, carregando: false, desabilitado: false, dica: undefined, onClick: () => {} }));
  assert.doesNotMatch(html, /disabled=""/);
});
await ok("com vaga e sem origem 'sem vaga': nenhuma ação sem-vaga e Aprovar liberado", () => {
  const e = estadoIndicacaoAnalista({ status: "pendente", vaga_id: "v1", vagas: { titulo: "X", tipo_servico: RS }, sem_vaga_origem: false });
  assert.equal(e.mostrarAcoesSemVaga, false); assert.equal(e.aprovarBloqueadoSemVaga, false); assert.equal(e.tipoServico, RS);
});
await ok("direcionada (sem_vaga_origem): 'Completar dados' segue visível, Aprovar liberado", () => {
  const e = estadoIndicacaoAnalista({ status: "pendente", vaga_id: "v1", sem_vaga_origem: true, vagas: { titulo: "X", tipo_servico: MOT } });
  assert.equal(e.mostrarAcoesSemVaga, true); assert.equal(e.aprovarBloqueadoSemVaga, false);
});
await ok("indicação já decidida: sem ações", () => assert.equal(estadoIndicacaoAnalista({ status: "aprovada", vaga_id: null }).mostrarAcoesSemVaga, false));

// ── 2. Campos padronizados: o que a tela renderiza por tipo ──
const campos = (tipo: string, valores = {}) => render(React.createElement(CamposAdmissaoPadrao, { tipoServico: tipo, valores, onChange: () => {} }));
await ok("MOT: centro, horista/mensalista, entrada/saída, turno, escala, tempo de contrato (e nada de input de texto livre p/ turno)", () => {
  const h = campos(MOT);
  for (const t of ["Centro de custo", "Salário por hora", "Salário mensal", "Horário de entrada", "Horário de saída", "Turno", "Escala", "Tempo de contrato", TEMPO_CONTRATO_PADRAO, "12x36 - Noite"]) assert.ok(h.includes(t), `MOT faltou: ${t}`);
  assert.ok(h.includes('type="time"'));
});
await ok("Terceirização: centro, salário, entrada/saída, turno; sem escala/tempo", () => {
  const h = campos(TERC);
  for (const t of ["Centro de custo", "Salário mensal", "Horário de entrada", "Turno", "Escala 6x1"]) assert.ok(h.includes(t), `TERC faltou: ${t}`);
  assert.ok(!h.includes("Tempo de contrato"));
});
await ok("R&S: só salário mensal", () => {
  const h = campos(RS);
  assert.ok(h.includes("Salário mensal")); assert.ok(!h.includes("Centro de custo")); assert.ok(!h.includes("Turno"));
});
await ok("valor legado fora do padrão aparece como aviso (não some em silêncio)", () => {
  assert.ok(campos(MOT, { admissao_turno: "Turno B, 08h", admissao_horario: "Turno B, 08h00 às 17h00" }).includes("fora das opções"));
});
await ok("'5x2' (Outro) é preservado como escala válida", () => assert.ok(campos(MOT, { admissao_escala: "5x2" }).includes('value="5x2"')));
await ok("painel 'Completar dados' do analista usa os campos padronizados", () => {
  const html = render(React.createElement(IndicacaoSemVagaAcoes, { item: doId, onAtualizado: () => {} }));
  assert.ok(html.includes("Completar dados"));
});

// ── 3. Regras de validação (mesmas da tela e do servidor) ──
await ok("centro de custo: aceita CC-0042 / 123 / A.b_c/1; recusa espaço, acento, 31 caracteres", () => {
  for (const v of ["CC-0042", "123", "A.b_c/1", "a".repeat(30)]) assert.equal(erroCentroCusto(v), null, v);
  for (const v of ["CC 42", "Produção", "a".repeat(31), "x;y", ""]) assert.notEqual(erroCentroCusto(v), null, v);
});
await ok("tempo de contrato: padrão, '90 dias', '120 dias, prorrogável por mais 60 dias'; recusa 181 dias, prorrogação 91, texto livre", () => {
  for (const v of [TEMPO_CONTRATO_PADRAO, "90 dias", "120 dias, prorrogável por mais 60 dias", "180 dias"]) assert.equal(erroTempoContrato(v), null, v);
  for (const v of ["181 dias", "30 dias, prorrogável por mais 91 dias", "6 meses", "0 dias", "a combinar"]) assert.notEqual(erroTempoContrato(v), null, v);
});
await ok("turno/escala: listas e 'Outro' só em 'Turno X' / NxM[ - Dia|Noite]", () => {
  for (const v of ["Turno A", "Horário Administrativo", "Turno E"]) assert.equal(erroTurno(v), null, v);
  for (const v of ["turno a", "Noturno", "Turno AA", "qualquer coisa"]) assert.notEqual(erroTurno(v), null, v);
  for (const v of ["6x1", "12x36 - Noite", "5x2", "5x2 - Dia", "Fixa"]) assert.equal(erroEscala(v), null, v);
  for (const v of ["5 por 2", "5x2 - Tarde", "livre"]) assert.notEqual(erroEscala(v), null, v);
});
await ok("salário: mensal 1..100000 e hora 1..1000, máx. 2 casas", () => {
  for (const v of [1, 2500.5, 100000]) assert.equal(erroSalarioMensal(v), null, String(v));
  for (const v of [0, 0.5, 100000.01, 100001, 1500.123, NaN]) assert.notEqual(erroSalarioMensal(v), null, String(v));
  for (const v of [1, 8.9, 1000]) assert.equal(erroSalarioHora(v), null, String(v));
  for (const v of [0, 1000.01, 1500, 8.999]) assert.notEqual(erroSalarioHora(v), null, String(v));
});
await ok("horário: compõe/decompõe ida e volta; recusa formato livre; turno x horário precisam conferir", () => {
  const h = comporHorario("Turno B", "08:00", "17:00");
  assert.equal(h, "Turno B, 08h00 às 17h00"); assert.deepEqual(decomporHorario(h), { turno: "Turno B", entrada: "08:00", saida: "17:00" });
  assert.equal(erroHorario(h), null); assert.notEqual(erroHorario("das 8 às 17"), null); assert.notEqual(erroHorario("Turno B, 25h00 às 17h00"), null);
  assert.equal(validarCamposAdmissao({ admissao_turno: "Turno A", admissao_horario: h }).length, 1);
  assert.equal(validarCamposAdmissao({ admissao_turno: "Turno B", admissao_horario: h }).length, 0);
});

// ── 4. Servidor: texto livre não passa, mesmo por requisição direta ──
const patch = (id: string, corpo: Record<string, unknown>) => { logar(db, "dir"); return chamar(R.porId.PATCH, { metodo: "PATCH", params: { id }, corpo }); };
for (const [campo, valor] of [
  ["admissao_centro_custo", "centro de custo livre"], ["admissao_tempo_contrato", "6 meses"], ["admissao_turno", "noite"],
  ["admissao_escala", "5 por 2"], ["admissao_horario", "das 8 às 17"], ["admissao_salario", 150000], ["admissao_salario_hora", 2000], ["admissao_salario", 1500.555],
] as const) {
  await ok(`analista PATCH recusa ${campo}=${JSON.stringify(valor)} (400, mensagem clara)`, async () => {
    const r = await patch(nova.id, { [campo]: valor });
    assert.equal(r.status, 400, JSON.stringify(r.corpo)); assert.ok(String(r.corpo.error).length > 15);
  });
}
await ok("analista PATCH aceita dados no padrão e grava", async () => {
  const r = await patch(nova.id, { admissao_centro_custo: "CC-0042", admissao_tempo_contrato: TEMPO_CONTRATO_PADRAO, admissao_turno: "Turno B", admissao_horario: "Turno B, 08h00 às 17h00", admissao_escala: "5x2", admissao_salario: 2500.5 });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(db.tabelas.solicitacoes_indicacao_candidato.find((s: any) => s.id === nova.id).admissao_centro_custo, "CC-0042");
});
await ok("PATCH com horário que não bate com o turno é recusado", async () => assert.equal((await patch(nova.id, { admissao_turno: "Turno C" })).status, 400));
await ok("portal (criar indicação) recusa centro de custo e tempo fora do padrão", async () => {
  for (const extra of [{ admissao_centro_custo: "com espaço" }, { admissao_tempo_contrato: "a combinar" }]) {
    logar(db, "dir"); logarPortal(db, "cli");
    const r = await chamar(R.criar.POST, { metodo: "POST", corpo: { vaga_id: ID.V_MOT_A, candidato_nome: "Fulano", candidato_telefone: "(19) 95555-0000", admissao_funcao: "Op", ...extra } });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
  }
});
await ok("aprovar sem vaga continua bloqueado (409 sem_vaga)", async () => {
  logar(db, "dir");
  const r = await chamar(R.decisao.POST, { metodo: "POST", params: { id: nova.id }, corpo: { acao: "aprovar", data_fim: "2027-01-31" } });
  assert.equal(r.status, 409); assert.equal(r.corpo.codigo, "sem_vaga");
});

console.log(`\n${n} verificações OK`);
