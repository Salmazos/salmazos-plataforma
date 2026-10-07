// Seed de clientes para os cenários da trava de duplicidade: os 46 clientes de 07/10/2026 (fixture com contatos
// sintéticos) na unidade U1, mais um cliente em U2 (cenário "outra unidade") e uma vaga para o cliente inativo.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, novoDb, seedBase } from "./ambiente.mjs";

export * from "./ambiente.mjs";

const fx = JSON.parse(readFileSync(path.join(import.meta.dirname, "../clientes-duplicidade/fixture-clientes.json"), "utf8"));
export const idCliente = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const CLIENTE_U2 = idCliente(900);
export const VAGA_DO_INATIVO = "dddddddd-0000-4000-8000-000000000001";
export const VAGA_NORMAL = "dddddddd-0000-4000-8000-000000000002";
export const COBRANCA = "eeeeeeee-0000-4000-8000-000000000001";

const linhas = fx.linhas.map((l, i) => ({ id: idCliente(i + 1), unidade_id: "U1", ...Object.fromEntries(fx.campos.map((c, k) => [c, l[k]])) }));
export const porNome = (parte) => linhas.find((c) => c.nome.includes(parte));

export function novoDbClientes() {
  const db = novoDb();
  const base = seedBase();
  db.tabelas.clientes = structuredClone([
    ...linhas,
    { id: CLIENTE_U2, nome: "Metalúrgica Outra Praça", cidade: "Santo André", ativo: true, endereco: null, cnpj: "99.999.999/0001-99",
      contato_telefone: "(11) 98888-7777", contato_email: "financeiro@outrapraca.test", unidade_id: "U2" },
  ]);
  db.tabelas.clientes.forEach((c) => { c.servicos ??= []; });
  const inativo = porNome("Natural Labour ").id;
  const normal = porNome("Amplo").id;
  db.tabelas.vagas = [
    { id: VAGA_DO_INATIVO, titulo: "Operador", cliente_id: inativo, unidade_id: "U1", status: "aberta", slug: "operador-a" },
    { id: VAGA_NORMAL, titulo: "Auxiliar", cliente_id: normal, unidade_id: "U1", status: "aberta", slug: "auxiliar-a" },
  ];
  db.tabelas.cobrancas_rs = [
    { id: COBRANCA, status: "pendente_revisao", cliente_id: porNome("Maxsoy").id, cliente_cnpj_snapshot: null, cliente_endereco_snapshot: null, gerado_por_user_id: "u-dir" },
  ];
  db.tabelas.cliente_usuarios = base.cliente_usuarios;
  db.tabelas.unidades ??= [{ id: "U1", nome: "Monte Mor", ativa: true }, { id: "U2", nome: "Santo André", ativa: true }];
  return db;
}

export const estadoClientes = (db) =>
  [...db.tabelas.clientes].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ ...c }));
