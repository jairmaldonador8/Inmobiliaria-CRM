import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Fotos de propiedades sincronizadas desde EasyBroker (verificado contra
    // filas reales: todas las URLs viven en assets.easybroker.com).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.easybroker.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
};

export default nextConfig;
