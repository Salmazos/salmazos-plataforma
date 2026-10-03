import Link from "next/link";

// Aviso nas telas antigas de destinatários: a configuração agora vive em Configurações > Avisos.
export default function AvisoMigradoBanner({ detalhe }: { detalhe?: string }) {
  return (
    <div className="mb-4 text-sm rounded-lg px-4 py-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
      <strong>Migrada para Avisos.</strong> Esta tela será desativada em breve — configure os destinatários em{" "}
      <Link href="/painel/avisos-config" className="underline font-semibold">Configurações &gt; Avisos</Link>.{" "}
      {detalhe ?? "Depois que a migração dos dados for aplicada, alterações feitas aqui deixam de afetar os avisos."}
    </div>
  );
}
