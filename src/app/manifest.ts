import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Klo-Ser · Montana Realty',
    short_name: 'Klo-Ser',
    description: 'Del lead al cierre',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2EDE4', // hueso (paleta Muro)
    theme_color: '#221B14', // tinta
    /*
      El gallo sobre mostaza, a sangre: sin esquinas redondeadas ni
      transparencia, porque cada sistema pone su propia forma (iOS redondea,
      Android puede recortar a círculo). El gallo ocupa el 56% del alto y está
      centrado, así queda dentro de la zona segura del recorte circular.

      Se declaran los mismos archivos dos veces, `any` y `maskable`: el tipo de
      Next no acepta el `"any maskable"` de la especificación en un solo campo,
      y sin `maskable` Android le monta una placa blanca alrededor en vez de
      usar el icono a sangre.
    */
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
