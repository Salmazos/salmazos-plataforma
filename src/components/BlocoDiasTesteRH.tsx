import { textoDiasTesteParaRH } from "@/lib/diasTeste";

// Dias de teste para o RH/DP lançar na folha. Sem "use client": serve tanto em página de servidor quanto em
// componente de cliente. Só exibe — não há marcação de "lançado" nem valor.
interface Props {
  dias: unknown;
  // admissao_dia_teste: texto livre dos registros antigos.
  textoLegado?: string | null;
  tipoServico?: string | null;
  className?: string;
}

export default function BlocoDiasTesteRH({ dias, textoLegado, tipoServico, className }: Props) {
  const info = textoDiasTesteParaRH(dias, textoLegado, tipoServico);
  if (!info) return null;

  if (!info.destacar) {
    return (
      <p className={className} style={{ fontSize: 13, color: "#374151", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px" }} data-dias-teste-rh>
        <span style={{ fontWeight: 600 }}>Dia(s) de teste:</span> {info.linhas.join("; ")}
      </p>
    );
  }
  return (
    <div className={className} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px" }} data-dias-teste-rh data-destaque>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        Dia(s) de teste (a pagar na folha)
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13, color: "#111827" }}>
        {info.linhas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {info.total && <p style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#92400E" }}>{info.total}</p>}
    </div>
  );
}
