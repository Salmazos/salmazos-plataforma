import { ROTULO_PCD_PUBLICO } from "@/lib/vagaPcdPublica";

// Selo neutro da vaga PCD nas páginas públicas: só a sigla ("Vaga PCD"), nunca a palavra por extenso. `sobreFundoEscuro` é o cabeçalho preto da página da vaga.
export default function SeloPcd({ sobreFundoEscuro = false }: { sobreFundoEscuro?: boolean }) {
  const estilo = sobreFundoEscuro
    ? { display: "inline-block", marginTop: "10px", fontSize: "12px", fontWeight: 700, padding: "3px 12px", borderRadius: "9999px", border: "1px solid #FFD700", color: "#FFD700" }
    : { alignSelf: "flex-start", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "9999px", backgroundColor: "#EEF2FF", color: "#3730A3", border: "1px solid #C7D2FE" };
  return <span style={estilo}>{ROTULO_PCD_PUBLICO}</span>;
}
