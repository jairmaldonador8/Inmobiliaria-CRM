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
};

export default nextConfig;
