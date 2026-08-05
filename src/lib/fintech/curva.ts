/**
 * Utilidades puras para generar paths SVG de curvas suaves (Catmull-Rom
 * convertida a Bézier cúbica) a partir de una serie de puntos. Sin
 * dependencias de React — se pueden probar de forma aislada (ver
 * src/test/fintech-curva.test.ts) y las usa el componente GraficaLinea.
 *
 * Para el segmento que va de P1 a P2 (con vecinos P0 y P3 — se duplica el
 * extremo correspondiente en el primer y último segmento de la serie),
 * los puntos de control de la Bézier equivalente son:
 *
 *   B1 = P1 + (P2 − P0) / 6
 *   B2 = P2 − (P3 − P1) / 6
 *
 * Nota: B2 RESTA, no suma — es el error más fácil de cometer al copiar la
 * fórmula de memoria.
 *
 * El eje Y de cada punto de control se recorta (clamp) al rango del propio
 * segmento — [min(P1.y, P2.y), max(P1.y, P2.y)] — para que la curva nunca
 * "invente" picos o valles por fuera de los datos reales.
 */

/** Punto 2D genérico usado por las curvas del kit Fintech Muro. */
export interface Punto {
  x: number
  y: number
}

/** Redondea a 2 decimales para que los strings del path sean estables entre renders. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

function formatoPunto(p: Punto): string {
  return `${redondear(p.x)},${redondear(p.y)}`
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(Math.max(valor, min), max)
}

interface Segmento {
  b1: Punto
  b2: Punto
  fin: Punto
}

/** Calcula los puntos de control Catmull-Rom→Bézier de cada segmento de la serie. */
function calcularSegmentos(puntos: Punto[]): Segmento[] {
  const n = puntos.length
  const segmentos: Segmento[] = []

  for (let i = 0; i < n - 1; i++) {
    // Duplica el extremo cuando no hay vecino real (primer/último segmento).
    const p0 = puntos[i - 1] ?? puntos[i]
    const p1 = puntos[i]
    const p2 = puntos[i + 1]
    const p3 = puntos[i + 2] ?? puntos[i + 1]

    const yMin = Math.min(p1.y, p2.y)
    const yMax = Math.max(p1.y, p2.y)

    const b1: Punto = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: clamp(p1.y + (p2.y - p0.y) / 6, yMin, yMax),
    }
    const b2: Punto = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: clamp(p2.y - (p3.y - p1.y) / 6, yMin, yMax),
    }

    segmentos.push({ b1, b2, fin: p2 })
  }

  return segmentos
}

/**
 * Path `d` de la línea (sin cerrar) que pasa suavemente por `puntos`.
 * Devuelve `''` con 0 o 1 puntos (no hay curva que trazar).
 */
export function dLinea(puntos: Punto[]): string {
  if (puntos.length < 2) return ''

  const partes = [`M ${formatoPunto(puntos[0])}`]
  for (const { b1, b2, fin } of calcularSegmentos(puntos)) {
    partes.push(`C ${formatoPunto(b1)} ${formatoPunto(b2)} ${formatoPunto(fin)}`)
  }
  return partes.join(' ')
}

/**
 * Path `d` del área bajo la curva: la misma línea de `dLinea`, cerrada
 * hasta `baseline` (típicamente el fondo del viewBox). Devuelve `''` con
 * 0 o 1 puntos.
 */
export function dArea(puntos: Punto[], baseline: number): string {
  if (puntos.length < 2) return ''

  const linea = dLinea(puntos)
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  const base = redondear(baseline)

  return `${linea} L ${redondear(ultimo.x)},${base} L ${redondear(primero.x)},${base} Z`
}
