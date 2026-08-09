'use server'

/**
 * Marca «exclusiva» de propiedades (tabla propiedades_internas, Fase B
 * guardias). SOLO admin: la tabla es invisible para asesores a nivel de RLS
 * (sin policy para no-admins) y estas actions la refuerzan con requireAdmin.
 */
import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ResultadoAccion } from '@/lib/leads/acciones'

export async function marcarExclusiva(
  propiedadId: string,
  exclusiva: boolean
): Promise<ResultadoAccion> {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('propiedades_internas')
    .upsert(
      { propiedad_id: propiedadId, exclusiva, actualizado_en: new Date().toISOString() },
      { onConflict: 'propiedad_id' }
    )
  if (error) return { error: `No se pudo guardar la marca: ${error.message}` }

  revalidatePath(`/admin/propiedades/${propiedadId}`)
  return { ok: true }
}

/** ¿La propiedad está marcada exclusiva? (para pintar el toggle admin). */
export async function leerExclusiva(propiedadId: string): Promise<boolean> {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('propiedades_internas')
    .select('exclusiva')
    .eq('propiedad_id', propiedadId)
    .maybeSingle()
  return data?.exclusiva === true
}
