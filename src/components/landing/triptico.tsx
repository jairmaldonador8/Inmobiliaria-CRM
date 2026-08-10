'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

/**
 * Tríptico editorial de la landing: tres verticales del moodboard, en
 * grayscale, que entran escalonadas cuando la sección aparece. Las fuentes
 * son verticales (2000 px de ancho), así que se muestran en 4:5 sin recortes
 * violentos; en móvil se apilan.
 */
const PIEZAS = [
  { src: '/landing/mb-torre.jpg', alt: 'Torre de volúmenes en voladizo contra el cielo', pos: 'center 40%' },
  { src: '/landing/mb-columnas.jpg', alt: 'Ritmo de columnas y sombras triangulares', pos: 'center 92%' },
  { src: '/landing/mb-luz.jpg', alt: 'Vano de concreto atravesado por un haz de luz', pos: 'center 50%' },
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
