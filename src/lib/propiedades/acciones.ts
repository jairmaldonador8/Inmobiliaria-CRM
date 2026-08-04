'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { PORTALES_MANUALES } from '@/lib/propiedades/portales'

export type ResultadoAccion = { ok: true } | { error: string }

function revalidarPropiedad(propiedadId: string) {
  revalidatePath('/admin/propiedades')
  revalidatePath(`/admin/propiedades/${propiedadId}`)
  revalidatePath('/asesor/propiedades')
  revalidatePath(`/asesor/propiedades/${propiedadId}`)
}

/**
 * Asigna (o quita, con null) el asesor responsable de una propiedad.
 * Solo admins; usa service-role porque la escritura es sobre el inventario
 * completo, no sobre filas propias.
 */
export async function asignarAsesorPropiedad(
  propiedadId: string,
  asesorId: string | null
): Promise<ResultadoAccion> {
  await requireAdmin()

  const supabase = createAdminClient()

  if (asesorId) {
    const { data: asesor, error } = await supabase
      .from('usuarios')
      .select('user_id, rol, activo')
      .eq('user_id', asesorId)
      .maybeSingle()
    if (error) return { error: `No se pudo verificar al asesor: ${error.message}` }
    if (!asesor || asesor.rol !== 'asesor' || !asesor.activo) {
      return { error: 'El asesor seleccionado no existe o está inactivo' }
    }
  }

  const { data, error } = await supabase
    .from('propiedades')
    .update({ asesor_id: asesorId })
    .eq('id', propiedadId)
    .select('id')
  if (error) return { error: `No se pudo asignar el responsable: ${error.message}` }
  if (!data || data.length === 0) return { error: 'La propiedad no existe' }

  revalidarPropiedad(propiedadId)
  return { ok: true }
}

/**
 * Marca o desmarca un portal manual para una propiedad. Marcar hace upsert
 * (unique propiedad_id+portal, seguro ante doble clic) registrando qué admin
 * lo marcó; desmarcar borra la fila.
 */
export async function togglePortal(
  propiedadId: string,
  portal: string,
  marcado: boolean
): Promise<ResultadoAccion> {
  const admin = await requireAdmin()

  if (!(PORTALES_MANUALES as readonly string[]).includes(portal)) {
    return { error: 'Portal no reconocido' }
  }

  const supabase = createAdminClient()

  if (marcado) {
    const { error } = await supabase
      .from('propiedad_portales')
      .upsert(
        { propiedad_id: propiedadId, portal, marcado_por: admin.user_id },
        { onConflict: 'propiedad_id,portal' }
      )
    if (error) return { error: `No se pudo marcar el portal: ${error.message}` }
  } else {
    const { error } = await supabase
      .from('propiedad_portales')
      .delete()
      .eq('propiedad_id', propiedadId)
      .eq('portal', portal)
    if (error) return { error: `No se pudo desmarcar el portal: ${error.message}` }
  }

  revalidatePath(`/admin/propiedades/${propiedadId}`)
  return { ok: true }
}
