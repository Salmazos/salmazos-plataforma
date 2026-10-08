// Verificação da regra de estado do upload dos documentos da contabilidade (o projeto não tem
// runner de testes). Rodar: node --experimental-strip-types scripts/verificar-upload-contabilidade-estado.mts
import assert from "node:assert/strict";
import { documentosObrigatorios, type TipoDocumentoContabilidade } from "../src/lib/contabilidadeDocumentosMatch.ts";
import { calcularEstadoUpload, type StatusLinha } from "../src/lib/contabilidadeUploadEstado.ts";

type T = TipoDocumentoContabilidade;
const NOVACKI = "7f876c42-fa47-4de8-876f-d2ebe79738c6";
const BASE: T[] = ["ficha_registro", "modelo_contrato", "acordo_hs_vt", "termo_lgpd"];
const NOVACKI_DOCS: T[] = ["termo_lgpd_novacki", "termo_confidencialidade_novacki"];

// ── Oráculo: lógica ANTIGA (main), copiada literalmente de statusLinha/podeAvancarEtapa1 ──
function antigo(clienteId: string | null, confirmados: Set<T>, enviandoTipo: T | null, pulouOpcionais: boolean) {
  const listaCompleta = documentosObrigatorios(clienteId);
  const estaConfirmado = (tipo: T) => confirmados.has(tipo);
  const obrigatoriosBaseOk = listaCompleta.filter((d) => d.obrigatorio && !d.cliente_id).every((d) => estaConfirmado(d.tipo_documento));
  const todosObrigatoriosOk = listaCompleta.filter((d) => d.obrigatorio).every((d) => estaConfirmado(d.tipo_documento));
  const opcionais = listaCompleta.filter((d) => !d.obrigatorio);
  const primeiroOpcional = opcionais[0];
  const grupoOpcionalIniciado = primeiroOpcional ? estaConfirmado(primeiroOpcional.tipo_documento) : false;
  const opcionaisResolvidos = pulouOpcionais || opcionais.every((d) => estaConfirmado(d.tipo_documento));
  const podeAvancarEtapa1 = todosObrigatoriosOk && opcionaisResolvidos;
  const status = listaCompleta.map((def, index): StatusLinha => {
    if (estaConfirmado(def.tipo_documento)) return "done";
    if (enviandoTipo === def.tipo_documento) return "uploading";
    if (def.obrigatorio) {
      const anteriores = listaCompleta.slice(0, index).filter((d) => d.obrigatorio);
      const anterioresOk = anteriores.every((d) => estaConfirmado(d.tipo_documento));
      return anterioresOk ? "pending" : "locked";
    }
    if (!obrigatoriosBaseOk) return "locked";
    const indexOpcional = opcionais.findIndex((o) => o.tipo_documento === def.tipo_documento);
    if (indexOpcional === 0) return pulouOpcionais ? "pulado" : "pending";
    if (pulouOpcionais) return "pulado";
    if (!grupoOpcionalIniciado) return "locked";
    const anterioresOpcionais = opcionais.slice(0, indexOpcional);
    const anterioresOk = anterioresOpcionais.every((o) => estaConfirmado(o.tipo_documento));
    return anterioresOk ? "pending" : "locked";
  });
  return { status, podeAvancarEtapa1 };
}

function novo(clienteId: string | null, confirmados: Set<T>, enviandoTipo: T | null, pulouFichaIr: boolean, pulouPar: boolean) {
  return calcularEstadoUpload({ lista: documentosObrigatorios(clienteId), confirmados, enviandoTipo, pulouFichaIr, pulouPar });
}

// ── 1) Equivalência exaustiva com a main em todos os estados que a main conseguia produzir ──
// Estados da main: obrigatórios confirmados em prefixo (a trava é sequencial), opcionais
// confirmados em prefixo [ir, sf, tr], "pulou" só possível sem nenhum opcional confirmado
// (enviar um arquivo desfaz o pulo), com ou sem upload em andamento na primeira linha pendente.
let comparados = 0;
for (const clienteId of [null, NOVACKI]) {
  const obrigatorios = [...BASE, ...(clienteId ? NOVACKI_DOCS : [])];
  const opcionais: T[] = ["ficha_ir", "salario_familia", "termo_responsabilidade"];
  for (let nOb = 0; nOb <= obrigatorios.length; nOb++) {
    for (let nOp = 0; nOp <= 3; nOp++) {
      if (nOp > 0 && nOb < BASE.length) continue; // opcionais só destravam após os 4 base
      for (const pulou of [false, true]) {
        if (pulou && nOp > 0) continue; // inalcançável na main
        const confirmados = new Set<T>([...obrigatorios.slice(0, nOb), ...opcionais.slice(0, nOp)]);
        // Os 2 da Novacki também podem ser enviados antes de terminar o prefixo? Não: sequencial.
        for (const enviando of [null, ...[...obrigatorios, ...opcionais].filter((t) => !confirmados.has(t))] as (T | null)[]) {
          const a = antigo(clienteId, confirmados, enviando, pulou);
          const n = novo(clienteId, confirmados, enviando, pulou, pulou);
          assert.deepEqual(n.status, a.status, `status diverge: cliente=${clienteId} ob=${nOb} op=${nOp} pulou=${pulou} enviando=${enviando}`);
          assert.equal(n.podeAvancarEtapa1, a.podeAvancarEtapa1, `avançar diverge: cliente=${clienteId} ob=${nOb} op=${nOp} pulou=${pulou}`);
          comparados++;
        }
      }
    }
  }
}
console.log(`OK equivalência com a main: ${comparados} estados idênticos (status de cada linha + podeAvancarEtapa1)`);

// ── 2) Cenários pedidos ──
const base = new Set<T>(BASE);
const com = (...extra: T[]) => new Set<T>([...BASE, ...extra]);
const nomes = ["ficha_registro", "modelo_contrato", "acordo_hs_vt", "termo_lgpd", "ficha_ir", "salario_familia", "termo_responsabilidade"];
const mostra = (st: StatusLinha[]) => st.map((s, i) => `${i + 1}:${s}`).join(" ");

function cenario(titulo: string, confirmados: Set<T>, pulouIr: boolean, pulouPar: boolean, avanca: boolean, st?: Record<number, StatusLinha>) {
  const r = novo(null, confirmados, null, pulouIr, pulouPar);
  assert.equal(r.podeAvancarEtapa1, avanca, titulo);
  for (const [i, s] of Object.entries(st ?? {})) assert.equal(r.status[Number(i) - 1], s, `${titulo} — linha ${i}`);
  console.log(`OK ${titulo.padEnd(62)} avança=${String(r.podeAvancarEtapa1).padEnd(5)} [${mostra(r.status)}]`);
  return r;
}

cenario("1. 4 fixos, IR pulada (Pular no 5º pula o par junto, como hoje)", base, true, true, true, { 5: "pulado", 6: "pulado", 7: "pulado" });
cenario("2. IR enviada + par pulado (caso Marco)", com("ficha_ir"), false, true, true, { 5: "done", 6: "pulado", 7: "pulado" });
cenario("2b. IR enviada, par ainda não decidido (6º pendente, com Pular)", com("ficha_ir"), false, false, false, { 5: "done", 6: "pending", 7: "locked" });
cenario("3. IR enviada + 6 enviado + 7 pendente", com("ficha_ir", "salario_familia"), false, false, false, { 6: "done", 7: "pending" });
cenario("4. IR pulada + par pulado (só os 4 fixos)", base, true, true, true);
cenario("5. Par completo, IR enviada (7 documentos)", com("ficha_ir", "salario_familia", "termo_responsabilidade"), false, false, true);
cenario("6. 4 + 6 + 7 sem IR (IR pulada, par reaberto enviando o 6º)", com("salario_familia", "termo_responsabilidade"), true, false, true);
cenario("6b. IR pulada, 6 enviado, 7 pendente", com("salario_familia"), true, false, false, { 5: "pulado", 6: "done", 7: "pending" });
cenario("6c. IR pulada, par reaberto mas nada enviado ainda", base, true, false, false, { 5: "pulado", 6: "pending", 7: "locked" });
cenario("7. Nada decidido: IR pendente, 6 e 7 travados", base, false, false, false, { 5: "pending", 6: "locked", 7: "locked" });
cenario("8. Só 4 + IR enviada, par não decidido não avança", com("ficha_ir"), false, false, false);
cenario("9. 4 fixos incompletos: opcionais travados mesmo pulado não avança", new Set<T>(BASE.slice(0, 3)), true, true, false, { 4: "pending", 5: "locked", 6: "locked", 7: "locked" });

// Cliente Novacki: os 2 termos exclusivos são obrigatórios e o par pulado não os dispensa.
{
  const r = novo(NOVACKI, com("ficha_ir"), null, false, true);
  assert.equal(r.podeAvancarEtapa1, false, "Novacki sem os 2 termos não avança");
  const r2 = novo(NOVACKI, com("ficha_ir", ...NOVACKI_DOCS), null, false, true);
  assert.equal(r2.podeAvancarEtapa1, true, "Novacki completo + IR + par pulado avança");
  console.log("OK Novacki: termos exclusivos continuam obrigatórios; par pulado não os dispensa");
}

// Itens pulados nunca contam como enviados: status "pulado" nunca é "done" e não entra em `confirmados`.
{
  const r = novo(null, com("ficha_ir"), null, false, true);
  assert.deepEqual(nomes.filter((_, i) => r.status[i] === "done"), [...BASE, "ficha_ir"]);
  console.log("OK itens pulados (6 e 7) não aparecem como enviados:", nomes.filter((_, i) => r.status[i] === "pulado").join(", "));
}

console.log("\nTudo verificado.");
