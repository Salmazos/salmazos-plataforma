// Imagens e endereços que o PDF da proposta lê em tempo de execução. É o único lugar que conhece os caminhos:
// para trocar uma pasta, mude aqui (e o padrão de outputFileTracingIncludes em next.config.ts, que inclui essas pastas no bundle da rota do PDF).
import path from "path";

// Relativos à raiz do projeto (process.cwd()), como o resto do repo lê arquivos de public/.
export const PASTA_CABECALHO_PROPOSTA = path.join(process.cwd(), "public", "propostas", "cabecalho");
export const PASTA_CLIENTES_PROPOSTA = path.join(process.cwd(), "public", "propostas", "clientes");

// Rodapé do PDF entregue ao cliente, uma linha por item, repetido em todas as páginas. É o rodapé do modelo atual
// (não usar ENDERECO_FISCAL_SALMAZOS aqui: é o endereço fiscal de outros documentos).
export const ENDERECOS_RODAPE_PROPOSTA: string[] = [
  "Rua Hipólito Piva, nº 30 – Centro – Monte Mor | SP – Tel.: 19 – 3217-7899",
  "Rua Zacarias Costa Camargo, nº 752 – Remanso Campineiro – Hortolândia | SP – Tel.: 19 – 3819-3919",
  "Rua Jurubatuba, nº 336 – Centro – São Bernardo do Campo | SP – Tel.: 11 – 96695-4751",
  "www.salmazos.com.br | @salmazosrh",
];
