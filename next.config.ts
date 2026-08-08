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
      // El sandbox de EasyBroker (api.stagingeb.com, el que usa DEV) sirve las
      // fotos desde un host ficticio. Sin esto, la lista de propiedades en
      // local revienta con "Invalid src prop" y no se puede probar la pantalla.
      // Fuera de producción únicamente: en Vercel NODE_ENV es "production" al
      // compilar, así que el host falso nunca llega al build real.
      ...(process.env.NODE_ENV === "production"
        ? []
        : [{ protocol: "https" as const, hostname: "assets.example.test" }]),
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
