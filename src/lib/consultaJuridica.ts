const DATAJUD_API_KEY =
  "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

type ProcessoResumo = {
  numero: string;
  tribunal: string;
  assunto: string;
  dataInicio: string;
  partes: string[];
};

export async function consultarProcessos(
  nome: string,
  _cidade?: string
): Promise<{
  temTrabalhista: boolean;
  totalProcessos: number;
  resumo: ProcessoResumo[];
}> {
  const trtNumbers = Array.from({ length: 24 }, (_, i) => i + 1);

  const results = await Promise.all(
    trtNumbers.map(async (n): Promise<ProcessoResumo[]> => {
      try {
        const res = await fetch(
          `https://api-publica.datajud.cnj.jus.br/api_publica_trt${n}/_search`,
          {
            method: "POST",
            headers: {
              Authorization: `APIKey ${DATAJUD_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: {
                match: {
                  "partes.nome": { query: nome, operator: "and" },
                },
              },
              size: 5,
            }),
          }
        );

        if (!res.ok) return [];

        const json = await res.json();
        const hits = json.hits?.hits ?? [];

        return hits.map(
          (hit: {
            _source: {
              numeroProcesso?: string;
              assuntos?: { nome?: string }[];
              dataHoraUltimaAtualizacao?: string;
              partes?: { nome?: string }[];
            };
          }) => {
            const proc = hit._source;
            return {
              numero: proc.numeroProcesso ?? "",
              tribunal: `TRT${n}`,
              assunto: proc.assuntos?.[0]?.nome || "Trabalhista",
              dataInicio: proc.dataHoraUltimaAtualizacao ?? "",
              partes: proc.partes?.map((p) => p.nome ?? "") ?? [],
            };
          }
        );
      } catch {
        return [];
      }
    })
  );

  const all = results.flat();

  return {
    temTrabalhista: all.length > 0,
    totalProcessos: all.length,
    resumo: all.slice(0, 10),
  };
}
