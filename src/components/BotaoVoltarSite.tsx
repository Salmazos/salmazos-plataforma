export default function BotaoVoltarSite() {
  return (
    <a
      href="https://www.salmazos.com.br"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "fixed",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        backgroundColor: "#FFD700",
        color: "#000000",
        padding: "12px 16px",
        borderRadius: "12px 0 0 12px",
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textDecoration: "none",
        zIndex: 50,
        boxShadow: "-2px 0 8px rgba(0,0,0,0.3)",
      }}
    >
      ← Voltar ao site
    </a>
  );
}
