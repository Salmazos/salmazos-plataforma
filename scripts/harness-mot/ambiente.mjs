// Ambiente comum dos cenários: data congelada (07/10/2026, meio-dia em Brasília), usuários, dados-base
// e atalhos pra chamar as rotas da MESMA forma contra a branch e contra a main.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarDb } from "./memdb.mjs";

export const ROOT = path.resolve(process.env.HARNESS_ROOT ?? process.cwd());
export const AGORA_ISO = "2026-10-07T15:00:00.000Z";
export const HOJE = "2026-10-07";

export function congelarData(iso = AGORA_ISO) {
  const Real = globalThis.__DateReal__ ?? Date;
  globalThis.__DateReal__ = Real;
  const ms = Real.parse(iso);
  globalThis.Date = class extends Real {
    constructor(...args) {
      if (args.length === 0) super(ms);
      else super(...args);
    }
    static now() {
      return ms;
    }
  };
}

export const usuario = (id, role) => ({ id, email: `${id}@teste.local`, app_metadata: { role } });
export const USUARIOS = {
  dir: usuario("u-dir", "diretoria"),
  sup1: usuario("u-sup1", "supervisor"), // unidade U1
  sup2: usuario("u-sup2", "supervisor"), // unidade U2
  ana: usuario("u-ana", "analista"), // sem acesso ao RH
  cli: usuario("u-cli", "cliente"), // portal, cliente C1
};

// Datas de admissão dos 31 MOT ativos de hoje (só as datas — nomes reais ficam fora do repositório).
// Índice 0 = caso "270+", índice 3 = caso "180 em 12/10".
const ADMISSOES_MOT = [
  "2024-11-04", "2026-02-04", "2026-02-09", "2026-04-16", "2026-06-23", "2026-07-01", "2026-07-01",
  "2026-07-20", "2026-07-20", "2026-07-20", "2026-08-01", "2026-08-03", "2026-08-03", "2026-08-09",
  "2026-08-19", "2026-08-24", "2026-09-01", "2026-09-01", "2026-09-08", "2026-09-10", "2026-09-17",
  "2026-09-17", "2026-09-18", "2026-09-23", "2026-09-23", "2026-09-23", "2026-09-24", "2026-09-30",
  "2026-09-30", "2026-10-04", "2026-10-06",
];

// Ids em formato uuid (os schemas zod exigem .uuid()). Prefixos diferentes do contador do memdb, pra não colidir.
export const idMot = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const F_T1 = "bbbbbbbb-0000-4000-8000-000000000001";
export const F_D1 = "bbbbbbbb-0000-4000-8000-000000000002";
export const F_U2 = "bbbbbbbb-0000-4000-8000-000000000003";

export function funcionarioMot(id, dataAdmissao, extra = {}) {
  return {
    id, nome_completo: `MOT ${id.slice(-2)}`, cliente_id: "C1", empresa: "Cliente Um", cargo: "Operador", data_admissao: dataAdmissao,
    status: "ativo", tipo_servico: "mao_obra_temporaria", unidade_id: "U1", admissao_id: null, criado_em: AGORA_ISO, ...extra,
  };
}

export function seedBase() {
  const perfil = (u, unidade, todas) => ({ id: `p-${u.id}`, user_id: u.id, unidade_id: unidade, acesso_todas_unidades: todas, ativo: true, nome_completo: `Nome ${u.id}` });
  return {
    analistas_perfil: [
      perfil(USUARIOS.dir, "U1", true), perfil(USUARIOS.sup1, "U1", false), perfil(USUARIOS.sup2, "U2", false), perfil(USUARIOS.ana, "U1", false),
    ],
    usuario_acesso_customizado: [],
    clientes: [
      { id: "C1", nome: "Cliente Um", unidade_id: "U1", ativo: true },
      { id: "C2", nome: "Cliente Dois", unidade_id: "U1", ativo: true },
      { id: "C3", nome: "Cliente Tres", unidade_id: "U2", ativo: true },
    ],
    cliente_usuarios: [{ id: "cu1", user_id: "u-cli", cliente_id: "C1" }],
    funcionarios: [
      ...ADMISSOES_MOT.map((d, i) => funcionarioMot(idMot(i + 1), d, i >= 20 ? { cliente_id: "C2", empresa: "Cliente Dois" } : {})),
      funcionarioMot(F_T1, "2026-01-10", { tipo_servico: "terceirizacao" }),
      funcionarioMot(F_D1, "2026-01-10", { status: "desligado" }),
      funcionarioMot(F_U2, "2026-02-04", { unidade_id: "U2", cliente_id: "C3", empresa: "Cliente Tres" }),
    ],
    rescisoes: [
      { id: "r-d1", funcionario_id: F_D1, unidade_id: "U1", empresa: "Cliente Um", data_desligamento: "2026-09-26", modalidade: "pedido_demissao",
        entrevista_desligamento: false, funcionario_assinou: false, valor_rescisao: 100, data_pagamento_rescisao: "2026-09-30", faturado: false, aso_documento_path: null },
    ],
    funcionario_mot_eventos: [],
    funcionario_vencimento_mot_popup_visualizacoes: [],
    audit_logs: [],
  };
}

export function novoDb() {
  const db = criarDb(seedBase());
  globalThis.__DB__ = db;
  globalThis.__PENDENTES__ = [];
  return db;
}

export const logar = (db, quem) => { db.usuario = quem ? USUARIOS[quem] : null; };
export const logarPortal = (db, quem) => { db.usuarioPortal = quem ? USUARIOS[quem] : null; };

export async function flush() {
  await Promise.all(globalThis.__PENDENTES__ ?? []);
  await new Promise((r) => setTimeout(r, 0));
}

export const importar = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

// Chama o handler como o Next chamaria: Request + params assíncronos.
export async function chamar(handler, { metodo = "GET", corpo, params = {}, url = "http://t/api", headers = {} } = {}) {
  const init = { method: metodo, headers: { ...headers } };
  if (corpo !== undefined) {
    init.body = JSON.stringify(corpo);
    init.headers["content-type"] = "application/json";
  }
  const req = new Request(url, init);
  Object.defineProperty(req, "nextUrl", { value: new URL(req.url) });
  const res = await handler(req, { params: Promise.resolve(params) });
  const texto = await res.text();
  await flush();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: res.status, corpo: json };
}

export function tabela(db, nome, colunas) {
  return [...(db.tabelas[nome] ?? [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((l) => (colunas ? Object.fromEntries(colunas.map((c) => [c, l[c] ?? null])) : { ...l }));
}

export const auditoria = (db) =>
  (db.tabelas.audit_logs ?? []).map((a) => ({ acao: a.acao, entidade: a.entidade, entidade_id: a.entidade_id, usuario_id: a.usuario_id, detalhes: a.detalhes }));

// Reduz uma árvore de elementos React (retorno de uma page) a dados comparáveis.
export function serializar(no) {
  if (Array.isArray(no)) return no.map(serializar);
  if (no && typeof no === "object" && "props" in no && "type" in no) {
    const { children, ...resto } = no.props ?? {};
    return { tipo: typeof no.type === "function" ? "Componente" : String(no.type), props: resto, filhos: serializar(children) };
  }
  return no ?? null;
}

export function dataMais(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
