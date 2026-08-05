'use client'

/**
 * Gráfica de línea SVG (sparkline) del kit Fintech Muro: normaliza una
 * serie de números a un viewBox `0 0 100 {alto}`, traza una curva suave
 * (Catmull-Rom → Bézier, ver src/lib/fintech/curva.ts) con un área
 * degradada debajo. Sin librerías externas.
 *
 * - Serie plana (todos los valores iguales) renderiza una línea horizontal
 *   a media altura en vez de NaN (evita dividir entre un rango de 0).
 * - El id del `linearGradient` se deriva de `useId()` — necesario porque
 *   un id fijo se rompe si la gráfica se monta más de una vez en la misma
 *   página (dos `fill="url(#id)"` apuntando al mismo degradado).
 * - A11y: si el valor ya se imprime al lado (etiquetaAccesible ausente),
 *   el SVG es puramente decorativo (`aria-hidden` + `focusable="false"`).
 *   Si no hay texto equivalente visible, se pasa `etiquetaAccesible` con
 *   la conclusión (p. ej. "Leads subieron 12% en 30 días") y el SVG se
 *   expone como `role="img"` con un `<title>`.
 */

import { useId } from 'react'

import { cn } from '@/lib/utils'
import { dArea, dLinea, type Punto } from '@/lib/fintech/curva'

interface GraficaLineaProps {
  /** Serie de valores a graficar, en orden cronológico. */
  datos: number[]
  /** Color del trazo y del degradado del área. */
  color?: string
  /** Alto del viewBox (el ancho siempre normaliza a 100). */
  alto?: number
  /**
   * Texto que resume la conclusión de la gráfica para lectores de
   * pantalla. Si se omite, el SVG se marca como decorativo.
   */
  etiquetaAccesible?: string
  className?: string
}

/** Margen vertical (arriba y abajo) como fracción del alto, para que la curva no toque los bordes. */
const PADDING_VERTICAL = 0.08

/** Convierte la serie de números en puntos {x,y} dentro del viewBox `0 0 100 {alto}`. */
function construirPuntos(datos: number[], alto: number): Punto[] {
  const n = datos.length
  if (n === 0) return []

  const min = Math.min(...datos)
  const max = Math.max(...datos)
  const rango = max - min

  const padding = alto * PADDING_VERTICAL
  const alturaUtil = alto - padding * 2

  return datos.map((valor, indice) => {
    const x = n === 1 ? 50 : (indice / (n - 1)) * 100
    // Serie plana: todos a media altura, sin dividir entre un rango de 0.
    const proporcion = rango === 0 ? 0.5 : (valor - min) / rango
    // El eje Y del SVG crece hacia abajo: se invierte para que el valor
    // más alto quede arriba.
    const y = padding + (1 - proporcion) * alturaUtil
    return { x, y }
  })
}

/** Los ids de useId() traen ':' (p. ej. ":r0:"), inválido para `url(#id)` en SVG. */
function idSvgValido(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export default function GraficaLinea({
  datos,
  color = '#C98A3B',
  alto = 72,
  etiquetaAccesible,
  className,
}: GraficaLineaProps) {
  const idGradiente = `grafica-linea-gradiente-${idSvgValido(useId())}`
  const puntos = construirPuntos(datos, alto)

  // Con 0 o 1 puntos no hay curva que trazar (dLinea/dArea devuelven '').
  if (puntos.length < 2) return null

  return (
    <svg
      viewBox={`0 0 100 ${alto}`}
      width="100%"
      preserveAspectRatio="none"
      className={cn(className)}
      {...(etiquetaAccesible
        ? { role: 'img' as const }
        : { 'aria-hidden': true, focusable: 'false' })}
    >
      {etiquetaAccesible && <title>{etiquetaAccesible}</title>}
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={dArea(puntos, alto)} fill={`url(#${idGradiente})`} stroke="none" />
      <path
        d={dLinea(puntos)}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
