import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TEMP DEBUG: habilita source maps do browser em produção pra decodificar
  // stack trace real de um erro de hidratação — não muda nenhum comportamento
  // em runtime, só o que o DevTools consegue mostrar. Reverter depois de
  // identificar a causa do erro #418.
  productionBrowserSourceMaps: true,
  serverExternalPackages: ["sharp"],
  // O PDF da proposta lê public/propostas/** com fs em tempo de execução (nada é importado), então o Next não
  // enxerga essas pastas sozinho: sem isto elas ficam de fora do bundle da função na Vercel.
  outputFileTracingIncludes: {
    "/api/comercial/propostas/[id]/pdf": ["./public/propostas/**/*"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "vagas.salmazos.com.br",
          },
        ],
        destination: "/vagas",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
