import { textoDiasTesteParaRH } from "@/lib/diasTeste";

// Dias de teste para o RH/DP lançar na folha. Sem "use client": serve tanto em página de servidor quanto em
// componente de cliente. Só exibe — não há marcação de "lançado" nem valor.
interface Props {
  // admissao_qtd_dias_teste: null = não informado, 0 = não houve, 1 ou 2.
  qtd: unknown;
  // admissao_dia_teste: texto livre dos registros antigos.
  legado?: string | null;
  tipo?: string | null;
  className?: string;
}

export default function BlocoDiasTesteRH({ qtd, legado, tipo, className }: Props) {
  const info = textoDiasTesteParaRH(qtd, legado, tipo);
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
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>{info.linhas.join("; ")}</p>
    </div>
  );
}
