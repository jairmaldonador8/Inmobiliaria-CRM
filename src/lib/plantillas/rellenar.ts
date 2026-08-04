/**
 * Relleno de plantillas de WhatsApp con variables {nombre} {propiedad}
 * {zona} {precio} {asesor}.
 *
 * Función PURA (sin 'server-only'): se usa en el servidor para armar el
 * mensaje y en el cliente para la vista previa en vivo del selector.
 *
 * El precio llega YA formateado por quien llama (formatearPrecio) — aquí
 * solo se sustituye texto.
 */

export const VARIABLES_PLANTILLA = [
  'nombre',
  'propiedad',
  'zona',
  'precio',
  'asesor',
] as const

export type VariablePlantilla = (typeof VARIABLES_PLANTILLA)[number]

export type ContextoPlantilla = Partial<Record<VariablePlantilla, string | null>>

/**
 * Marcador interno para variables sin valor: el carácter NUL jamás aparece
 * en el texto real de una plantilla.
 */
const MARCADOR = '\0'

/**
 * Sustituye las variables conocidas por su valor del contexto. Las que no
 * tienen valor se eliminan LIMPIAMENTE, incluidos sus separadores huérfanos:
 * «{propiedad} en {zona} — {precio}.» con solo propiedad queda
 * «Casa Bonita.» (sin «en — .» colgando).
 *
 * Estrategia simple y determinista: variable faltante → marcador; luego se
 * colapsan el conector « en » y el guion/raya pegados a un marcador, se
 * quitan los marcadores, se colapsan espacios dobles y se elimina el espacio
 * antes de puntuación.
 */
export function rellenarPlantilla(texto: string, contexto: ContextoPlantilla): string {
  let resultado = texto
  for (const variable of VARIABLES_PLANTILLA) {
    const valor = contexto[variable]?.trim()
    resultado = resultado.split(`{${variable}}`).join(valor || MARCADOR)
  }

  return (
    resultado
      // Conector « en » que precede a una variable faltante.
      .replace(/\s+en\s+\0/g, MARCADOR)
      // Raya/guion que precede a una variable faltante.
      .replace(/\s*[—–-]\s*\0/g, MARCADOR)
      .replace(/\0/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim()
  )
}
