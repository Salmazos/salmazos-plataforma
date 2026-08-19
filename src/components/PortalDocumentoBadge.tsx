"use client";

import { useState } from "react";

interface Props {
  label: string;
  bg: string;
  text: string;
  // Endpoint que devolve { signedUrl } — /api/portal/funcionarios/[id]/contrato-url ou
  // .../aso-url. Ausente quando não há documento pra abrir (aí o badge é só texto,
  // mesmo padrão de badge estático usado no resto do projeto).
  url: string | null;
}

// Badge de status que também funciona como botão de abrir documento, quando `url` existe —
// mesmo padrão de handleVerArquivo/handleVerArquivoContrato em FuncionarioDetalheClient.tsx
// (painel interno), adaptado pra portal do cliente: busca o signedUrl na rota correspondente
// e abre em nova aba. Sem `url`, renderiza só o badge estático (não clicável).
export default function PortalDocumentoBadge({ label, bg, text, url }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const estiloBase: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    background: bg,
    color: text,
  };

  if (!url) {
    return <span style={estiloBase}>{label}</span>;
  }

  const handleClick = async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao abrir documento.");
      window.open(json.signedUrl, "_blank");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={carregando}
        style={{
          ...estiloBase,
          border: "none",
          textDecoration: "underline",
          cursor: carregando ? "wait" : "pointer",
          opacity: carregando ? 0.6 : 1,
        }}
      >
        {carregando ? "Abrindo..." : label}
      </button>
      {erro && <p style={{ fontSize: 10, color: "#DC2626", marginTop: 2 }}>{erro}</p>}
    </div>
  );
}
