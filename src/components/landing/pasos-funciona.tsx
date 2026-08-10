'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Los cuatro pasos de «Cómo funciona», con el set A de animación aprobado
 * (docs/diseno/animacion-pasos.html): cada ícono actúa lo que dice. Corren
 * una sola vez, en cascada de izquierda a derecha, cuando la sección entra
 * en pantalla. Los keyframes viven en globals.css (`.p-*`).
 *
 * Los retrasos se pasan inline porque dependen de la posición de la tarjeta:
 * `base` desplaza toda la tarjeta y cada elemento suma el suyo.
 */
const CASCADA_MS = 120

function IconoLead({ base }: { base: number }) {
  return (
    <svg width="120" height="34" fill="none" aria-hidden>
      <circle cx="8" cy="17" r="4" stroke="#141414" strokeWidth="1.3" />
      <path d="M14,17 H104" stroke="#D0CEC7" strokeWidth="1.2" strokeDasharray="3 4" />
      <circle
        className="p-viaja"
        cx="8"
        cy="17"
        r="1.9"
        fill="#141414"
        style={{ animationDelay: `${base + 250}ms` }}
      />
      <path
        className="p-flecha"
        d="M100,13 L106,17 L100,21"
        stroke="#141414"
        strokeWidth="1.3"
        style={{ animationDelay: `${base + 1600}ms` }}
      />
    </svg>
  )
}

function IconoGuardia({ base }: { base: number }) {
  return (
    <svg width="120" height="34" fill="none" aria-hidden>
      <circle
        className="p-circ"
        cx="17"
        cy="17"
        r="9"
        stroke="#141414"
        strokeWidth="1.3"
        pathLength="1"
        style={{ animationDelay: `${base + 150}ms` }}
      />
      <path
        className="p-check"
        d="M13,17.5 L16,20.5 L22,13.5"
        stroke="#141414"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        style={{ animationDelay: `${base + 800}ms` }}
      />
    </svg>
  )
}

function IconoEscalamiento({ base }: { base: number }) {
  return (
    <svg width="120" height="34" fill="none" aria-hidden>
      <path
        className="p-esc"
        d="M8,26 L28,26 L28,14 L48,14 L48,20 L68,20 L68,8 L88,8"
        stroke="#141414"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        style={{ animationDelay: `${base + 150}ms` }}
      />
      <circle
        className="p-pt"
        cx="88"
        cy="8"
        r="2.5"
        fill="#141414"
        style={{ animationDelay: `${base + 2050}ms` }}
      />
    </svg>
  )
}

function IconoMedicion({ base }: { base: number }) {
  const barras = [
    { x: 8, y: 18, alto: 10, color: '#D0CEC7', ms: 0 },
    { x: 20, y: 12, alto: 16, color: '#8C8A84', ms: 130 },
    { x: 32, y: 20, alto: 8, color: '#D0CEC7', ms: 260 },
    { x: 44, y: 6, alto: 22, color: '#141414', ms: 390 },
  ]
  return (
    <svg width="120" height="34" fill="none" aria-hidden>
      {barras.map((b) => (
        <rect
          key={b.x}
          className="p-barra"
          x={b.x}
          y={b.y}
          width="7"
          height={b.alto}
          fill={b.color}
          style={{ animationDelay: `${base + b.ms}ms` }}
        />
      ))}
    </svg>
  )
}

const PASOS = [
  {
    n: '01',
    t: 'El lead entra',
    d: 'Portal, WhatsApp o referido: cae a la cola con su propiedad, su fuente y su mensaje.',
    Icono: IconoLead,
  },
  {
    n: '02',
    t: 'La guardia lo toma',
    d: 'El asesor de turno lo recibe al instante, con aviso en su teléfono.',
    Icono: IconoGuardia,
  },
  {
    n: '03',
    t: 'El sistema insiste',
    d: '¿Sin respuesta en 15 min? Recordatorio. ¿Sigue igual? Se abre a todos. ¿Nada? Aviso al dueño.',
    Icono: IconoEscalamiento,
  },
  {
    n: '04',
    t: 'Todo queda medido',
    d: 'Velocidad, embudo, fuentes y actividad: el tablero que la dirección lee cada lunes.',
    Icono: IconoMedicion,
  },
]

export function PasosComoFunciona() {
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
      { threshold: 0.3 }
    )
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`mt-14 grid gap-x-9 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 ${
        visible ? 'pasos-go' : ''
      }`}
    >
      {PASOS.map((paso, indice) => (
        <div key={paso.n} className="flex flex-col gap-2.5">
          <span className="text-[10px] tracking-[0.22em] text-[#A5A29A]">{paso.n}</span>
          <h3 className="text-lg font-medium">{paso.t}</h3>
          <p className="text-sm leading-relaxed text-[#6E6C66]">{paso.d}</p>
          <div className="mt-3">
            <paso.Icono base={indice * CASCADA_MS} />
          </div>
        </div>
      ))}
    </div>
  )
}
