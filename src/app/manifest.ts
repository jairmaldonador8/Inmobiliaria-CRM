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
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
