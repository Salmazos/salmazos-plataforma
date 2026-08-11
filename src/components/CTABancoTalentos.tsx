export default function CTABancoTalentos() {
  return (
    <>
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0px rgba(255, 215, 0, 0); transform: scale(1); }
          50% { box-shadow: 0 0 18px 4px rgba(255, 215, 0, 0.45); transform: scale(1.02); }
        }
      `}</style>
      <a
        href="/candidatura"
        style={{
          display: "block",
          textAlign: "center",
          marginTop: "20px",
          padding: "16px 32px",
          backgroundColor: "#FFD700",
          color: "#111",
          borderRadius: "12px",
          fontSize: "15px",
          fontWeight: "bold",
          textDecoration: "none",
          animation: "pulseGlow 2.4s ease-in-out infinite",
          maxWidth: "520px",
          margin: "20px auto 0",
          whiteSpace: "normal",
          lineHeight: "1.6",
        }}
      >
        Não encontrou uma vaga para você?<br />Clique aqui e se cadastre em nosso Banco de Talentos! →
      </a>
    </>
  );
}
