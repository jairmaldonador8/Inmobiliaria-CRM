'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

/**
 * Tríptico editorial de la landing: tres piezas brutalistas en grayscale que
 * entran escalonadas cuando la sección aparece. Fotografías de Pexels
 * (licencia libre para uso comercial, sin atribución obligatoria); se
 * muestran en 4:5 y en móvil se apilan.
 */
const PIEZAS = [
  {
    src: '/landing/br-chevron.jpg',
    alt: 'Arista simétrica de concreto vista desde abajo',
    pos: 'center 45%',
  },
  {
    src: '/landing/br-rejilla.jpg',
    alt: 'Fachada de celdas de concreto en diagonal',
    pos: 'center 50%',
  },
  {
    src: '/landing/br-curvas.jpg',
    alt: 'Balcones curvos de concreto en perspectiva',
    pos: 'center 40%',
  },
]

export function Triptico() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true)
          observador.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`grid gap-4 sm:grid-cols-3 ${visible ? 'gal-go' : ''}`}
    >
      {PIEZAS.map((pieza, indice) => (
        <div
          key={pieza.src}
          className="gal-item group relative aspect-4/5 overflow-hidden"
          style={{ animationDelay: `${indice * 140}ms` }}
        >
          <Image
            src={pieza.src}
            alt={pieza.alt}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover grayscale transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
            style={{ objectPosition: pieza.pos }}
          />
        </div>
      ))}
    </div>
  )
}
