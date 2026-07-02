"use client";

const PASSOS = [
  "Dados Pessoais",
  "Doc. Profissionais",
  "Endereço",
  "Dados Bancários",
  "Dependentes",
  "Vale Transporte",
  "Autorização Sindical",
  "Documentos",
  "Revisão",
];

export default function ProgressBar({ passoAtual }: { passoAtual: number }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 16px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
            Passo {passoAtual} de {PASSOS.length}
          </span>
          <span style={{ fontSize: 13, color: "#6B7280" }}>{PASSOS[passoAtual - 1]}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {PASSOS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: i < passoAtual ? "#FFB800" : "#E5E7EB",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
