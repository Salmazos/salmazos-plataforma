interface Props {
  score: number;
  label: string;
  resumo?: string;
  size?: "sm" | "md";
}

function getStyle(score: number): { bg: string; color: string } {
  if (score >= 80) return { bg: "#22c55e", color: "#fff" };
  if (score >= 60) return { bg: "#FFD700", color: "#000" };
  if (score >= 40) return { bg: "#f97316", color: "#fff" };
  return { bg: "#9ca3af", color: "#fff" };
}

export default function TriagemBadge({ score, label, resumo, size = "md" }: Props) {
  const { bg, color } = getStyle(score);

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
          whiteSpace: "nowrap",
        }}
      >
        {score}% {label}
      </span>
    );
  }

  return (
    <span
      title={resumo}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor: bg,
        color,
        fontSize: "11px",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: "9999px",
        lineHeight: 1.4,
        cursor: resumo ? "help" : "default",
        whiteSpace: "nowrap",
      }}
    >
      {score}%
      <span style={{ opacity: 0.7, fontWeight: 400 }}>·</span>
      {label}
    </span>
  );
}
