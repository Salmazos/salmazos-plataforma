// Faixa da marca no topo da tela pública de admissão (boas-vindas e todos os passos). Mesmo logo e mesma faixa preta com filete amarelo das
// outras páginas públicas (vagas, candidatura); largura limitada ao mesmo miolo da tela e logo com altura fixa, sem estourar no celular.
export default function CabecalhoMarca() {
  return (
    <header style={{ background: "#000", borderBottom: "3px solid #FFD700" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" style={{ height: 36, width: "auto", maxWidth: "100%", objectFit: "contain", display: "block" }} />
      </div>
    </header>
  );
}
