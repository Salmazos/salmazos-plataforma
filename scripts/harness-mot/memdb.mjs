// Banco em memória que imita só o que as rotas/páginas testadas usam do supabase-js (PostgREST):
// select com embed (inclusive !inner e filtro "tabela.coluna"), insert/update/delete/upsert com .select(),
// single/maybeSingle, eq/neq/in/is/not/gt/gte/lt/lte, order, limit. Mais as regras do banco que importam
// aqui (CHECKs e imutabilidade de funcionario_mot_eventos). NÃO é um banco real — a prova final contra o
// Postgres de verdade continua sendo a migration + o uso na tela.

const RELACOES = {
  rescisoes: { funcionarios: { alvo: "funcionarios", local: "funcionario_id" } },
  funcionarios: { clientes: { alvo: "clientes", local: "cliente_id" } },
  solicitacoes_indicacao_candidato: { vagas: { alvo: "vagas", local: "vaga_id" } },
};

export function criarDb(seed = {}) {
  const tabelas = {};
  for (const [nome, linhas] of Object.entries(seed)) tabelas[nome] = structuredClone(linhas);
  return {
    tabelas,
    consultas: [], // { tabela, op } — prova de "sem N+1"
    falhas: {}, // "tabela.op" -> mensagem (injeção de erro)
    contador: 0,
    usuario: null,
    usuarioPortal: null,
    avisosDisparados: [],
  };
}

function proximoId(db) {
  db.contador += 1;
  return `00000000-0000-4000-8000-${String(db.contador).padStart(12, "0")}`;
}

function dividirTopo(texto) {
  const partes = [];
  let profundidade = 0;
  let atual = "";
  for (const ch of texto) {
    if (ch === "(") profundidade++;
    if (ch === ")") profundidade--;
    if (ch === "," && profundidade === 0) {
      partes.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

function interpretarSelect(cols) {
  const colunas = [];
  const embeds = [];
  for (const parte of dividirTopo(cols ?? "*")) {
    const m = parte.match(/^(?:(\w+):)?(\w+)(!inner)?\(([\s\S]*)\)$/);
    if (m) embeds.push({ alias: m[1] ?? m[2], nome: m[2], inner: !!m[3], cols: m[4] });
    else colunas.push(parte);
  }
  return { colunas, embeds };
}

function projetar(linha, colunas) {
  if (colunas.includes("*") || colunas.length === 0) return { ...linha };
  const saida = {};
  for (const c of colunas) if (c in linha) saida[c] = linha[c];
  return saida;
}

function passa(linha, f) {
  const v = linha[f.col];
  switch (f.op) {
    case "eq": return v === f.val;
    case "neq": return v !== f.val;
    case "in": return f.val.includes(v);
    case "is": return f.val === null ? v === null || v === undefined : v === f.val;
    case "notis": return f.val === null ? !(v === null || v === undefined) : v !== f.val;
    case "gt": return v !== null && v !== undefined && v > f.val;
    case "or": return f.val.some((sub) => passa(linha, sub));
    case "gte": return v !== null && v !== undefined && v >= f.val;
    case "lt": return v !== null && v !== undefined && v < f.val;
    case "lte": return v !== null && v !== undefined && v <= f.val;
    default: throw new Error(`operador não suportado no memdb: ${f.op}`);
  }
}

// Regras do banco real que a migration cria (ver supabase/migration_funcionario_mot_eventos.sql).
function validarMotEvento(l) {
  if (!["prorrogacao", "afastamento_inicio", "afastamento_fim"].includes(l.tipo)) return "check tipo";
  if (l.tipo_beneficio != null && !["auxilio_doenca", "acidentario", "outro"].includes(l.tipo_beneficio)) return "check tipo_beneficio";
  if (l.tipo_beneficio != null && l.tipo !== "afastamento_inicio") return "check beneficio_so_no_inicio";
  if (l.arquivo_path != null && l.tipo !== "prorrogacao") return "check arquivo_so_na_prorrogacao";
  if (l.corrige_evento_id != null && l.corrige_evento_id === l.id) return "check nao_corrige_a_si";
  if (!l.funcionario_id || !l.data_evento) return "not null";
  return null;
}

class Consulta {
  constructor(db, tabela) {
    this.db = db;
    this.tabela = tabela;
    this.op = "select";
    this.cols = "*";
    this.payload = null;
    this.filtros = [];
    this.ordens = [];
    this.limite = null;
    this.retorna = false;
    this.modo = null;
    this.opcoesUpsert = null;
  }
  select(cols) {
    if (this.op === "select") this.cols = cols ?? "*";
    else {
      this.retorna = true;
      this.cols = cols ?? "*";
    }
    return this;
  }
  insert(payload) { this.op = "insert"; this.payload = payload; return this; }
  update(payload) { this.op = "update"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(payload, opcoes) { this.op = "upsert"; this.payload = payload; this.opcoesUpsert = opcoes ?? {}; return this; }
  eq(col, val) { this.filtros.push({ col, op: "eq", val }); return this; }
  neq(col, val) { this.filtros.push({ col, op: "neq", val }); return this; }
  in(col, val) { this.filtros.push({ col, op: "in", val }); return this; }
  is(col, val) { this.filtros.push({ col, op: "is", val }); return this; }
  // .or("ativo.eq.true,id.eq.X") — só eq, o que as rotas de clientes usam.
  or(expr) {
    const subs = expr.split(",").map((p) => {
      const [col, op, ...resto] = p.split(".");
      const bruto = resto.join(".");
      if (op !== "eq") throw new Error(`or não suportado no memdb: ${op}`);
      return { col, op, val: bruto === "true" ? true : bruto === "false" ? false : bruto };
    });
    this.filtros.push({ col: "__or__", op: "or", val: subs });
    return this;
  }
  not(col, op, val) { this.filtros.push({ col, op: `not${op}`, val }); return this; }
  gt(col, val) { this.filtros.push({ col, op: "gt", val }); return this; }
  gte(col, val) { this.filtros.push({ col, op: "gte", val }); return this; }
  lt(col, val) { this.filtros.push({ col, op: "lt", val }); return this; }
  lte(col, val) { this.filtros.push({ col, op: "lte", val }); return this; }
  order(col, opcoes = {}) { this.ordens.push({ col, asc: opcoes.ascending !== false }); return this; }
  limit(n) { this.limite = n; return this; }
  single() { this.modo = "single"; return this; }
  maybeSingle() { this.modo = "maybe"; return this; }
  then(ok, falha) { return this.executar().then(ok, falha); }

  linhasDaTabela() {
    return (this.db.tabelas[this.tabela] ??= []);
  }

  filtrar(linhas, filtros) {
    return linhas.filter((l) => filtros.every((f) => passa(l, f)));
  }

  montarSelect() {
    const { colunas, embeds } = interpretarSelect(this.cols);
    const proprios = this.filtros.filter((f) => !f.col.includes("."));
    const deEmbed = this.filtros.filter((f) => f.col.includes("."));
    let linhas = this.filtrar(this.linhasDaTabela(), proprios);

    linhas = linhas
      .map((l) => {
        const saida = projetar(l, colunas);
        for (const e of embeds) {
          const rel = RELACOES[this.tabela]?.[e.nome];
          if (!rel) throw new Error(`relação não mapeada no memdb: ${this.tabela}.${e.nome}`);
          let alvo = (this.db.tabelas[rel.alvo] ?? []).find((x) => x.id === l[rel.local]) ?? null;
          const filtrosDoEmbed = deEmbed
            .filter((f) => f.col.startsWith(`${e.nome}.`))
            .map((f) => ({ ...f, col: f.col.slice(e.nome.length + 1) }));
          if (alvo && !filtrosDoEmbed.every((f) => passa(alvo, f))) alvo = null;
          if (e.inner && !alvo) return null;
          saida[e.alias] = alvo ? projetar(alvo, interpretarSelect(e.cols).colunas) : null;
        }
        return saida;
      })
      .filter(Boolean);

    for (const o of [...this.ordens].reverse()) {
      linhas.sort((a, b) => {
        const va = a[o.col];
        const vb = b[o.col];
        if (va === vb) return 0;
        return (va > vb ? 1 : -1) * (o.asc ? 1 : -1);
      });
    }
    if (this.limite !== null) linhas = linhas.slice(0, this.limite);
    return linhas;
  }

  finalizar(linhas) {
    if (this.modo === "single") {
      if (linhas.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      return { data: linhas[0], error: null };
    }
    if (this.modo === "maybe") {
      if (linhas.length > 1) return { data: null, error: { message: "multiple rows returned" } };
      return { data: linhas[0] ?? null, error: null };
    }
    return { data: linhas, error: null };
  }

  async executar() {
    this.db.consultas.push({ tabela: this.tabela, op: this.op });
    // Gancho de uso único (db.ganchos["tabela.op"] = fn): roda ANTES da operação — simula outra pessoa mexendo
    // na linha entre a leitura e a escrita da rota (corrida entre cliente e analista).
    const gancho = this.db.ganchos?.[`${this.tabela}.${this.op}`];
    if (gancho) {
      delete this.db.ganchos[`${this.tabela}.${this.op}`];
      await gancho();
    }
    const falha = this.db.falhas[`${this.tabela}.${this.op}`];
    if (falha) return { data: null, error: typeof falha === "object" ? falha : { message: falha } };

    if (this.op === "select") return this.finalizar(this.montarSelect());

    const tabela = this.linhasDaTabela();
    if (this.op === "insert" || this.op === "upsert") {
      const lista = Array.isArray(this.payload) ? this.payload : [this.payload];
      const criadas = [];
      for (const bruto of lista) {
        // Postgres devolve NULL nas colunas anuláveis não informadas; o memdb imita isso nesta tabela.
        const padrao = this.tabela === "funcionario_mot_eventos"
          ? { tipo_beneficio: null, observacoes: null, arquivo_path: null, nome_arquivo_original: null, corrige_evento_id: null, criado_por: null }
          : {};
        const linha = { id: proximoId(this.db), criado_em: new Date().toISOString(), ...padrao, ...bruto };
        if (this.op === "upsert") {
          const chaves = (this.opcoesUpsert.onConflict ?? "id").split(",");
          const existente = tabela.find((l) => chaves.every((c) => l[c] === linha[c]));
          if (existente) {
            if (!this.opcoesUpsert.ignoreDuplicates) Object.assign(existente, bruto);
            continue;
          }
        }
        // Índices únicos que o teste "aplica" (db.unicos = { tabela: [colunas] }) — imita o 23505 do Postgres.
        const unico = this.db.unicos?.[this.tabela];
        if (unico && tabela.some((l) => unico.every((c) => l[c] === linha[c]))) {
          return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${this.tabela}_${unico.join("_")}_unico"` } };
        }
        if (this.tabela === "funcionario_mot_eventos") {
          const erro = validarMotEvento(linha);
          if (erro) return { data: null, error: { message: `violação de constraint: ${erro}` } };
        }
        tabela.push(linha);
        criadas.push(linha);
      }
      return this.retorna ? this.finalizar(criadas.map((l) => projetar(l, interpretarSelect(this.cols).colunas))) : { data: null, error: null };
    }

    const alvos = this.filtrar(tabela, this.filtros);
    if (this.tabela === "funcionario_mot_eventos") {
      return { data: null, error: { message: "funcionario_mot_eventos é append-only" } };
    }
    if (this.op === "update") {
      for (const l of alvos) Object.assign(l, this.payload);
      return this.retorna ? this.finalizar(alvos.map((l) => projetar(l, interpretarSelect(this.cols).colunas))) : { data: null, error: null };
    }
    if (this.op === "delete") {
      this.db.tabelas[this.tabela] = tabela.filter((l) => !alvos.includes(l));
      return this.retorna ? this.finalizar(alvos.map((l) => projetar(l, interpretarSelect(this.cols).colunas))) : { data: null, error: null };
    }
    throw new Error(`op não suportada: ${this.op}`);
  }
}

export function criarClienteServico(db) {
  const falhaStorage = (chave) => (db.falhas[chave] ? { data: null, error: { message: db.falhas[chave] } } : null);
  return {
    from: (tabela) => new Consulta(db, tabela),
    storage: {
      from: (balde) => ({
        createSignedUploadUrl: async (caminho) => falhaStorage("storage.upload") ?? ({ data: { signedUrl: `https://stub/${balde}/up/${caminho}`, path: caminho, token: "tk" }, error: null }),
        createSignedUrl: async (caminho) => falhaStorage("storage.url") ?? ({ data: { signedUrl: `https://stub/${balde}/dl/${caminho}` }, error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  };
}
