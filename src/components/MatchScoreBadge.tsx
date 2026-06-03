interface Props {
  score: number;
  size?: "sm" | "md";
}

function getConfig(score: number): { bg: string; color: string; label: string } {
  if (score >= 80) return { bg: "#22c55e", color: "#fff", label: "Excelente" };
  if (score >= 60) return { bg: "#FFD700", color: "#000", label: "Bom" };
  if (score >= 40) return { bg: "#f97316", color: "#fff", label: "Regular" };
  return { bg: "#9ca3af", color: "#fff", label: "Baixo" };
}

export default function MatchScoreBadge({ score, size = "md" }: Props) {
  const { bg, color, label } = getConfig(score);

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
        {score}%
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
      {score}%
      <span style={{ opacity: 0.85, fontWeight: 500 }}>·</span>
      {label}
    </span>
  );
}
