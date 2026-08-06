/**
 * Construcción del mensaje de confirmación de visita por WhatsApp.
 *
 * Función PURA (sin 'use client' ni dependencias de React/servidor): arma
 * el texto que se prellena en el deep link de WhatsApp cuando el asesor
 * agenda una visita desde la ficha del lead — igual que
 * `src/lib/plantillas/rellenar.ts`, se usa tal cual en el cliente para
 * construir el toast de confirmación.
 *
 * La propiedad es OPCIONAL (requisito explícito del spec): un lead puede
 * agendar una visita sin tener una propiedad de interés vinculada, y el
 * mensaje debe leerse bien en ambos casos.
 *
 * Fecha/hora en es-MX, zona America/Monterrey — mismo patrón que
 * `formatearFechaVisita` en `src/lib/visitas/acciones.ts` y que
 * `src/lib/dashboard/consultas.ts`. IMPORTANTE: `datos.fecha` debe llegar
 * como ISO 8601 CON offset (UTC) — quien arma `DatosConfirmacionVisita` es
 * responsable de esa conversión (ver `hoja-agendar-visita.tsx`), aquí solo
 * se formatea para mostrar.
 */

const ZONA_HORARIA = 'America/Monterrey'

export type DatosConfirmacionVisita = {
  leadNombre: string
  /** Fecha/hora de la visita en ISO 8601 con offset (UTC). */
  fecha: string
  duracionMin: number
  /** Título de la propiedad de interés; null/undefined si no aplica. */
  propiedadTitulo?: string | null
  asesorNombre: string
}

/** Fecha/hora legible en español, en la zona horaria del negocio. */
function formatearFechaVisita(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

/** Duración legible: minutos si es menor a una hora, si no horas (+ minutos si sobran). */
function formatearDuracionVisita(duracionMin: number): string {
  if (duracionMin < 60) return `${duracionMin} min`

  const horas = Math.floor(duracionMin / 60)
  const minutos = duracionMin % 60
  const textoHoras = `${horas} ${horas === 1 ? 'hora' : 'horas'}`
  return minutos === 0 ? textoHoras : `${textoHoras} ${minutos} min`
}

/**
 * Arma el texto de confirmación de la visita. Sin propiedad, se omite esa
 * cláusula de la oración por completo (sin conectores ni espacios colgando).
 */
export function armarMensajeConfirmacionVisita(datos: DatosConfirmacionVisita): string {
  const fechaTexto = formatearFechaVisita(datos.fecha)
  const duracionTexto = formatearDuracionVisita(datos.duracionMin)
  const clausulaPropiedad = datos.propiedadTitulo ? ` para ${datos.propiedadTitulo}` : ''

  return (
    `Hola ${datos.leadNombre}, te confirmo tu visita${clausulaPropiedad} el ${fechaTexto} ` +
    `(duración aprox. ${duracionTexto}). Te espero, ${datos.asesorNombre}.`
  )
}

/** URL de wa.me con el mensaje ya codificado, lista para abrir. */
export function armarUrlConfirmacionVisita(telefono: string, mensaje: string): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`
}
