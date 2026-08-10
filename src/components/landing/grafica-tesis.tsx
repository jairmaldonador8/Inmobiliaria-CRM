'use client'

import { useEffect, useRef, useState } from 'react'

/** Las ocho mediciones del ejemplo: x, y y el retraso con que la luz las deposita. */
const PUNTOS = [
  { x: 10, y: 28, ms: 41 },
  { x: 70, y: 42, ms: 286 },
  { x: 130, y: 38, ms: 532 },
  { x: 190, y: 64, ms: 777 },
  { x: 250, y: 78, ms: 1023 },
  { x: 310, y: 92, ms: 1268 },
  { x: 370, y: 104, ms: 1514 },
  { x: 430, y: 112, ms: 1759, final: true },
]

const TRAZO = 'M10,28 L70,42 L130,38 L190,64 L250,78 L310,92 L370,104 L430,112'

/** Barrido (1800) + cifra que sube (1900 + 650): lo que tarda una pasada. */
const DURACION_MS = 2550
/** Respiro entre pasadas, a petición: la gráfica se relee cada tanto. */
const PAUSA_MS = 3000

/**
 * Gráfica animada de «La tesis del sistema»: una línea de luz cruza el
 * cuadro revelando retícula y trazo mientras deposita cada medición a su
 * paso (mockup aprobado: docs/diseno/animacion-mezcla.html, mezcla 1).
 *
 * Arranca cuando la sección entra en pantalla y se repite en bucle con una
 * pausa entre pasadas. Los retrasos de cada punto están calculados contra un
 * barrido lineal de 1800 ms, así que la luz «toca» el punto justo cuando
 * aparece. Las animaciones viven en globals.css (`.tesis-*`).
 *
 * El bucle solo corre mientras la gráfica está a la vista (el observador no
 * se desconecta) y se apaga con «reducir movimiento». Cada pasada remonta el
 * <svg> vía `key`: es la forma fiable de reiniciar animaciones CSS en React.
 */
export function GraficaTesis() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [pasada, setPasada] = useState(0)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    // Sin IntersectionObserver (navegador viejo) se muestra animada de una vez.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observador = new IntersectionObserver(
      ([entrada]) => setVisible(entrada.isIntersecting),
      { threshold: 0.35 }
    )
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setPasada((n) => n + 1), DURACION_MS + PAUSA_MS)
    return () => clearInterval(id)
  }, [visible])

  return (
    <div ref={ref} className={visible ? 'tesis-go' : undefined}>
      <div className="flex items-baseline justify-between border-b border-[#26241F] pb-3 text-[10px] tracking-[0.2em] uppercase text-[#7A776E]">
        <span>1.ª respuesta · mediana semanal</span>
        <span>ejemplo · 8 semanas</span>
      </div>
      <svg key={pasada} viewBox="0 0 440 150" className="mt-4 w-full" fill="none" aria-hidden>
        {/* Todo lo que la luz revela a su paso */}
        <g className="tesis-capa">
          <path d="M0,120 H440" stroke="#26241F" strokeWidth="1" />
          <path d="M0,70 H440" stroke="#26241F" strokeWidth="1" strokeDasharray="2 5" />
          <text x="10" y="18" fill="#7A776E" fontSize="11">
            4 h 20 min
          </text>
          <path
            d={TRAZO}
            stroke="#F2F0EA"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Las mediciones, depositadas al paso de la luz */}
        {PUNTOS.map((p) => (
          <circle
            key={p.x}
            className="tesis-pt"
            cx={p.x}
            cy={p.y}
            r={p.final ? 4 : 2.8}
            fill="#F2F0EA"
            style={{ animationDelay: `${p.ms}ms` }}
          />
        ))}

        {/* La luz: halo ancho + filamento */}
        <line className="tesis-halo" x1="0" y1="4" x2="0" y2="146" stroke="#F2F0EA" strokeWidth="7" />
        <line className="tesis-luz" x1="0" y1="4" x2="0" y2="146" stroke="#F2F0EA" strokeWidth="1" />

        <text
          className="tesis-lbl"
          x="434"
          y="140"
          textAnchor="end"
          fill="#F2F0EA"
          fontSize="12"
          fontWeight="600"
        >
          7 min ↓
        </text>
      </svg>
    </div>
  )
}
