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
        writingMode: "vertical-rl",
        backgroundColor: "#000000",
        color: "#FFD700",
        padding: "16px 10px",
        borderRadius: "12px 0 0 12px",
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textDecoration: "none",
        zIndex: 50,
        boxShadow: "-2px 0 8px rgba(0,0,0,0.3)",
        transition: "background-color 0.2s",
      }}
    >
      Voltar ao site
    </a>
  );
}
