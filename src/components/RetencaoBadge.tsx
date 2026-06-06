interface Props {
  score: number;
  label: string;
  size?: "sm" | "md";
}

function getConfig(label: string): { bg: string; color: string } {
  switch (label) {
    case "Alto":  return { bg: "#22c55e", color: "#fff" };
    case "Médio": return { bg: "#FFD700", color: "#000" };
    case "Baixo": return { bg: "#f97316", color: "#fff" };
    case "Risco": return { bg: "#ef4444", color: "#fff" };
    default:      return { bg: "#9ca3af", color: "#fff" };
  }
}

export default function RetencaoBadge({ score, label, size = "md" }: Props) {
  const { bg, color } = getConfig(label);

  if (size === "sm") {
    return (
      <span
        style={{
          display: "inline-block",
          backgroundColor: bg,
          color,
          fontSize: "10px",
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: "9999px",
          lineHeight: 1.4,
        }}
      >
        {score}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor: bg,
        color,
        fontSize: "11px",
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: "9999px",
        lineHeight: 1.4,
      }}
    >
      🔒 {score}
      <span style={{ opacity: 0.85, fontWeight: 500 }}>·</span>
      {label}
    </span>
  );
}
