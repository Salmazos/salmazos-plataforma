// Seletor "Todas as unidades / <unidade>" das telas gerenciais (Dashboard, Relatórios) — só
// pra quem vê todas as unidades. A unidade vai na URL (?unidade=<id>) e a página filtra no
// servidor; sem parâmetro = Todas.
export default function SeletorUnidade({
  unidades,
  unidadeSel,
  basePath,
  semTodas = false,
}: {
  unidades: { id: string; nome: string }[];
  unidadeSel: string | null;
  basePath: string;
  // Telas que sempre operam numa unidade só (Faturamento Unidades) não têm a opção "Todas".
  semTodas?: boolean;
}) {
  if (unidades.length < 2) return null;
  const opcoes = semTodas ? unidades : [{ id: null as string | null, nome: "Todas as unidades" }, ...unidades];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {opcoes.map((u) => {
        const ativo = u.id === unidadeSel;
        return (
          <a
            key={u.id ?? "todas"}
            href={u.id ? `${basePath}?unidade=${u.id}` : basePath}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              background: ativo ? "#000" : "#FFF",
              color: ativo ? "#FFD700" : "#374151",
              border: ativo ? "1px solid #000" : "1px solid #D1D5DB",
            }}
          >
            {u.nome}
          </a>
        );
      })}
    </div>
  );
}
