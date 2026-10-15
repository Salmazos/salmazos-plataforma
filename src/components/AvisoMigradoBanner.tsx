import Link from "next/link";

// Aviso nas telas antigas de destinatários: o envio já lê só Configurações > Avisos.
export default function AvisoMigradoBanner({ detalhe }: { detalhe?: string }) {
  return (
    <div className="mb-4 text-sm rounded-lg px-4 py-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
      <strong>Esta tela foi substituída por Configurações &gt; Avisos.</strong> As alterações feitas aqui não têm mais efeito principal.{" "}
      <Link href="/painel/avisos-config" className="underline font-semibold">Ir para Avisos</Link>
      {detalhe ? <> {detalhe}</> : null}
    </div>
  );
}
