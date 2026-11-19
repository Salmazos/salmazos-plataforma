export default function CarregandoGestaoPessoasPortal() {
  const bloco = (altura: number) => <div className="card" style={{ height: altura, background: "#F3F4F6", border: "1px solid #E5E7EB" }} />;
  return (
    <div role="status" aria-label="Carregando Gestão de Pessoas">
      <div style={{ height: 28, width: 220, background: "#E5E7EB", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 16, width: 160, background: "#F3F4F6", borderRadius: 6, marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {bloco(84)}{bloco(84)}{bloco(84)}{bloco(84)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {bloco(300)}{bloco(300)}
      </div>
    </div>
  );
}
