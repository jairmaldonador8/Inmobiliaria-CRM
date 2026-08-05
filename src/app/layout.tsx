import type { Metadata, Viewport } from "next";
import { Geist_Mono, Jost, Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jost = Jost({
  variable: "--font-logo",
  subsets: ["latin"],
  weight: ["200", "300"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klo-Ser · Montana Realty",
  description: "El CRM de Montana Realty — del lead al cierre",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin cover, TODOS los env(safe-area-inset-*) valen 0 en iPhone — la app ya
  // los usa (nav asesor, bottom sheets); esto los enciende de verdad.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${jost.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
