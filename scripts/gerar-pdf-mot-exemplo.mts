// Gera PDFs de EXEMPLO da proposta MOT (dados ZZTEST, nada vem do banco) para inspeção visual. Não grava nada no sistema.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/gerar-pdf-mot-exemplo.mts <pasta-de-saida>
import fs from "node:fs";
import path from "node:path";
import { gerarPdfPropostaMot } from "@/lib/propostaPdfMot";
import { montarSnapshotMot, type ParametrosMotVigentes } from "@/lib/propostaMot";
import { PARAMETROS_MOT_INICIAIS } from "@/lib/propostaMotCalculo";

const saida = process.argv[2];
if (!saida) throw new Error("Informe a pasta de saída.");
fs.mkdirSync(saida, { recursive: true });
const parametros = { vigente_desde: "2026-11-19", id: "zztest", ...PARAMETROS_MOT_INICIAIS } as ParametrosMotVigentes;

const funcoes = [
  { area: "OPERACIONAL", descricao: "ZZTEST Auxiliar de produção", salario_centavos: 100000, jornada: "Conforme Convenção Coletiva", horario: "Turnos A / B /C" },
  { area: "ADMINISTRATIVO", descricao: "ZZTEST Auxiliar administrativo", salario_centavos: 320000, jornada: "40h semanais", horario: "08h às 17h, com 1h de intervalo" },
  { area: "LOGÍSTICA", descricao: "ZZTEST Conferente", salario_centavos: 180050, jornada: "44h semanais, de segunda a sábado", horario: "07h às 16h20" },
  { area: "MANUTENÇÃO", salario_centavos: 450000, jornada: "Conforme Convenção Coletiva", horario: "Turnos A / B /C" },
  { area: "QUALIDADE", descricao: "ZZTEST Inspetor", salario_centavos: 275000, jornada: "40h semanais", horario: "Comercial" },
];

function snap(n: number, extra: Record<string, unknown> = {}) {
  return montarSnapshotMot({
    numero: "TESTE-MOT-9999/26", revisao: n === 1 ? 0 : 1, templateVersao: 1, dataEmissao: "2026-11-21", validadeDias: 15, validadeAte: "2026-12-06",
    clienteNome: "ZZTEST Pastifício Exemplo S/A", aosCuidados: "ZZTEST Maria Exemplo", vendedorNome: "ZZTEST Vendedor", vendedorCargo: "Especialista em pessoas",
    vendedorTelefone: "(19) 99999-0000", vendedorEmail: "zztest@salmazos.com.br", parametros,
    conteudo: {
      funcoes: funcoes.slice(0, n), clausulas_adicionais: ["ZZTEST Cláusula adicional de exemplo, um pouco mais longa para conferir a quebra de linha e o recuo do texto no PDF."], ...extra,
    },
  });
}

for (const [nome, n] of [["pdf-mot-exemplo-1-funcao", 1], ["pdf-mot-exemplo-5-funcoes", 5]] as const) {
  const bytes = await gerarPdfPropostaMot(snap(n), { teste: true });
  const arquivo = path.join(saida, `${nome}.pdf`);
  fs.writeFileSync(arquivo, bytes);
  console.log(arquivo, bytes.length);
}
