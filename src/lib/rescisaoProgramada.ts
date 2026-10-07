import { dataBrasilia } from "./garantiaRS";

// Rescisão programada: o Olver lança a rescisão com antecedência, com data de desligamento futura.
// ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O NEGÓCIO: o funcionário continua 'ativo' (ponto, ASO, portal do
// cliente, documentos) até a data chegar — só então vira 'desligado'. Quem vira é o passo do cron diário
// rescisao-avisos (e o POST/PATCH da rescisão, quando a data já chegou no momento do lançamento).

// "Hoje" em Brasília no formato AAAA-MM-DD — mesma técnica do resto do projeto (garantiaRS.ts).
export function hojeBrasiliaISO(agora: Date = new Date()): string {
  return dataBrasilia(agora);
}

// A data de desligamento chegou? Hoje conta como chegou (data_desligamento <= hoje). Compara strings
// AAAA-MM-DD, exato porque são datas puras (sem hora/fuso).
export function dataJaChegou(dataISO: string, hojeISO: string): boolean {
  return dataISO <= hojeISO;
}

// Rescisão programada = data ainda no futuro (estritamente depois de hoje).
export function dataEhFutura(dataISO: string, hojeISO: string): boolean {
  return dataISO > hojeISO;
}

// Texto curto pra selos e mensagens: "dd/mm/aaaa".
export function formatarDataBR(dataISO: string): string {
  return dataISO.split("-").reverse().join("/");
}
