// Aviso (nunca bloqueio) quando o texto PÚBLICO de uma vaga CONFIDENCIAL cita o nome do cliente: helper puro (src/lib/clienteNoTextoPublico.ts) com nomes reais
// de cliente, a confirmação "Revisar" / "Salvar mesmo assim" nos modais de vaga e o aviso depois de salvar na aprovação de solicitação.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-cliente-no-texto-publico.mts
// Opcional (conferência contra dados reais, somente leitura, arquivos JSON fora do repositório):
//   CLIENTES_JSON=<lista de nomes de clientes>  VAGAS_CONFIDENCIAIS_JSON=<vagas confidenciais com os campos de texto>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  CAMPOS_TEXTO_PUBLICO,
  detectarClienteNoTextoPublico,
  mensagemAntesDeSalvar,
  mensagemDepoisDeSalvar,
  variantesDoCliente,
} from "../src/lib/clienteNoTextoPublico";
import AvisoClienteNoTextoPublico from "../src/components/AvisoClienteNoTextoPublico";

let total = 0;
async function ok(nome: string, fn: () => Promise<void> | void) {
  await fn();
  total++;
  console.log(`OK    ${nome}`);
}
const lerFonte = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");

const achar = (nome: string, texto: string, campo = "requisitos", extra: Record<string, unknown> = {}) =>
  detectarClienteNoTextoPublico({ confidencial: true, campos: { [campo]: texto }, nomesDoCliente: [nome], ...extra });
const cita = (nome: string, texto: string, campo = "requisitos") => achar(nome, texto, campo).length > 0;

const NOVACKI = "Novacki Papel e Embalagens S/A";
const NATURAL = "NATURAL LABOUR (United Mills) LTDA";
const MIABUELA = "Produtos Alimenticios Argentinos - MIABUELA";

await ok("Novacki: nome citado (qualquer caixa, com ou sem acento) é achado e o trecho volta como digitado", () => {
  const a = achar(NOVACKI, "Atuar na Novacki, em Monte Mor", "principais_atividades");
  assert.deepEqual(a.map((x) => [x.campo, x.rotulo, x.trecho]), [["principais_atividades", "Principais atividades", "Novacki"]]);
  assert.ok(cita(NOVACKI, "Vaga NOVACKI"), "caixa alta");
  assert.ok(cita(NOVACKI, "vaga novacki"), "caixa baixa");
  assert.ok(cita(NOVACKI, "Vaga na Nóvacki"), "acento diferente");
  assert.ok(cita("Gusfer Indústria e Comercio Ltda", "trabalhar na INDÚSTRIA GUSFER?"), "acento e caixa na primeira palavra distintiva");
  assert.ok(cita("Maxsoy Alimentos ", "Vaga na MÁXSOY"), "MÁXSOY sem acento = maxsoy");
});

await ok("palavra INTEIRA: não casa dentro de outra palavra (Petix em 'competix', BioSafe em 'biosafety')", () => {
  assert.ok(cita("Petix", "Petix"));
  assert.ok(cita("Petix", "vaga (Petix), Monte Mor"), "pontuação em volta não atrapalha");
  assert.equal(cita("Petix", "competix e petixx"), false);
  assert.ok(cita("BioSafe", "BIOSAFE"));
  assert.equal(cita("BioSafe", "normas de biosafety"), false);
  assert.equal(cita(NOVACKI, "novackinho"), false);
  assert.equal(cita(NOVACKI, "renovacki"), false);
});

await ok("sufixo societário ignorado (ltda, s/a, sa, me, epp, eireli, cia, 'N. EIRELI'); o nome sem sufixo é a variante", () => {
  assert.ok(variantesDoCliente("Brastrafo do Brasil Ltda").some((v) => v.join(" ") === "brastrafo do brasil"));
  assert.ok(cita("Brastrafo do Brasil Ltda", "Brastrafo do Brasil"));
  assert.ok(cita("Brastrafo do Brasil Ltda", "Brastrafo"), "primeira palavra distintiva (7 letras)");
  assert.equal(cita("Brastrafo do Brasil Ltda", "empresa do Brasil"), false);
  assert.ok(variantesDoCliente(NOVACKI).every((v) => !["sa", "s"].includes(v[v.length - 1])), "o 'S/A' sai");
  assert.ok(variantesDoCliente("Rogon Serviços de Gestão N. EIRELI").some((v) => v.join(" ") === "rogon servicos de gestao"), "'N. EIRELI' sai inteiro");
  assert.equal(cita("Rogon Serviços de Gestão N. EIRELI", "ltda eireli epp"), false, "sufixo sozinho nunca casa");
});

await ok("parênteses e hífen: cada trecho é uma variante (United Mills, MIABUELA); o nome completo também", () => {
  assert.ok(cita(NATURAL, "empresa United Mills"));
  assert.ok(cita(NATURAL, "Natural Labour"));
  assert.ok(cita(NATURAL, "labour"), "'natural' é genérica, então a primeira palavra distintiva do nome é 'labour' (6 letras)");
  assert.equal(cita(NATURAL, "united"), false, "palavra solta de dentro do parêntese não basta");
  assert.equal(cita(NATURAL, "mills"), false);
  assert.equal(cita(NATURAL, "gás natural e united states"), false);
  assert.ok(cita(MIABUELA, "MIABUELA"));
  assert.equal(cita(MIABUELA, "Mi Abuela"), false, "grafia diferente (com espaço) não é detectada: limite conhecido da regra");
  assert.ok(cita(MIABUELA, "Produtos Alimenticios Argentinos"));
  assert.equal(cita(MIABUELA, "produtos de limpeza"), false, "'produtos' é genérica");
  assert.equal(cita("Hífen-dentro Da Palavra", "hifen"), false, "hífen colado na palavra não separa nome");
});

await ok("Haras Larissa: só a frase inteira; 'Larissa' ou 'haras' sozinhas não avisam", () => {
  assert.ok(cita("Haras Larissa", "Haras Larissa"));
  assert.ok(cita("Haras Larissa", "complexo do HARAS   LARISSA."), "espaços e caixa");
  assert.equal(cita("Haras Larissa", "Larissa"), false);
  assert.equal(cita("Haras Larissa", "trabalho em haras de cavalos"), false);
  assert.equal(variantesDoCliente("Haras Larissa").length, 1, "'haras' tem 5 letras < 6: não vira primeira palavra distintiva");
});

await ok("espaço sobrando no nome ('Trafocare ') e tabs não atrapalham; nome vazio/nulo não gera variante", () => {
  assert.ok(cita("Trafocare ", "Vaga na Trafocare"));
  assert.ok(cita("Marmoraria Divgran\t\t\t", "Divgran"), "'marmoraria' é genérica: a primeira palavra distintiva é 'divgran'");
  assert.equal(cita("Marmoraria Divgran\t\t\t", "marmoraria"), false);
  assert.deepEqual(variantesDoCliente(null), []);
  assert.deepEqual(variantesDoCliente("   "), []);
  assert.deepEqual(variantesDoCliente(undefined), []);
});

await ok("texto SEM o nome não avisa; texto vazio/nulo também", () => {
  assert.deepEqual(achar(NOVACKI, "Ensino Médio completo e experiência na função"), []);
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: true, campos: { titulo: null, requisitos: "", beneficios: undefined }, nomesDoCliente: [NOVACKI] }), []);
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: true, campos: {}, nomesDoCliente: [] }), []);
});

await ok("palavra GENÉRICA não avisa: papel, embalagens, saúde, novos, tempos, comércio, serviços, brasil, natural", () => {
  for (const t of ["papel", "embalagens", "Saúde", "novos", "tempos", "Comércio", "serviços", "Brasil", "natural", "industria", "empilhadeiras", "salmazos"])
    for (const n of [NOVACKI, "Novos Tempos Comercio e Serviços LTDA", "Rosakline | Odontologia | Saúde | Estética", "CBP BRASIL", "Salmazos RH e Serviços Terceirizados Ltda."])
      assert.equal(cita(n, `vaga de ${t}`), false, `${n} / ${t}`);
});

await ok("falsos positivos: 'Novos Tempos' (palavras comuns) não avisa; o nome completo digitado, sim", () => {
  const nome = "Novos Tempos Comercio e Serviços LTDA";
  assert.equal(cita(nome, "Novos tempos exigem novos profissionais"), false);
  assert.equal(cita(nome, "comércio e serviços"), false);
  assert.equal(cita(nome, "Novos Tempos"), false);
  assert.ok(cita(nome, "Novos Tempos Comércio e Serviços"), "o nome inteiro digitado é inequívoco");
  assert.equal(cita("Campos e Alves Confeitaria (Padaria Donna Cereja)", "Campos do Jordão"), false, "'campos' é genérica");
  assert.ok(cita("Campos e Alves Confeitaria (Padaria Donna Cereja)", "Padaria Donna Cereja"));
  assert.equal(cita("Cliente Teste", "cliente teste"), false);
  assert.equal(cita("Studio Capricho", "studio de pilates"), false);
  assert.equal(cita("Studio Capricho", "trabalho com capricho e atenção"), false, "'capricho' é palavra comum: sozinha não avisa");
  assert.deepEqual(variantesDoCliente("Studio Capricho"), [["studio", "capricho"]], "só a frase inteira");
  assert.ok(cita("Studio Capricho", "Vaga no Studio Capricho"), "a frase inteira continua detectada");
  assert.ok(cita("Columbia Machine Brasil", "Columbia"), "columbia e labour continuam como primeira palavra distintiva");
  assert.ok(cita("Natural Labour", "labour"));
  assert.equal(cita("Fazendinha Resort Prive", "fazendinha"), false);
});

await ok("variante de UMA palavra exige 5 letras ou mais: 'Petix' (5) entra, 'COPI' (4) e 'Rogon' só pela frase", () => {
  assert.ok(variantesDoCliente("Petix").length === 1);
  assert.equal(cita("COPI Serviços Contábeis Ltda", "copi"), false);
  assert.ok(cita("COPI Serviços Contábeis Ltda", "COPI Serviços Contábeis"));
  assert.equal(cita("Rogon Serviços de Gestão N. EIRELI", "Rogon"), false, "5 letras mas é primeira distintiva (<6): só a frase");
  assert.ok(cita("Rogon Serviços de Gestão N. EIRELI", "Rogon Serviços de Gestão"));
  assert.equal(cita("Vetta Química ", "vetta"), false);
});

await ok("só vale com confidencial = true; vaga não confidencial NUNCA gera aviso (mesmo citando o cliente)", () => {
  const base = { campos: { titulo: "Auxiliar na Novacki" }, nomesDoCliente: [NOVACKI] };
  assert.equal(detectarClienteNoTextoPublico({ confidencial: true, ...base }).length, 1);
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: false, ...base }), []);
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: null, ...base }), []);
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: undefined, ...base }), []);
});

await ok("vaga confidencial PRIVADA (visivel_publicamente=false) não tem página pública: sem aviso; pública ou sem o campo: avisa", () => {
  const base = { confidencial: true, campos: { titulo: "Auxiliar na Novacki" }, nomesDoCliente: [NOVACKI] };
  assert.deepEqual(detectarClienteNoTextoPublico({ ...base, visivelPublicamente: false }), []);
  assert.equal(detectarClienteNoTextoPublico({ ...base, visivelPublicamente: true }).length, 1);
  assert.equal(detectarClienteNoTextoPublico(base).length, 1);
});

await ok("observacoes e descricao são IGNORADOS (não aparecem no site público); só os 9 campos públicos entram", () => {
  const campos = { titulo: "Auxiliar", observacoes: "cliente Novacki", descricao: "Novacki Papel" } as never;
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: true, campos, nomesDoCliente: [NOVACKI] }), []);
  assert.deepEqual(Object.keys(CAMPOS_TEXTO_PUBLICO), ["titulo", "cidade", "estado", "salario", "adicionais_salariais", "horario", "requisitos", "beneficios", "principais_atividades"]);
  // Confere contra a página pública: tudo que ela mostra está na lista e observacoes não é renderizado.
  const detalhe = lerFonte("src/app/vagas/[slug]/page.tsx");
  for (const c of ["titulo", "cidade", "salario", "adicionais_salariais", "horario", "requisitos", "beneficios", "principais_atividades"]) assert.ok(detalhe.includes(`vaga.${c}`), c);
  assert.equal(detalhe.includes("vaga.observacoes"), false, "a página pública não renderiza observacoes");
});

await ok("vários campos citando: um achado por campo, na ordem da página, com o rótulo em português", () => {
  const a = detectarClienteNoTextoPublico({
    confidencial: true,
    campos: { requisitos: "Experiência", titulo: "Analista Petix", beneficios: "Convênio da PETIX", horario: "08h" },
    nomesDoCliente: ["Petix"],
  });
  assert.deepEqual(a.map((x) => [x.campo, x.rotulo, x.trecho]), [["titulo", "Título", "Petix"], ["beneficios", "Benefícios", "PETIX"]]);
});

await ok("nome do cliente: clientes.nome e, na falta, cliente_nome_temp / cliente_nome (qualquer um dos dois)", () => {
  assert.equal(detectarClienteNoTextoPublico({ confidencial: true, campos: { titulo: "Petix" }, nomesDoCliente: [null, undefined, "Petix"] }).length, 1);
  assert.equal(detectarClienteNoTextoPublico({ confidencial: true, campos: { titulo: "Qualux" }, nomesDoCliente: ["Petix", "Qualux"] }).length, 1);
  assert.deepEqual(detectarClienteNoTextoPublico({ confidencial: true, campos: { titulo: "Petix" }, nomesDoCliente: [null, undefined] }), []);
});

await ok("mensagens em português claro: dizem o campo, o trecho, que a vaga é confidencial e aparece no site público", () => {
  const um = achar("Petix", "Convênio da Petix", "beneficios");
  const antes = mensagemAntesDeSalvar(um);
  assert.ok(antes.includes("confidencial") && antes.includes("site público") && antes.includes('Benefícios ("Petix")') && antes.includes("o campo"), antes);
  const dois = detectarClienteNoTextoPublico({ confidencial: true, campos: { titulo: "Petix", requisitos: "Petix" }, nomesDoCliente: ["Petix"] });
  assert.ok(mensagemAntesDeSalvar(dois).includes("os campos") && mensagemAntesDeSalvar(dois).includes("citam"));
  const depois = mensagemDepoisDeSalvar(um);
  assert.ok(depois.includes("A vaga foi criada") && depois.includes("confidencial") && depois.includes('"Editar"') && depois.includes("Vagas"), depois);
});

await ok("confirmação (SSR): caixa âmbar z-[60], mensagem, e os dois botões 'Revisar' e 'Salvar mesmo assim' (sem botão que bloqueie)", () => {
  const achados = achar("Petix", "Convênio da Petix", "beneficios");
  const html = renderToStaticMarkup(createElement(AvisoClienteNoTextoPublico, { achados, salvando: false, onRevisar: () => {}, onSalvarMesmoAssim: () => {} }));
  assert.ok(html.includes("z-[60]") && html.includes("bg-amber-50") && html.includes("border-amber-200"), "visual da confirmação de modalidade");
  assert.ok(html.includes(">Revisar<") && html.includes(">Salvar mesmo assim<"));
  assert.ok(html.includes("confidencial") && html.includes("site público") && html.includes("Benefícios (&quot;Petix&quot;)"));
  assert.equal(html.includes('disabled=""'), false, "nenhum botão desabilitado quando não está salvando");
  const salvando = renderToStaticMarkup(createElement(AvisoClienteNoTextoPublico, { achados, salvando: true, onRevisar: () => {}, onSalvarMesmoAssim: () => {} }));
  assert.ok(salvando.includes("Salvando..."));
});

await ok("FIAÇÃO nos modais (fonte): checa ANTES de salvar com confidencial + visibilidade, 'Salvar mesmo assim' salva, Revisar só fecha; roda também ao editar vaga existente", () => {
  for (const arq of ["src/components/ModalNovaVaga.tsx", "src/components/ModalEditarVaga.tsx"]) {
    const f = lerFonte(arq);
    assert.ok(f.includes("detectarClienteNoTextoPublico") && f.includes("AvisoClienteNoTextoPublico"), arq);
    assert.ok(f.includes("confidencial: form.confidencial") && f.includes("visivelPublicamente: form.visivel_publicamente"), `${arq}: usa o estado atual do formulário (marcar confidencial numa vaga existente dispara)`);
    assert.ok(f.includes("handleSalvar = async (ignorarAviso = false)"), arq);
    assert.ok(f.includes("onSalvarMesmoAssim={() => handleSalvar(true)}"), `${arq}: 'Salvar mesmo assim' sempre salva`);
    assert.ok(f.includes("onRevisar="), arq);
    assert.equal(/onClick=\{handleSalvar\}/.test(f), false, `${arq}: o clique não pode passar o evento como ignorarAviso`);
    // O aviso vem antes do fetch: nada é salvo enquanto a confirmação está aberta.
    const corpo = f.split("const handleSalvar")[1];
    assert.ok(corpo.indexOf("detectarClienteNoTextoPublico") < corpo.indexOf("fetch("), `${arq}: aviso antes do fetch`);
    // A lista de clientes que o modal já carrega é reusada (sem nova chamada à API).
    assert.ok(f.includes("clientes.find((c) => c.id === form.cliente_id)?.nome"), arq);
  }
  // Editar: a confirmação de modalidade continua antes (o aviso vem depois dela) e o texto dos campos montados é o enviado.
  const ed = lerFonte("src/components/ModalEditarVaga.tsx");
  assert.ok(ed.indexOf("setConfirmModalidade(true)") < ed.indexOf("detectarClienteNoTextoPublico("));
  assert.ok(ed.includes("horario: assembleHorario(), requisitos: assembleRequisitos(), beneficios: assembleBeneficios()"));
});

await ok("FIAÇÃO do servidor (fonte): from-solicitacao devolve avisos[] sem mudar o resto da resposta; ModalSolicitacoesVagas mostra DEPOIS de criar", () => {
  const r = lerFonte("src/app/api/vagas/from-solicitacao/route.ts");
  assert.ok(r.includes("return NextResponse.json({ success: true, vaga_id: vaga.id, avisos }, { status: 201 });"));
  assert.ok(r.includes("if (sol.confidencial === true)") && r.includes("mensagemDepoisDeSalvar(achados)"));
  assert.ok(r.indexOf("avisarSolicitacaoDecidida") < r.indexOf("detectarClienteNoTextoPublico({"), "o aviso é calculado depois de a vaga e a decisão estarem gravadas");
  assert.ok(r.includes("nomesDoCliente: [clienteDaSol?.nome, sol.cliente_nome]"));
  assert.ok(r.includes("requisitos: requisitosDaVaga"), "verifica o MESMO requisitos que foi gravado");
  assert.equal(/catch \(err\) \{\s*console\.error\("\[POST \/api\/vagas\/from-solicitacao\] Erro ao conferir/.test(r), true, "falha na conferência não derruba a resposta");
  const m = lerFonte("src/components/ModalSolicitacoesVagas.tsx");
  assert.ok(m.includes("setAvisosVaga(json.avisos as string[])") && m.includes("Vaga criada, mas confira o texto"));
  assert.ok(m.indexOf('showToast("Vaga criada com sucesso!")') < m.indexOf("setAvisosVaga(json.avisos"), "o sucesso continua aparecendo; o aviso vem depois");
});

await ok("NÃO mexeu no que não devia: importação, criar-vaga de indicação, garantia, admissão rápida, propagação, site público", () => {
  for (const arq of [
    "src/app/api/vagas/importar/route.ts",
    "src/app/api/solicitacoes-indicacao-candidato/[id]/criar-vaga/route.ts",
    "src/app/api/candidatos-vagas/[id]/acionar-garantia/route.ts",
    "src/app/api/admissoes/admissao-rapida/route.ts",
    "src/lib/propagarSolicitacaoNaVaga.ts",
    "src/app/vagas/page.tsx",
    "src/app/vagas/[slug]/page.tsx",
  ]) assert.equal(lerFonte(arq).includes("clienteNoTextoPublico"), false, arq);
  assert.ok(lerFonte("src/lib/indicacaoSemVaga.ts").includes("`observacoes` NÃO aparece na página pública"), "comentário corrigido");
});

// ---- Conferência opcional contra dados reais (somente leitura; arquivos fora do repositório) ----
if (process.env.CLIENTES_JSON) {
  const nomes: string[] = JSON.parse(readFileSync(process.env.CLIENTES_JSON, "utf8"));
  console.log(`\n--- ${nomes.length} nomes de cliente reais: variantes geradas ---`);
  let semVariante = 0;
  for (const n of nomes) {
    const v = variantesDoCliente(n);
    if (v.length === 0) semVariante++;
    console.log(`${n.trim().replace(/\s+/g, " ")}  =>  ${v.length ? v.map((x) => `[${x.join(" ")}]`).join(" ") : "(nenhuma)"}`);
  }
  console.log(`sem nenhuma variante: ${semVariante} de ${nomes.length}`);
  // Variante de UMA palavra: é a de maior risco de falso positivo; lista para revisão.
  const umaPalavra = nomes.flatMap((n) => variantesDoCliente(n).filter((v) => v.length === 1).map((v) => `${v[0]} (${n.trim().replace(/\s+/g, " ")})`));
  console.log(`variantes de UMA palavra (revisar contra palavras comuns): ${umaPalavra.length}`);
  for (const u of umaPalavra) console.log(`   ${u}`);
}
if (process.env.VAGAS_CONFIDENCIAIS_JSON) {
  const vagas = JSON.parse(readFileSync(process.env.VAGAS_CONFIDENCIAIS_JSON, "utf8")) as Array<Record<string, string | boolean | null>>;
  const abertas = vagas.filter((v) => v.status === "aberta");
  const dispara = (v: Record<string, string | boolean | null>) =>
    detectarClienteNoTextoPublico({
      confidencial: v.confidencial as boolean,
      visivelPublicamente: v.visivel as boolean,
      campos: { titulo: v.titulo as string, cidade: v.cidade as string, estado: v.estado as string, salario: v.salario as string, horario: v.horario as string, requisitos: v.requisitos as string, beneficios: v.beneficios as string, principais_atividades: v.principais_atividades as string },
      nomesDoCliente: [v.cliente as string, v.temp as string],
    });
  const d = vagas.filter((v) => dispara(v).length > 0);
  console.log(`\n--- vagas confidenciais reais: ${vagas.length} (abertas: ${abertas.length}); disparariam o aviso: ${d.length} (abertas: ${abertas.filter((v) => dispara(v).length > 0).length}) ---`);
  for (const v of d) console.log(`   ${v.status} | ${v.cliente?.toString().trim()} | ${v.titulo?.toString().trim()} | ${dispara(v).map((a) => `${a.rotulo}="${a.trecho}"`).join("; ")}`);
}

console.log(`\n${total} verificações OK`);
