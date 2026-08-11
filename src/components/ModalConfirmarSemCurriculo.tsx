interface Props {
  onVoltar: () => void;
  onConfirmar: () => void;
}

export default function ModalConfirmarSemCurriculo({ onVoltar, onConfirmar }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        animation: "modalOverlayFadeIn 0.2s ease",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "16px",
          padding: "28px 24px",
          maxWidth: "380px",
          width: "100%",
          textAlign: "center",
          animation: "modalCardPopIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            margin: "0 auto 16px",
            borderRadius: "50%",
            backgroundColor: "#FEF3C7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg style={{ width: "28px", height: "28px", color: "#D97706" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
          Você não anexou seu currículo!
        </h3>
        <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px", lineHeight: 1.5 }}>
          Quer se cadastrar assim mesmo?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={onVoltar}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#FFD700",
              color: "#111",
              fontWeight: 700,
              fontSize: "14px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Voltar e anexar o currículo
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "transparent",
              color: "#6b7280",
              fontWeight: 600,
              fontSize: "14px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              cursor: "pointer",
            }}
          >
            Enviar mesmo assim
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalCardPopIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
