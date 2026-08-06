/**
 * Consulta de lectura de visitas de UN lead, para la sección «Visitas» de
 * su ficha (asesor y admin). Recibe el cliente de Supabase por parámetro
 * (cliente de SESIÓN siempre — mismo patrón que `src/lib/dashboard/consultas.ts`
 * y `proximasVisitas`): RLS de `visitas` (migración 0002) ya acota a las
 * visitas del asesor dueño del lead, o a todas si es admin.
 *
 * Este archivo es NUEVO (no es `src/lib/dashboard/consultas.ts`, que está
 * fuera de alcance de esta corrección) — vive en `lib/visitas` junto a
 * `acciones.ts`/`validacion.ts` porque es la misma entidad, pero ninguno de
 * esos dos archivos se toca aquí.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type VisitaLead = {
  id: string
  /** Fecha/hora ISO 8601 con offset (UTC); formatear en America/Monterrey al mostrar. */
  fecha: string
  duracionMin: number
  estado: 'agendada' | 'realizada' | 'cancelada'
  propiedadTitulo: string | null
}

type FilaVisitaLead = {
  id: string
  fecha: string
  duracion_min: number
  estado: 'agendada' | 'realizada' | 'cancelada'
  propiedad: { titulo: string } | null
}

/**
 * Visitas de un lead: las `agendada` primero (la más próxima arriba —
 * "qué falta por hacer"), seguidas del historial (`realizada`/`cancelada`,
 * la más reciente arriba). Sin límite: un lead no acumula tantas visitas
 * como para que haga falta paginar.
 */
export async function visitasDelLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<VisitaLead[]> {
  const { data, error } = await supabase
    .from('visitas')
    .select('id, fecha, duracion_min, estado, propiedad:propiedades(titulo)')
    .eq('lead_id', leadId)
    .order('fecha', { ascending: false })

  if (error) {
    throw new Error(`No se pudieron obtener las visitas del lead: ${error.message}`)
  }

  const visitas: VisitaLead[] = ((data ?? []) as unknown as FilaVisitaLead[]).map((fila) => ({
    id: fila.id,
    fecha: fila.fecha,
    duracionMin: fila.duracion_min,
    estado: fila.estado,
    propiedadTitulo: fila.propiedad?.titulo ?? null,
  }))

  const agendadas = visitas
    .filter((v) => v.estado === 'agendada')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const historial = visitas
    .filter((v) => v.estado !== 'agendada')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  return [...agendadas, ...historial]
}
