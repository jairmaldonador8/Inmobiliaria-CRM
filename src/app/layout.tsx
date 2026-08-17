import type { Metadata, Viewport } from "next";
import { Geist_Mono, Jost, Poppins } from "next/font/google";
import { cookies } from "next/headers";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tema PLUMA: la cookie la escribe CambiarTema; leerla aquí evita el
  // parpadeo claro→oscuro al recargar (el html ya llega con la clase).
  const tema = (await cookies()).get("tema")?.value;
  const oscuro = tema === "negro" ? " dark" : "";

  return (
    <html
      lang="es"
      className={`${poppins.variable} ${jost.variable} ${geistMono.variable} h-full antialiased${oscuro}`}
    >
      {/* overflow-x-clip: red de seguridad — ningún elemento pasado de ancho
          debe convertirse en scroll horizontal de página en el teléfono
          (reporte de Arturo, Live test 2026-08-17). clip no crea contenedor
          de scroll, así que sticky/fixed siguen funcionando. */}
      <body className="min-h-full flex flex-col overflow-x-clip">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
