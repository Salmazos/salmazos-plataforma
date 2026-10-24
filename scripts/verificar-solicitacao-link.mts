// Verificação do link público de solicitação de vaga (o projeto não tem runner de testes). Sem banco: só a lógica pura.
// Rodar (mesmo loader do verificar-propostas, que resolve "@/" e imports sem extensão, e traz propostaModelos.ts):
//   node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-solicitacao-link.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { validarCnpj, validarCpf, mascararCnpj, mascararCpf, mascararTelefone } from "../src/lib/documentoBr";
import { escaparHtml } from "../src/lib/escaparHtml";
import {
  MAX_USOS_LINK, MENSAGEM_LINK_INDISPONIVEL, calcularExpiraEm, statusDoLink, validarLink,
} from "../src/lib/solicitacaoVagaLink";
import * as campos from "../src/lib/solicitacaoVagaCampos";
import {
  gerarBeneficiosChips, gerarBeneficiosTexto, gerarHorarioTexto, gerarRequisitosTexto, listarRequisitos, requisitosPublicaveis, HORARIO_VAZIO,
  REQ_CNH, REQ_CONHECIMENTOS, REQ_ESCOLARIDADE, REQ_EXPERIENCIA, REQ_NR, BEN_ALIMENTACAO, BEN_QUALIDADE, BEN_SAUDE, BEN_TRANSPORTE,
} from "../src/lib/solicitacaoVagaCampos";
import {
  formularioInicial, formularioPreenchido, montarCorpoEnvio, validarEtapa, validarTudo, type FormPublico,
} from "../src/lib/solicitacaoVagaPublicaForm";
import { itensDasCondicoes, condicoesPersonalizadas, lerCondicoesDoLink, montarSnapshotCondicoes } from "../src/lib/solicitacaoVagaCondicoes";
import { SALARIO_A_COMBINAR as CONST_A_COMBINAR, SALARIO_ENVIAR_PRETENSAO as CONST_PRETENSAO, formatarSalarioHora } from "../src/lib/constants";
import { PADROES_RS } from "../src/lib/propostaModelos";
import { publicoSolicitarVagaSchema, solicitacaoLinkCreateSchema } from "../src/lib/schemas";
import * as rotaPublica from "../src/app/api/solicitacao-vaga-publica/[token]/route";
import * as rotaLinks from "../src/app/api/solicitacoes-vagas/links/route";
import { criarDb } from "./harness-mot/memdb.mjs";

let total = 0;
function caso(nome: string, fn: () => void) {
  fn();
  total++;
  console.log(`OK    ${nome}`);
}

async function casoRota(nome: string, fn: () => Promise<void>) {
  await fn();
  total++;
  console.log(`OK    ${nome}`);
}

const AGORA = new Date("2026-10-26T12:00:00.000Z");
const AMANHA = "2026-10-27T12:00:00.000Z";
const ONTEM = "2026-10-25T12:00:00.000Z";
const CNPJ_OK = "11.222.333/0001-81";
const CPF_OK = "529.982.247-25";

// ── Link: validade ───────────────────────────────────────────────────────────
caso("validarLink: link válido", () => {
  assert.deepEqual(validarLink({ expira_em: AMANHA, revogado_em: null, usos: 0 }, AGORA), { ok: true });
  assert.deepEqual(validarLink({ expira_em: AMANHA, revogado_em: null, usos: MAX_USOS_LINK - 1 }, AGORA), { ok: true });
});
caso("validarLink: expirado, revogado, limite atingido e inexistente → 410/404 com a mesma mensagem amigável", () => {
  const casos = [
    [{ expira_em: ONTEM, revogado_em: null, usos: 0 }, "expirado", 410],
    [{ expira_em: AMANHA, revogado_em: ONTEM, usos: 0 }, "revogado", 410],
    [{ expira_em: AMANHA, revogado_em: null, usos: MAX_USOS_LINK }, "limite", 410],
    [null, "inexistente", 404],
  ] as const;
  for (const [link, status, httpStatus] of casos) {
    const r = validarLink(link, AGORA);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.equal(r.status, status);
      assert.equal(r.httpStatus, httpStatus);
      assert.equal(r.mensagem, MENSAGEM_LINK_INDISPONIVEL);
    }
  }
  assert.ok(!/revog|expir|limite|usos|token/i.test(MENSAGEM_LINK_INDISPONIVEL), "mensagem sem motivo técnico");
});
caso("statusDoLink: prioridade revogado > expirado > limite; expira exatamente agora = expirado", () => {
  assert.equal(statusDoLink({ expira_em: ONTEM, revogado_em: ONTEM, usos: 99 }, AGORA), "revogado");
  assert.equal(statusDoLink({ expira_em: ONTEM, revogado_em: null, usos: 99 }, AGORA), "expirado");
  assert.equal(statusDoLink({ expira_em: AGORA.toISOString(), revogado_em: null, usos: 0 }, AGORA), "expirado");
  assert.equal(statusDoLink({ expira_em: AMANHA, revogado_em: null, usos: 99 }, AGORA), "limite");
  assert.equal(MAX_USOS_LINK, 30);
});
caso("calcularExpiraEm soma os dias", () => {
  assert.equal(calcularExpiraEm(AGORA, 15), "2026-11-10T12:00:00.000Z");
});

// ── escaparHtml ──────────────────────────────────────────────────────────────
caso("escaparHtml: neutraliza tags, aspas e &; aceita nulo e número", () => {
  assert.equal(escaparHtml(`<script>alert("x")</script> & 'a'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;a&#39;");
  assert.equal(escaparHtml(null), "");
  assert.equal(escaparHtml(undefined), "");
  assert.equal(escaparHtml(12), "12");
  assert.ok(!escaparHtml("<img src=x onerror=1>").includes("<"));
});

// ── CPF / CNPJ ───────────────────────────────────────────────────────────────
caso("CPF: válidos (com e sem máscara) e inválidos", () => {
  assert.ok(validarCpf(CPF_OK) && validarCpf("52998224725"));
  for (const ruim of ["529.982.247-24", "111.111.111-11", "123", "", "abcdefghijk", "529.982.247-2"]) assert.ok(!validarCpf(ruim), ruim);
});
caso("CNPJ: válidos (com e sem máscara) e inválidos", () => {
  assert.ok(validarCnpj(CNPJ_OK) && validarCnpj("11222333000181"));
  for (const ruim of ["11.222.333/0001-80", "00.000.000/0000-00", "11.111.111/1111-11", "123", "", "1122233300018"]) assert.ok(!validarCnpj(ruim), ruim);
});
caso("máscaras de CPF, CNPJ e telefone", () => {
  assert.equal(mascararCpf("52998224725"), CPF_OK);
  assert.equal(mascararCnpj("11222333000181"), CNPJ_OK);
  assert.equal(mascararCpf(CPF_OK + "999"), CPF_OK, "corta no tamanho do documento");
  assert.equal(mascararTelefone("19999998888"), "(19) 99999-8888");
  assert.equal(mascararTelefone("1932177899"), "(19) 3217-7899");
  assert.equal(mascararTelefone(""), "");
});

// ── Requisitos publicáveis ───────────────────────────────────────────────────
caso("requisitosPublicaveis: só habilitação e veículo próprio entram; sexo, idade e PCD NUNCA", () => {
  const perfil = { sexo: "fem", idade: "até 30 anos", pcd: "sim", habilitacao_categoria: "B", veiculo_proprio: "sim", local_trabalho: "Rua Secreta, 1" };
  const texto = requisitosPublicaveis("• Ensino Médio — Completo", perfil)!;
  assert.ok(texto.includes("• Ensino Médio — Completo"));
  assert.ok(texto.includes("• Habilitação categoria B") && texto.includes("• Veículo próprio"));
  for (const proibido of ["fem", "Feminino", "30 anos", "idade", "Sexo", "PCD", "pcd", "Rua Secreta", "masc"]) assert.ok(!texto.includes(proibido), proibido);
});
caso("requisitosPublicaveis: sem habilitação/veículo mantém o texto; sem nada devolve null; não duplica", () => {
  assert.equal(requisitosPublicaveis("• Excel", { habilitacao_categoria: null, veiculo_proprio: "nao", sexo: "masc", idade: "25" }), "• Excel");
  assert.equal(requisitosPublicaveis(null, { veiculo_proprio: "nao" }), null);
  assert.equal(requisitosPublicaveis(null, { veiculo_proprio: "sim" }), "• Veículo próprio");
  assert.equal(requisitosPublicaveis("• Veículo próprio", { veiculo_proprio: "sim" }), "• Veículo próprio");
  assert.equal(requisitosPublicaveis("  ", null), null);
});
caso("requisitosPublicaveis: categoria do perfil NÃO é acrescentada quando o texto já tem linha de CNH ou de habilitação", () => {
  const perfil = (categoria: string, veiculo = "nao") => ({ habilitacao_categoria: categoria, veiculo_proprio: veiculo });
  // chip "CNH B/C/D/E"
  assert.equal(requisitosPublicaveis("• CNH B", perfil("B")), "• CNH B");
  assert.equal(requisitosPublicaveis("• CNH C", perfil("B")), "• CNH C", "mesmo com categoria diferente: já há linha de CNH");
  assert.equal(requisitosPublicaveis("• Ensino Médio\n• CNH D\n• NR-10", perfil("B")), "• Ensino Médio\n• CNH D\n• NR-10");
  // "Habilitação categoria X" já escrito, em qualquer caixa
  assert.equal(requisitosPublicaveis("• Habilitação categoria D", perfil("D")), "• Habilitação categoria D");
  assert.equal(requisitosPublicaveis("• habilitacao categoria A", perfil("B")), "• habilitacao categoria A");
  // CNH digitada à mão (requisito personalizado)
  assert.equal(requisitosPublicaveis("• Possuir cnh A", perfil("A")), "• Possuir cnh A");
  // sem linha de habilitação: a categoria é acrescentada, depois do texto do cliente
  assert.equal(requisitosPublicaveis("• Ensino Médio", perfil("B")), "• Ensino Médio\n• Habilitação categoria B");
  assert.equal(requisitosPublicaveis(null, perfil("AB")), "• Habilitação categoria AB");
  assert.equal(requisitosPublicaveis("• Experiência em vendas", perfil("C")), "• Experiência em vendas\n• Habilitação categoria C");
  // palavra que só parece: "CNHs" colado em letras não é a sigla
  assert.equal(requisitosPublicaveis("• Conhece CNHx", perfil("B")), "• Conhece CNHx\n• Habilitação categoria B");
  // o veículo próprio continua sendo acrescentado mesmo com linha de CNH, e sexo/idade/PCD nunca entram
  assert.equal(requisitosPublicaveis("• CNH B", { ...perfil("B", "sim"), sexo: "fem", idade: "30", pcd: "sim" }), "• CNH B\n• Veículo próprio");
  assert.equal(requisitosPublicaveis("• CNH B", perfil("B", "nao")), "• CNH B");
});

// ── Geradores de texto (mesmo formato do portal) ─────────────────────────────
caso("geradores: horário, requisitos e benefícios no mesmo formato do portal", () => {
  const h = { ...HORARIO_VAZIO, tipo: "seg_sex" as const, entrada: "08:00", saida: "17:00", intervalo: "1h" };
  assert.equal(gerarHorarioTexto(h), "Segunda a Sexta, 08h00 às 17h00 (intervalo de 1h)");
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "12x36", diurnoNoturno: "noturno", entrada: "19:00", saida: "07:00", intervalo: "sem intervalo" }), "Escala 12x36 — Turno Noturno, 19h00 às 07h00 (sem intervalo)");
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "a_combinar" }), "A combinar");
  assert.equal(gerarHorarioTexto(HORARIO_VAZIO), "");
  const req = { chips: { "Ensino Superior": true, "CNH B": true }, cursos: { "Ensino Superior": "Administração" }, condicoes: { "Ensino Superior": "Completo" }, custom: ["Boa comunicação"] };
  assert.equal(gerarRequisitosTexto(req), "• Ensino Superior em Administração — Completo\n• CNH B\n• Boa comunicação");
  assert.deepEqual(gerarBeneficiosChips({ chips: { "Vale Transporte": true, "Day Off": false }, custom: ["Auxílio creche"] }), { "Vale Transporte": true, "Auxílio creche": true });
});


// ── Paridade com o formulário do portal ──────────────────────────────────────
// O portal (portal/solicitar-vaga/page.tsx) gera o texto em closures dentro da página. Aqui elas são EXTRAÍDAS do código-fonte atual do
// portal, transpiladas e executadas com as mesmas listas, e a saída é comparada com os geradores puros do link público.
const FONTE_PORTAL = fs.readFileSync("src/app/portal/(app)/solicitar-vaga/page.tsx", "utf8");
function trecho(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  assert.ok(i >= 0, `trecho não encontrado no portal: ${inicio}`);
  const j = fonte.indexOf(fim, i);
  assert.ok(j >= 0, `fim não encontrado no portal: ${fim}`);
  return fonte.slice(i, j + fim.length);
}
const CODIGO_PORTAL = [
  trecho(FONTE_PORTAL, "const gerarRequisitosTexto = ", "\n  };\n"),
  trecho(FONTE_PORTAL, "const gerarBeneficiosTexto = ", "\n  };\n"),
  trecho(FONTE_PORTAL, "const gerarBeneficiosChips = ", "\n  };\n"),
  trecho(FONTE_PORTAL, "const reqChipsList: string[] = [];", "reqChipsList.push(...reqCustom);"),
].join("\n");
const portalJs = ts.transpileModule(
  `const executar = (REQ_ESCOLARIDADE, REQ_EXPERIENCIA, REQ_CNH, REQ_NR, REQ_CONHECIMENTOS, BEN_TRANSPORTE, BEN_ALIMENTACAO, BEN_SAUDE, BEN_QUALIDADE, reqChips, reqCursos, reqCondicoes, reqCustom, benChips, benCustom) => {\n${CODIGO_PORTAL}\nreturn { requisitosTexto: gerarRequisitosTexto(), beneficiosTexto: gerarBeneficiosTexto(), beneficiosChips: gerarBeneficiosChips(), reqChipsList };\n};\nmodule.exports = executar;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const modPortal: any = { exports: {} };
new Function("module", "exports", portalJs)(modPortal, modPortal.exports);
function noPortal(sel: { chips: Record<string, boolean>; cursos: Record<string, string>; condicoes: Record<string, string>; custom: string[] }, ben: { chips: Record<string, boolean>; custom: string[] }) {
  return modPortal.exports(REQ_ESCOLARIDADE, REQ_EXPERIENCIA, REQ_CNH, REQ_NR, REQ_CONHECIMENTOS, BEN_TRANSPORTE, BEN_ALIMENTACAO, BEN_SAUDE, BEN_QUALIDADE, sel.chips, sel.cursos, sel.condicoes, sel.custom, ben.chips, ben.custom) as {
    requisitosTexto: string; beneficiosTexto: string; beneficiosChips: Record<string, boolean>; reqChipsList: string[];
  };
}
function noPublico(sel: Parameters<typeof gerarRequisitosTexto>[0], ben: Parameters<typeof gerarBeneficiosTexto>[0]) {
  const lista = listarRequisitos(sel);
  return { requisitosTexto: gerarRequisitosTexto(sel), beneficiosTexto: gerarBeneficiosTexto(ben), beneficiosChips: gerarBeneficiosChips(ben), reqChipsList: lista };
}
const VAZIO_REQ = { chips: {}, cursos: {}, condicoes: {}, custom: [] as string[] };
const VAZIO_BEN = { chips: {}, custom: [] as string[] };

caso("paridade com o portal: saída esperada escrita à mão (chip simples, com curso, com condição, curso + condição, personalizados, nenhum)", () => {
  const casos: { nome: string; req: typeof VAZIO_REQ; texto: string; chips: string[] | null }[] = [
    { nome: "chip simples", req: { ...VAZIO_REQ, chips: { "Experiência na função": true } }, texto: "• Experiência na função", chips: ["Experiência na função"] },
    { nome: "chip com curso", req: { ...VAZIO_REQ, chips: { "Ensino Técnico": true }, cursos: { "Ensino Técnico": "Mecânica" } }, texto: "• Ensino Técnico em Mecânica", chips: ["Ensino Técnico em Mecânica"] },
    { nome: "chip com condição", req: { ...VAZIO_REQ, chips: { "Ensino Médio": true }, condicoes: { "Ensino Médio": "Completo" } }, texto: "• Ensino Médio — Completo", chips: ["Ensino Médio — Completo"] },
    {
      nome: "curso + condição",
      req: { ...VAZIO_REQ, chips: { "Ensino Superior": true }, cursos: { "Ensino Superior": "Administração" }, condicoes: { "Ensino Superior": "A partir do 6º semestre" } },
      texto: "• Ensino Superior em Administração — A partir do 6º semestre",
      chips: ["Ensino Superior em Administração — A partir do 6º semestre"],
    },
    { nome: "itens personalizados", req: { ...VAZIO_REQ, custom: ["Boa comunicação", "Trabalho em equipe"] }, texto: "• Boa comunicação\n• Trabalho em equipe", chips: ["Boa comunicação", "Trabalho em equipe"] },
    { nome: "nenhum item", req: VAZIO_REQ, texto: "", chips: [] },
    {
      nome: "ordem das listas (não a do clique) e chip desmarcado/curso em branco ignorados",
      req: { chips: { "NR-10": true, "Ensino Superior": true, "Excel avançado": false, "CNH B": true }, cursos: { "Ensino Superior": "   ", "Excel avançado": "Ignorado" }, condicoes: {}, custom: ["Extra"] },
      texto: "• Ensino Superior\n• CNH B\n• NR-10\n• Extra",
      chips: ["Ensino Superior", "CNH B", "NR-10", "Extra"],
    },
  ];
  for (const c of casos) {
    const publico = noPublico(c.req, VAZIO_BEN);
    const portal = noPortal(c.req, VAZIO_BEN);
    assert.equal(publico.requisitosTexto, c.texto, `${c.nome}: texto (público)`);
    assert.equal(portal.requisitosTexto, c.texto, `${c.nome}: texto (portal)`);
    assert.deepEqual(publico.reqChipsList, c.chips ?? [], `${c.nome}: requisitos_chips (público)`);
    assert.deepEqual(portal.reqChipsList, c.chips ?? [], `${c.nome}: requisitos_chips (portal)`);
  }
  const ben = { chips: { "Vale Transporte": true, "Day Off": false, "Fretado": true, "PLR": true }, custom: ["Auxílio creche"] };
  const esperadoTexto = "• Vale Transporte\n• Fretado\n• PLR\n• Auxílio creche";
  const esperadoChips = JSON.stringify({ "Vale Transporte": true, "Fretado": true, "PLR": true, "Auxílio creche": true });
  assert.equal(noPublico(VAZIO_REQ, ben).beneficiosTexto, esperadoTexto);
  assert.equal(noPortal(VAZIO_REQ, ben).beneficiosTexto, esperadoTexto);
  assert.equal(JSON.stringify(noPublico(VAZIO_REQ, ben).beneficiosChips), esperadoChips, "benefícios_chips (ordem das chaves incluída)");
  assert.equal(JSON.stringify(noPortal(VAZIO_REQ, ben).beneficiosChips), esperadoChips);
  assert.equal(noPublico(VAZIO_REQ, VAZIO_BEN).beneficiosTexto, "");
  assert.deepEqual(noPublico(VAZIO_REQ, VAZIO_BEN).beneficiosChips, {});
  assert.deepEqual(noPortal(VAZIO_REQ, VAZIO_BEN).beneficiosChips, {});
});

caso("paridade com o portal: 2.000 seleções aleatórias dão EXATAMENTE a mesma saída nas closures do portal (extraídas do código atual) e nos geradores do link público", () => {
  let semente = 20261026;
  const aleatorio = () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const escolhe = <T,>(lista: readonly T[]) => lista[Math.floor(aleatorio() * lista.length)];
  const todosReq = [...REQ_ESCOLARIDADE, ...REQ_EXPERIENCIA, ...REQ_CNH, ...REQ_NR, ...REQ_CONHECIMENTOS];
  const todosBen = [...BEN_TRANSPORTE, ...BEN_ALIMENTACAO, ...BEN_SAUDE, ...BEN_QUALIDADE];
  const cursos = ["", "  ", "Administração", " Mecânica ", "Direito"];
  const condicoes = ["", "Completo", "Cursando", "Completo ou Cursando", "A partir do 3º semestre"];
  const extras = ["Boa comunicação", "Pacote Office avançado", "Disponibilidade para viagens", "Inglês intermediário", "NR-33"];
  let comparadas = 0;
  for (let n = 0; n < 2000; n++) {
    const chips: Record<string, boolean> = {};
    const cursosSel: Record<string, string> = {};
    const condSel: Record<string, string> = {};
    for (const c of todosReq) {
      if (aleatorio() < 0.3) chips[c] = aleatorio() < 0.85;
      if (aleatorio() < 0.5) cursosSel[c] = escolhe(cursos);
      if (aleatorio() < 0.5) condSel[c] = escolhe(condicoes);
    }
    const custom = extras.filter(() => aleatorio() < 0.3);
    const benChips: Record<string, boolean> = {};
    for (const c of todosBen) if (aleatorio() < 0.3) benChips[c] = aleatorio() < 0.85;
    const benCustom = extras.filter(() => aleatorio() < 0.3);
    const req = { chips, cursos: cursosSel, condicoes: condSel, custom };
    const ben = { chips: benChips, custom: benCustom };
    const a = noPortal(req, ben);
    const b = noPublico(req, ben);
    assert.equal(b.requisitosTexto, a.requisitosTexto, `requisitos #${n}`);
    assert.deepEqual(b.reqChipsList, a.reqChipsList, `requisitos_chips #${n}`);
    assert.equal(b.beneficiosTexto, a.beneficiosTexto, `beneficios #${n}`);
    assert.equal(JSON.stringify(b.beneficiosChips), JSON.stringify(a.beneficiosChips), `beneficios_chips #${n}`);
    comparadas++;
  }
  assert.equal(comparadas, 2000);
});

caso("mesmas constantes: o portal e o link público importam as listas do MESMO módulo, sem definição local duplicada", () => {
  const CAMINHO = "src/lib/solicitacaoVagaCampos";
  const compartilhadas = [
    "ESTADOS", "HORARIO_TIPOS", "REQ_ESCOLARIDADE", "REQ_COM_CURSO", "REQ_COM_CONDICAO_SIMPLES", "REQ_EXPERIENCIA", "REQ_CNH", "REQ_NR",
    "REQ_CONHECIMENTOS", "BEN_TRANSPORTE", "BEN_ALIMENTACAO", "BEN_SAUDE", "BEN_QUALIDADE", "CONDICOES_TECNICO", "CONDICOES_SUPERIOR", "CONDICOES_SIMPLES",
  ];
  const publicos = [
    "src/components/solicitacao-publica/EtapaVaga.tsx", "src/components/solicitacao-publica/EtapaPerfil.tsx",
    "src/components/solicitacao-publica/ChipGroupPublico.tsx", "src/lib/solicitacaoVagaPublicaForm.ts",
  ];
  const portalArquivo = "src/app/portal/(app)/solicitar-vaga/page.tsx";
  const normaliza = (origem: string, arquivo: string) => {
    if (origem.startsWith("@/")) return `src/${origem.slice(2)}`;
    const partes = arquivo.split("/").slice(0, -1);
    for (const parte of origem.split("/")) {
      if (parte === "..") partes.pop();
      else if (parte !== ".") partes.push(parte);
    }
    return partes.join("/");
  };
  function importados(arquivo: string): Map<string, string> {
    const fonte = fs.readFileSync(arquivo, "utf8");
    const mapa = new Map<string, string>();
    for (const m of fonte.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
      for (const nome of m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean)) mapa.set(nome, normaliza(m[2], arquivo));
    }
    return mapa;
  }
  const portalImp = importados(portalArquivo);
  const publicoImp = new Map<string, string>();
  for (const f of publicos) for (const [nome, de] of importados(f)) if (de === CAMINHO) publicoImp.set(nome, de);
  const fontePortal = fs.readFileSync(portalArquivo, "utf8");
  const fontesPublicas = publicos.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const linhas: string[] = [];
  for (const nome of compartilhadas) {
    const noPortalImporta = portalImp.get(nome) === CAMINHO;
    const definidaNoPortal = new RegExp(`(?:const|let|var)\\s+${nome}\\b`).test(fontePortal);
    const definidaNoPublico = new RegExp(`(?:const|let|var)\\s+${nome}\\b`).test(fontesPublicas);
    const publicoUsa = new RegExp(`\\b${nome}\\b`).test(fontesPublicas);
    assert.ok((campos as any)[nome] !== undefined, `${nome} exportada pela lib`);
    assert.ok(noPortalImporta, `${nome}: o portal precisa importar de ${CAMINHO}`);
    assert.ok(!definidaNoPortal && !definidaNoPublico, `${nome}: sem definição local duplicada`);
    if (publicoUsa) assert.ok(publicoImp.has(nome), `${nome}: o link público precisa importar de ${CAMINHO}`);
    linhas.push(`      ${nome.padEnd(26)} portal: importa da lib | público: ${publicoUsa ? "importa da lib" : "(não usa)"} | definição local: nenhuma`);
  }
  console.log(linhas.join("\n"));
  // Rótulos dos tipos de horário e dos intervalos iguais aos do portal (o portal mantém só as opções de intervalo inline no JSX).
  assert.deepEqual(campos.HORARIO_TIPOS.map((h) => h.label), ["Segunda a Sexta", "Escala 6x1", "Escala 6x2", "Escala 12x36", "Turno Fixo", "A combinar", "Personalizado"]);
});

// ── Condições comerciais do link ─────────────────────────────────────────────
caso("itens renderizados com taxa de cancelamento > 0: 1.1 a 1.7 e adicionais a partir de 1.8", () => {
  const itens = itensDasCondicoes(PADROES_RS, ["Extra A", "Extra B"]);
  assert.deepEqual(itens.map((i) => i.numero), ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9"]);
  assert.ok(itens[2].texto.includes("cancelado ou congelado") && itens[2].texto.includes("25%"));
});
caso("itens renderizados com taxa 0: cláusula de cancelamento ausente e adicionais a partir de 1.7", () => {
  const itens = itensDasCondicoes({ ...PADROES_RS, taxa_cancelamento_pct: 0 }, ["Extra A", "Extra B"]);
  assert.deepEqual(itens.map((i) => i.numero), ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8"]);
  assert.ok(!itens.some((i) => i.texto.includes("cancelado ou congelado")), "sem a cláusula");
  assert.deepEqual(itens.slice(-2).map((i) => i.texto), ["Extra A", "Extra B"]);
  assert.equal(itens[5].numero, "1.6");
  assert.ok(itens[5].texto.startsWith("INSTRUMENTOS DE AVALIAÇÃO PSICOLÓGICA"));
});
caso("snapshot das condições sai SÓ do link (corpo da requisição não entra) e é independente do link depois", () => {
  const link = { id: "L1", condicoes: { ...PADROES_RS, taxa_sem_reposicao_pct: 40, taxa_cancelamento_pct: 0 }, clausulas_adicionais: ["Extra"] };
  const snap = montarSnapshotCondicoes(link);
  assert.equal(snap.link_id, "L1");
  assert.equal(snap.condicoes.taxa_sem_reposicao_pct, 40);
  assert.equal(snap.condicoes.taxa_cancelamento_pct, 0);
  assert.deepEqual(snap.clausulas_adicionais, ["Extra"]);
  assert.equal(snap.itens.at(-1)!.numero, "1.7");
  // O schema público descarta qualquer tentativa de mandar condições no corpo.
  const form = baseForm();
  const corpo = { ...montarCorpoEnvio(form), condicoes: { taxa_sem_reposicao_pct: 1 }, condicoes_aceitas: { x: 1 }, tipo_servico: "terceirizacao", unidade_id: "outra", link_id: "outro" };
  const r = publicoSolicitarVagaSchema.safeParse(corpo);
  assert.ok(r.success);
  if (r.success) for (const chave of ["condicoes", "condicoes_aceitas", "tipo_servico", "unidade_id", "link_id"]) assert.ok(!(chave in r.data), chave);
  // Mexer no link depois não altera a foto já tirada.
  link.condicoes.taxa_sem_reposicao_pct = 99;
  assert.equal(snap.condicoes.taxa_sem_reposicao_pct, 40);
});
caso("lerCondicoesDoLink: coluna nula ou lixo cai nos padrões da proposta", () => {
  assert.deepEqual(lerCondicoesDoLink({ condicoes: null, clausulas_adicionais: null }), { condicoes: PADROES_RS, clausulas: [] });
  assert.deepEqual(lerCondicoesDoLink({ condicoes: { taxa_sem_reposicao_pct: -5 }, clausulas_adicionais: [1, "ok", " "] }), { condicoes: PADROES_RS, clausulas: ["ok"] });
});
caso("condicoesPersonalizadas: padrão não é personalizado; qualquer mudança ou cláusula adicional é", () => {
  assert.equal(condicoesPersonalizadas({ condicoes: PADROES_RS, clausulas_adicionais: [] }), false);
  assert.equal(condicoesPersonalizadas({ condicoes: { ...PADROES_RS, prazo_faturamento_dias: 30 }, clausulas_adicionais: [] }), true);
  assert.equal(condicoesPersonalizadas({ condicoes: { ...PADROES_RS, taxa_cancelamento_pct: 0 }, clausulas_adicionais: [] }), true);
  assert.equal(condicoesPersonalizadas({ condicoes: PADROES_RS, clausulas_adicionais: ["x"] }), true);
  assert.equal(condicoesPersonalizadas(null), false);
});

// ── Geração do link (schema do analista) ─────────────────────────────────────
caso("schema do link: omitido usa PADROES_RS e 15 dias; taxa de cancelamento em branco vira 0; validade e limite de cláusulas", () => {
  const padrao = solicitacaoLinkCreateSchema.parse({});
  assert.deepEqual(padrao.condicoes, PADROES_RS);
  assert.equal(padrao.validade_dias, 15);
  assert.deepEqual(padrao.clausulas_adicionais, []);
  const semTaxa = solicitacaoLinkCreateSchema.parse({ condicoes: { taxa_cancelamento_pct: "" } });
  assert.strictEqual(semTaxa.condicoes.taxa_cancelamento_pct, 0);
  for (const dias of [7, 15, 30]) assert.ok(solicitacaoLinkCreateSchema.safeParse({ validade_dias: dias }).success);
  for (const dias of [0, 10, 31, "7"]) assert.ok(!solicitacaoLinkCreateSchema.safeParse({ validade_dias: dias }).success, String(dias));
  assert.ok(!solicitacaoLinkCreateSchema.safeParse({ condicoes: { taxa_sem_reposicao_pct: "" } }).success, "as outras taxas continuam exigindo valor");
  assert.ok(!solicitacaoLinkCreateSchema.safeParse({ clausulas_adicionais: Array(11).fill("x") }).success);
  assert.ok(!solicitacaoLinkCreateSchema.safeParse({ clausulas_adicionais: ["x".repeat(601)] }).success);
});

// ── Formulário público: validação por etapa ──────────────────────────────────
function baseForm(sobrescrever: Partial<FormPublico> = {}): FormPublico {
  return {
    ...formularioInicial(null),
    nome: "Indústria Exemplo Ltda",
    documento: CNPJ_OK,
    contato_nome: "Maria Souza",
    telefone: "(19) 99999-8888",
    email: "contato@exemplo.com.br",
    email_nf: "financeiro@exemplo.com.br",
    cargo: "Auxiliar administrativo",
    cidade: "Hortolândia",
    estado: "SP",
    aceite: true,
    ...sobrescrever,
  };
}
caso("etapa 1: PJ válida passa; PJ sem contato falha; PF sem contato passa", () => {
  assert.deepEqual(validarEtapa(1, baseForm()), {});
  assert.ok("contato_nome" in validarEtapa(1, baseForm({ contato_nome: "  " })));
  assert.deepEqual(validarEtapa(1, baseForm({ tipo_pessoa: "pf", nome: "João da Silva", documento: CPF_OK, contato_nome: "" })), {});
});
caso("etapa 1: documento conforme o tipo (CPF no lugar de CNPJ e vice-versa falham), telefone, e-mails", () => {
  assert.ok("documento" in validarEtapa(1, baseForm({ documento: CPF_OK })), "CPF em PJ");
  assert.ok("documento" in validarEtapa(1, baseForm({ tipo_pessoa: "pf", documento: CNPJ_OK })), "CNPJ em PF");
  assert.ok("documento" in validarEtapa(1, baseForm({ documento: "11.222.333/0001-80" })));
  assert.ok("telefone" in validarEtapa(1, baseForm({ telefone: "123" })));
  assert.ok("email" in validarEtapa(1, baseForm({ email: "sem-arroba" })));
  assert.ok("email_nf" in validarEtapa(1, baseForm({ mesmo_email: false, email_nf: "" })));
  assert.deepEqual(validarEtapa(1, baseForm({ mesmo_email: true, email_nf: "" })), {}, "usar o mesmo e-mail dispensa o campo");
  assert.ok(Object.keys(validarEtapa(1, baseForm({ nome: "", documento: "", telefone: "", email: "" }))).join() === "nome,documento,telefone,email", "ordem dos erros = ordem da tela");
});
caso("etapas 2 a 4: obrigatórios, limites e aceite", () => {
  assert.ok("cargo" in validarEtapa(2, baseForm({ cargo: "" })));
  assert.ok("cargo" in validarEtapa(2, baseForm({ cargo: "x".repeat(121) })));
  assert.ok("num_posicoes" in validarEtapa(2, baseForm({ num_posicoes: "0" })));
  assert.ok("num_posicoes" in validarEtapa(2, baseForm({ num_posicoes: "100" })));
  assert.ok("cidade" in validarEtapa(2, baseForm({ cidade: "" })));
  assert.ok("estado" in validarEtapa(2, baseForm({ estado: "" })));
  assert.deepEqual(validarEtapa(2, baseForm()), {});
  assert.ok("habilitacao_categoria" in validarEtapa(3, baseForm({ habilitacao: "sim", habilitacao_categoria: "" })));
  assert.deepEqual(validarEtapa(3, baseForm({ habilitacao: "sim", habilitacao_categoria: "B" })), {});
  assert.ok("aceite" in validarEtapa(4, baseForm({ aceite: false })));
  assert.equal(validarTudo(baseForm()), null);
  assert.equal(validarTudo(baseForm({ cidade: "" }))?.etapa, 2);
});
caso("formularioPreenchido: vazio não avisa; digitar algo avisa; nome vindo do link não conta", () => {
  assert.equal(formularioPreenchido(formularioInicial(null), null), false);
  assert.equal(formularioPreenchido(formularioInicial("Acme"), "Acme"), false);
  assert.equal(formularioPreenchido({ ...formularioInicial("Acme"), cargo: "Motorista" }, "Acme"), true);
  assert.equal(formularioPreenchido({ ...formularioInicial(null), sexo: "fem" }, null), true);
});

// ── Corpo de envio × schema do servidor ──────────────────────────────────────
caso("corpo de envio completo passa no schema público e leva só o permitido", () => {
  const form = baseForm({
    local_trabalho: "Rua A, 10", previsao_inicio: "2026-11-10", salario: "2500", sexo: "fem", idade: "até 35", pcd: "sim",
    habilitacao: "sim", habilitacao_categoria: "B", veiculo_proprio: "sim",
    horario: { ...HORARIO_VAZIO, tipo: "seg_sex", entrada: "08:00", saida: "17:00" },
    beneficios: { chips: { "Vale Transporte": true }, custom: ["Auxílio creche"] },
    requisitos: { chips: { "CNH B": true }, cursos: {}, condicoes: {}, custom: ["Boa comunicação"] },
  });
  const r = publicoSolicitarVagaSchema.safeParse(montarCorpoEnvio(form));
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
  if (r.success) {
    assert.equal(r.data.habilitacao_categoria, "B");
    assert.equal(r.data.num_posicoes, 1);
    assert.deepEqual(r.data.requisitos_chips, ["CNH B", "Boa comunicação"]);
    assert.equal(r.data.contato_nome, "Maria Souza");
  }
});
caso("schema público: aceite obrigatório, honeypot aceito (a rota é que descarta), PJ sem contato falha, PF sem contato passa", () => {
  const corpo = montarCorpoEnvio(baseForm());
  assert.ok(!publicoSolicitarVagaSchema.safeParse({ ...corpo, aceite_condicoes: false }).success);
  const semAceite: Record<string, unknown> = { ...corpo };
  delete semAceite.aceite_condicoes;
  assert.ok(!publicoSolicitarVagaSchema.safeParse(semAceite).success);
  assert.ok(publicoSolicitarVagaSchema.safeParse({ ...corpo, website: "http://spam" }).success);
  assert.ok(!publicoSolicitarVagaSchema.safeParse({ ...corpo, contato_nome: null }).success, "PJ sem contato");
  const pf = montarCorpoEnvio(baseForm({ tipo_pessoa: "pf", nome: "João", documento: CPF_OK }));
  assert.equal(pf.contato_nome, null);
  assert.ok(publicoSolicitarVagaSchema.safeParse(pf).success, "PF sem contato");
  assert.ok(!publicoSolicitarVagaSchema.safeParse({ ...pf, documento: CNPJ_OK.replace(/\D/g, "") }).success, "CNPJ em PF");
});
caso("schema público: limite em TODOS os textos, e-mail/CNPJ/telefone/UF inválidos, valores fora da lista", () => {
  const corpo = montarCorpoEnvio(baseForm());
  const falha = (parcial: Record<string, unknown>) => !publicoSolicitarVagaSchema.safeParse({ ...corpo, ...parcial }).success;
  const longo = (n: number) => "x".repeat(n + 1);
  const limites: [string, number][] = [
    ["nome", 150], ["contato_nome", 120], ["endereco", 300], ["cargo", 120], ["cidade", 100], ["local_trabalho", 300], ["salario", 100],
    ["adicionais_salariais", 300], ["horario_tipo", 40], ["horario_texto", 300], ["requisitos", 3000], ["beneficios", 2000],
    ["principais_atividades", 3000], ["observacoes", 2000], ["idade", 60],
  ];
  for (const [campo, max] of limites) assert.ok(falha({ [campo]: longo(max) }), `${campo} > ${max}`);
  assert.ok(falha({ email: `${"a".repeat(145)}@exemplo.com.br` }), "e-mail longo");
  assert.ok(falha({ email: "sem-arroba" }));
  assert.ok(falha({ email_nf: "x" }));
  assert.ok(falha({ telefone: "123" }));
  assert.ok(falha({ estado: "XX" }));
  assert.ok(falha({ num_posicoes: 0 }) && falha({ num_posicoes: 100 }) && falha({ num_posicoes: 1.5 }));
  assert.ok(falha({ sexo: "outro" }) && falha({ pcd: "talvez" }) && falha({ veiculo_proprio: "x" }) && falha({ tipo_pessoa: "mei" }));
  assert.ok(falha({ habilitacao_categoria: "Z" }));
  assert.ok(falha({ previsao_inicio: "amanhã" }));
  assert.ok(falha({ documento: "11.222.333/0001-80" }));
  assert.ok(falha({ requisitos_chips: Array(61).fill("a") }));
  assert.ok(falha({ requisitos_chips: ["x".repeat(201)] }));
  assert.ok(falha({ beneficios_chips: Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`b${i}`, true])) }));
});

// ── Rotas (banco em memória) ─────────────────────────────────────────────────
const U1 = "unid-1";
const U2 = "unid-2";
const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const TOKEN_B = "tok_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const FUTURO = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
const PASSADO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
function linhaLink(extra: Record<string, unknown> = {}) {
  return {
    id: "link-1", token: TOKEN, unidade_id: U1, nome_empresa: "Acme Indústria", criado_por_user_id: "user-1", criado_por_nome: "Ana", expira_em: FUTURO,
    revogado_em: null, usos: 0, created_at: new Date().toISOString(), condicoes: { ...PADROES_RS, taxa_sem_reposicao_pct: 40, taxa_cancelamento_pct: 0 },
    clausulas_adicionais: ["Cláusula extra"], ...extra,
  };
}
function novoBanco(links: Record<string, unknown>[] = [linhaLink()]) {
  return criarDb({
    solicitacao_vaga_links: links,
    solicitacoes_vagas: [],
    notificacoes_analista: [],
    analistas_perfil: [
      { id: "a1", user_id: "user-1", unidade_id: U1, acesso_todas_unidades: false, nome_completo: "Ana Analista", ativo: true, nivel_acesso: "analista" },
      { id: "a2", user_id: "user-2", unidade_id: U2, acesso_todas_unidades: false, nome_completo: "Bia Outra Unidade", ativo: true, nivel_acesso: "analista" },
    ],
  });
}
async function chamarRota(db: any, fn: (...a: any[]) => Promise<Response>, { metodo = "GET", url = "http://x/api", corpo, token = TOKEN, usuario = null, ip }: { metodo?: string; url?: string; corpo?: unknown; token?: string; usuario?: string | null; ip?: string } = {}) {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: "analista" } } : null;
  (globalThis as any).__DB__ = db;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  const req = Object.assign(new Request(url, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { nextUrl: new URL(url) });
  const r = await fn(req, { params: Promise.resolve({ token }) });
  return { status: r.status, body: await r.json() };
}
const postPublico = (db: any, corpo: unknown, opcoes: { token?: string; ip?: string } = {}) => chamarRota(db, rotaPublica.POST, { metodo: "POST", corpo, ...opcoes });
const corpoValido = (extra: Record<string, unknown> = {}) => ({ ...montarCorpoEnvio(baseForm({ nome: "Cliente Digitado SA", requisitos: { chips: { "CNH B": true }, cursos: {}, condicoes: {}, custom: [] }, sexo: "masc", idade: "até 40" })), ...extra });

const esperarPendentes = async () => { await Promise.all((globalThis as any).__PENDENTES__ ?? []); };
const silencio = console.error;
console.error = () => undefined; // as rotas registram falhas de notificação (sem banco de avisos aqui); o que importa é o resultado
await casoRota("GET público: link válido devolve nome e o texto numerado já renderizado (taxa 0 = sem cláusula de cancelamento; adicional em 1.7)", async () => {
  const r = await chamarRota(novoBanco(), rotaPublica.GET);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.nome_empresa, "Acme Indústria");
  assert.equal(r.body.data.condicoes.taxa_sem_reposicao_pct, 40);
  const itens = r.body.data.itens as { numero: string; texto: string }[];
  assert.ok(!itens.some((i) => i.texto.includes("cancelado ou congelado")));
  assert.deepEqual(itens.at(-1), { numero: "1.7", texto: "Cláusula extra" });
  assert.ok(!("token" in r.body.data) && !("unidade_id" in r.body.data) && !("id" in r.body.data), "só o necessário");
});
await casoRota("GET público: inexistente (404), expirado, revogado e no limite (410), todos com a mesma mensagem amigável", async () => {
  assert.equal((await chamarRota(novoBanco(), rotaPublica.GET, { token: "tok_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ" })).status, 404);
  assert.equal((await chamarRota(novoBanco(), rotaPublica.GET, { token: "curto" })).status, 404, "formato inválido nem consulta o banco");
  for (const extra of [{ expira_em: PASSADO }, { revogado_em: PASSADO }, { usos: MAX_USOS_LINK }]) {
    const r = await chamarRota(novoBanco([linhaLink(extra)]), rotaPublica.GET);
    assert.equal(r.status, 410);
    assert.equal(r.body.error, MENSAGEM_LINK_INDISPONIVEL);
  }
});
await casoRota("POST público: grava na fila (cliente_id nulo, R&S fixo, origem link, snapshot do LINK, IP do 1º x-forwarded-for) e conta o uso", async () => {
  const db = novoBanco();
  const r = await postPublico(db, corpoValido({ tipo_servico: "terceirizacao", unidade_id: U2, condicoes: { taxa_sem_reposicao_pct: 1 }, condicoes_aceitas: { forjado: true } }), { ip: "203.0.113.7, 10.0.0.1" });
  assert.equal(r.status, 201);
  const sol = db.tabelas.solicitacoes_vagas;
  assert.equal(sol.length, 1);
  const s = sol[0];
  assert.equal(s.cliente_id, null);
  assert.equal(s.solicitado_por_user_id, null);
  assert.equal(s.tipo_servico, "recrutamento_selecao");
  assert.equal(s.unidade_id, U1, "unidade vem do link");
  assert.equal(s.origem, "link_publico");
  assert.equal(s.link_id, "link-1");
  assert.equal(s.cliente_nome, "Cliente Digitado SA");
  assert.equal(s.confidencial, false);
  assert.equal(s.aceite_ip, "203.0.113.7");
  assert.ok(s.aceite_taxa_cancelamento_em);
  assert.equal(s.condicoes_aceitas.condicoes.taxa_sem_reposicao_pct, 40, "condições do link, nunca as do corpo");
  assert.equal(s.condicoes_aceitas.condicoes.taxa_cancelamento_pct, 0);
  assert.equal(s.condicoes_aceitas.link_id, "link-1");
  assert.equal(s.condicoes_aceitas.itens.at(-1).numero, "1.7");
  assert.equal(s.dados_empresa.cnpj_cpf, CNPJ_OK, "documento gravado com máscara");
  assert.equal(s.dados_empresa.tipo_pessoa, "pj");
  assert.deepEqual(Object.keys(s.perfil_extra).sort(), ["habilitacao_categoria", "idade", "local_trabalho", "pcd", "sexo", "veiculo_proprio"]);
  assert.equal(s.perfil_extra.sexo, "masc");
  assert.equal(db.tabelas.solicitacao_vaga_links[0].usos, 1);
});
await casoRota("POST público: PF sem contato grava; honeypot responde 201 mas NÃO grava nem conta uso", async () => {
  const db = novoBanco();
  const pf = await postPublico(db, montarCorpoEnvio(baseForm({ tipo_pessoa: "pf", nome: "João da Silva", documento: CPF_OK, contato_nome: "" })));
  assert.equal(pf.status, 201);
  assert.equal(db.tabelas.solicitacoes_vagas[0].dados_empresa.tipo_pessoa, "pf");
  assert.equal(db.tabelas.solicitacoes_vagas[0].dados_empresa.cnpj_cpf, CPF_OK);
  const antes = db.tabelas.solicitacoes_vagas.length;
  const robo = await postPublico(db, corpoValido({ website: "http://spam.example" }));
  assert.equal(robo.status, 201);
  assert.equal(db.tabelas.solicitacoes_vagas.length, antes);
  assert.equal(db.tabelas.solicitacao_vaga_links[0].usos, 1);
});
await casoRota("POST público: sem aceite → 400 e nada muda; link expirado/revogado → 410 sem gravar", async () => {
  const db = novoBanco();
  const semAceite = await postPublico(db, corpoValido({ aceite_condicoes: false }));
  assert.equal(semAceite.status, 400);
  assert.equal(db.tabelas.solicitacoes_vagas.length, 0);
  assert.equal(db.tabelas.solicitacao_vaga_links[0].usos, 0, "validação falhou: o envio não é consumido");
  for (const extra of [{ expira_em: PASSADO }, { revogado_em: PASSADO }]) {
    const bloqueado = novoBanco([linhaLink(extra)]);
    const r = await postPublico(bloqueado, corpoValido());
    assert.equal(r.status, 410);
    assert.equal(bloqueado.tabelas.solicitacoes_vagas.length, 0);
  }
  assert.equal((await postPublico(novoBanco(), "texto")).status, 400);
});
await casoRota("POST público: teto de 30 envios por link — o 31º é recusado e nada é gravado", async () => {
  const db = novoBanco();
  for (let i = 0; i < MAX_USOS_LINK; i++) assert.equal((await postPublico(db, corpoValido())).status, 201, `envio ${i + 1}`);
  assert.equal(db.tabelas.solicitacao_vaga_links[0].usos, MAX_USOS_LINK);
  const extra = await postPublico(db, corpoValido());
  assert.equal(extra.status, 410);
  assert.equal(extra.body.error, MENSAGEM_LINK_INDISPONIVEL);
  assert.equal(db.tabelas.solicitacoes_vagas.length, MAX_USOS_LINK);
  assert.equal((await chamarRota(db, rotaPublica.GET)).status, 410, "a página pública também passa a mostrar indisponível");
});
await casoRota("POST público: falha ao gravar devolve o envio ao link e responde 500 sem vazar dados", async () => {
  const db = novoBanco();
  db.falhas["solicitacoes_vagas.insert"] = "falha simulada com 11.222.333/0001-81";
  const r = await postPublico(db, corpoValido());
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes("11.222"));
  assert.equal(db.tabelas.solicitacao_vaga_links[0].usos, 0);
});
await casoRota("rota do analista: gera link na unidade de quem gera, com condições (padrão se omitidas, taxa em branco = 0) e sem expor o token na auditoria", async () => {
  const db = novoBanco([]);
  const sem = await chamarRota(db, rotaLinks.POST, { metodo: "POST", usuario: "user-1", corpo: {} });
  assert.equal(sem.status, 201);
  const criado = db.tabelas.solicitacao_vaga_links[0];
  assert.equal(criado.unidade_id, U1);
  assert.equal(criado.criado_por_user_id, "user-1");
  assert.match(criado.token, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(criado.condicoes, PADROES_RS);
  assert.ok(sem.body.data.url.endsWith(`/solicitar-vaga/${criado.token}`));
  assert.ok(new Date(criado.expira_em).getTime() > Date.now() + 14 * 24 * 3600 * 1000, "15 dias por padrão");
  const comTaxaVazia = await chamarRota(db, rotaLinks.POST, { metodo: "POST", usuario: "user-1", corpo: { validade_dias: 7, condicoes: { taxa_cancelamento_pct: "" }, clausulas_adicionais: ["x"] } });
  assert.equal(comTaxaVazia.status, 201);
  assert.strictEqual(db.tabelas.solicitacao_vaga_links[1].condicoes.taxa_cancelamento_pct, 0);
  assert.equal((await chamarRota(db, rotaLinks.POST, { metodo: "POST", usuario: "user-1", corpo: { validade_dias: 99 } })).status, 400);
  assert.equal((await chamarRota(db, rotaLinks.POST, { metodo: "POST", usuario: null, corpo: {} })).status, 401);
  await esperarPendentes();
  const auditorias = db.tabelas.audit_logs.filter((a: any) => a.acao === "solicitacao_link_criado");
  assert.equal(auditorias.length, 2);
  assert.deepEqual(Object.keys(auditorias[1].detalhes).sort(), ["clausulas_adicionais", "condicoes", "validade_dias"]);
  assert.strictEqual(auditorias[1].detalhes.condicoes.taxa_cancelamento_pct, 0);
  for (const a of auditorias) assert.ok(!JSON.stringify(a).includes(db.tabelas.solicitacao_vaga_links[0].token) && !JSON.stringify(a).includes(db.tabelas.solicitacao_vaga_links[1].token), "token fora da auditoria");
});
await casoRota("rota do analista: lista só os links da própria unidade; revogar de outra unidade = 404; revogar de verdade derruba o link público", async () => {
  const ID1 = "00000000-0000-4000-8000-000000000001";
  const ID2 = "00000000-0000-4000-8000-0000000000b2";
  const db = novoBanco([linhaLink({ id: ID1 }), linhaLink({ id: ID2, token: TOKEN_B, unidade_id: U2, nome_empresa: "Outra" })]);
  const lista = await chamarRota(db, rotaLinks.GET, { usuario: "user-1" });
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.body.data.map((l: any) => l.id), [ID1]);
  assert.equal(lista.body.data[0].status, "ativo");
  assert.equal(lista.body.data[0].max_usos, MAX_USOS_LINK);
  assert.equal((await chamarRota(db, rotaLinks.PATCH, { metodo: "PATCH", usuario: "user-2", corpo: { id: ID1 } })).status, 404, "analista de outra unidade não revoga");
  assert.equal((await chamarRota(db, rotaLinks.PATCH, { metodo: "PATCH", usuario: "user-1", corpo: { id: ID2 } })).status, 404, "link de outra unidade");
  assert.equal(db.tabelas.solicitacao_vaga_links[0].revogado_em, null);
  assert.equal((await chamarRota(db, rotaLinks.PATCH, { metodo: "PATCH", usuario: "user-1", corpo: { id: "nao-e-uuid" } })).status, 400);
  const ok = await chamarRota(db, rotaLinks.PATCH, { metodo: "PATCH", usuario: "user-1", corpo: { id: ID1 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.status, "revogado");
  assert.equal((await chamarRota(db, rotaPublica.GET)).status, 410, "o link público deixa de abrir");
  const via = await chamarRota(db, rotaLinks.DELETE, { metodo: "DELETE", usuario: "user-1", url: `http://x/api?id=${ID1}` });
  assert.equal(via.status, 200, "revogar de novo é idempotente");
  await esperarPendentes();
  assert.equal(db.tabelas.audit_logs.filter((a: any) => a.acao === "solicitacao_link_revogado").length, 1, "audita só a primeira revogação");
});

// ── Salário: mesmo formato gravado do portal + o servidor só aceita o que o seletor gera ───────────────────────────────────
import { salarioParaEnvio, salarioLegivel, escolherOpcaoSalario, opcaoSalarioAtual, salarioPublicoValido } from "../src/lib/solicitacaoVagaPublicaForm";
caso("salário: valor por mês, por hora, à combinar, pretensão e vazio geram o mesmo texto do portal", () => {
  const f = formularioInicial(null);
  const mes = escolherOpcaoSalario(f, "mes");
  assert.equal(salarioParaEnvio({ ...mes, salario: "2500" }), "2500");
  assert.equal(salarioLegivel({ ...mes, salario: "2500" })?.replace(/\u00a0/g, " "), "R$ 2.500,00 por mês");
  const hora = escolherOpcaoSalario(f, "hora");
  assert.equal(opcaoSalarioAtual(hora), "hora");
  assert.equal(salarioParaEnvio({ ...hora, salario: "9.5" }), formatarSalarioHora(9.5));
  assert.equal(salarioParaEnvio({ ...hora, salario: "9.5" }), "R$ 9,50/hora");
  assert.equal(salarioLegivel({ ...hora, salario: "9.5" })?.replace(/\u00a0/g, " "), "R$ 9,50 por hora");
  const comb = escolherOpcaoSalario(f, "a_combinar");
  assert.equal(salarioParaEnvio(comb), CONST_A_COMBINAR);
  assert.equal(salarioLegivel(comb), "À combinar");
  assert.equal(salarioParaEnvio(escolherOpcaoSalario(f, "pretensao")), CONST_PRETENSAO);
  assert.equal(salarioParaEnvio(mes), null);
  assert.equal(salarioParaEnvio({ ...hora, salario: "0" }), null);
  // trocar de opção zera o valor; clicar na opção já escolhida preserva o que foi digitado
  assert.equal(escolherOpcaoSalario({ ...mes, salario: "2500" }, "hora").salario, "");
  assert.equal(escolherOpcaoSalario({ ...mes, salario: "2500" }, "mes").salario, "2500");
});
caso("salário: o corpo de envio leva o formato do portal e Adicionais só no valor fixo", () => {
  const hora = { ...escolherOpcaoSalario(formularioInicial(null), "hora"), salario: "9.5" };
  const corpo = montarCorpoEnvio(baseForm({ ...hora, adicionais_salariais: "comissão" })) as any;
  assert.equal(corpo.salario, "R$ 9,50/hora");
  assert.equal(corpo.adicionais_salariais, "comissão");
  const comb = montarCorpoEnvio(baseForm({ ...escolherOpcaoSalario(formularioInicial(null), "a_combinar"), adicionais_salariais: "comissão" })) as any;
  assert.equal(comb.salario, CONST_A_COMBINAR);
  assert.equal(comb.adicionais_salariais, null);
});
caso("salário no servidor: aceita só número positivo, R$ x,xx/hora, as duas sentinelas ou vazio", () => {
  const corpo = montarCorpoEnvio(baseForm());
  const ok = (v: unknown) => publicoSolicitarVagaSchema.safeParse({ ...corpo, salario: v }).success;
  for (const v of ["2500", "2500.5", "R$ 9,50/hora", "R$ 1.234,56/hora", CONST_A_COMBINAR, CONST_PRETENSAO, "", null]) assert.ok(ok(v), String(v));
  for (const v of ["R$ 2.500,00", "uns 3 mil", "0", "-5", "R$ 0,00/hora", "R$ 9,5/hora", "2500,00", "1e3", "Salário a combinar"]) assert.ok(!ok(v), String(v));
  const r = publicoSolicitarVagaSchema.safeParse({ ...corpo, salario: "uns 3 mil" });
  assert.ok(!r.success && r.error.issues.some((i) => i.message === "Informe o salário pelas opções do formulário."));
  assert.equal(salarioPublicoValido("2500"), true);
});

console.error = silencio;

console.log(`\n${total} casos OK`);
