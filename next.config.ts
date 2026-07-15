import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
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
