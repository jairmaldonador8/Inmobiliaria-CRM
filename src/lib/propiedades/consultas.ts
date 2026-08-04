/**
 * Helpers de consulta compartidos entre las vistas admin y asesor de
 * propiedades.
 */

/**
 * Filtro `.or()` de PostgREST para búsqueda por texto en titulo/ubicacion.
 * Devuelve null si tras sanitizar no queda término útil.
 *
 * Se eliminan caracteres con significado en la sintaxis de filtros de
 * PostgREST (comas, paréntesis) y los comodines de LIKE, para que un término
 * arbitrario no rompa ni manipule el filtro.
 */
export function filtroBusqueda(q: string | undefined): string | null {
  const termino = (q ?? '').replace(/[,()%\\]/g, ' ').trim()
  if (!termino) return null
  return `titulo.ilike.%${termino}%,ubicacion.ilike.%${termino}%`
}
