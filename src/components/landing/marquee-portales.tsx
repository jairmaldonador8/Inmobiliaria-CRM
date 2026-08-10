/**
 * Cinta infinita de portales conectados (landing pública).
 *
 * La pista se renderiza DOS veces y se desplaza -50%: al terminar el primer
 * juego, el segundo está exactamente en su lugar, así el ciclo no tiene
 * costura. La animación vive en globals.css (`.marquee-pista`) y se detiene
 * con `prefers-reduced-motion`.
 *
 * Tratamiento tipográfico, no logotipos: evita usar marcas registradas de
 * terceros. Si algún día se consiguen los SVG oficiales, van en
 * `public/portales/<slug>.svg` y aquí se cambia el <span> por un <Image>
 * con `grayscale`.
 */
const PORTALES = [
  'EasyBroker',
  'Inmuebles24',
  'Mercado Libre',
  'Vivanuncios',
  'Lamudi',
  'Propiedades.com',
  'Casas y Terrenos',
  'Icasas',
  'Trovit',
  'Metros Cúbicos',
  'WhatsApp',
]

function Pista({ ocultarALectores }: { ocultarALectores?: boolean }) {
  return (
    <ul
      aria-hidden={ocultarALectores}
      className="flex shrink-0 items-center gap-12 pr-12"
    >
      {PORTALES.map((portal) => (
        <li
          key={portal}
          className="text-[15px] font-medium tracking-[0.06em] whitespace-nowrap text-[#8C8A84]"
        >
          {portal}
        </li>
      ))}
    </ul>
  )
}

export function MarqueePortales() {
  return (
    <div className="relative overflow-hidden py-1 [contain:paint] [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="marquee-pista flex w-max [transform-style:preserve-3d]">
        <Pista />
        <Pista ocultarALectores />
      </div>
    </div>
  )
}
