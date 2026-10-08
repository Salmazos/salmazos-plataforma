// Regra de estado da tela de upload dos documentos da contabilidade
// (ModalUploadDocumentosContabilidade.tsx), extraída como função pura para poder ser
// verificada sem renderizar o modal (ver scripts/verificar-upload-contabilidade-estado.mts).
//
// ASSUNÇÃO DE NEGÓCIO (a confirmar com o RH: que o Termo de Responsabilidade é o do
// salário-família): depois dos 4 fixos, o pacote válido é
// 4 fixos, 4 + Ficha de IR, 4 + Salário Família + Termo de Responsabilidade, ou os 7. A
// Ficha de IR (5º) é decidida sozinha (enviar/pular); Salário Família (6º) e Termo de
// Responsabilidade (7º) são um PAR: ou vêm os dois, ou nenhum. Motivo: o Termo de
// Responsabilidade acompanha o Salário Família, e o Salário Família só se aplica a quem tem
// filho até 14 anos — o cônjuge gera Ficha de IR mas não gera Salário Família (caso real:
// admissão f1e8ea96, que ficava travada no 6º item).
import type { DocumentoObrigatoriedade, TipoDocumentoContabilidade } from "./contabilidadeDocumentosMatch";

export type StatusLinha = "locked" | "pending" | "uploading" | "done" | "pulado";

export interface EntradaEstadoUpload {
  lista: DocumentoObrigatoriedade[];
  confirmados: ReadonlySet<TipoDocumentoContabilidade>;
  enviandoTipo: TipoDocumentoContabilidade | null;
  // Decisão de pular a Ficha de IR (5º).
  pulouFichaIr: boolean;
  // Decisão de pular o par Salário Família + Termo de Responsabilidade (6º e 7º). Pular a
  // Ficha de IR também liga esta flag (comportamento que já existia: quem não tem IR
  // normalmente não tem os outros dois), mas o usuário pode desfazer enviando o 6º.
  pulouPar: boolean;
}

export interface EstadoUpload {
  // Mesma ordem de `lista`.
  status: StatusLinha[];
  obrigatoriosBaseOk: boolean;
  todosObrigatoriosOk: boolean;
  podeAvancarEtapa1: boolean;
}

export function calcularEstadoUpload(e: EntradaEstadoUpload): EstadoUpload {
  const { lista, confirmados, enviandoTipo, pulouFichaIr, pulouPar } = e;
  const ok = (tipo: TipoDocumentoContabilidade) => confirmados.has(tipo);

  // Só os documentos base destravam os opcionais — condicionais de cliente (ex: os 2 da
  // Novacki) não têm relação com esse grupo e não podem bloqueá-lo.
  const obrigatoriosBaseOk = lista.filter((d) => d.obrigatorio && !d.cliente_id).every((d) => ok(d.tipo_documento));
  const todosObrigatoriosOk = lista.filter((d) => d.obrigatorio).every((d) => ok(d.tipo_documento));

  const irResolvida = ok("ficha_ir") || pulouFichaIr;
  const parResolvido = pulouPar || (ok("salario_familia") && ok("termo_responsabilidade"));
  const podeAvancarEtapa1 = todosObrigatoriosOk && irResolvida && parResolvido;

  const status = lista.map((def, index): StatusLinha => {
    const tipo = def.tipo_documento;
    if (ok(tipo)) return "done";
    if (enviandoTipo === tipo) return "uploading";
    if (def.obrigatorio) {
      const anterioresOk = lista.slice(0, index).filter((d) => d.obrigatorio).every((d) => ok(d.tipo_documento));
      return anterioresOk ? "pending" : "locked";
    }
    if (!obrigatoriosBaseOk) return "locked";
    if (tipo === "ficha_ir") return pulouFichaIr ? "pulado" : "pending";
    if (pulouPar) return "pulado";
    // O 6º só abre depois que a Ficha de IR foi decidida (enviada ou pulada); o 7º, depois do 6º.
    if (tipo === "salario_familia") return irResolvida ? "pending" : "locked";
    return ok("salario_familia") ? "pending" : "locked";
  });

  return { status, obrigatoriosBaseOk, todosObrigatoriosOk, podeAvancarEtapa1 };
}
