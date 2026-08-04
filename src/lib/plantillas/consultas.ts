import 'server-only'

/**
 * Consultas de plantillas de WhatsApp para el panel admin (Task 19).
 *
 * Cliente de SESIÓN: RLS ya limita `plantillas_mensajes` a la agencia del
 * usuario (lectura permitida a cualquier autenticado, 0002_rls.sql).
 */

import { createClient } from '@/lib/supabase/server'

export type PlantillaItem = {
  id: string
  nombre: string
  texto: string
  activa: boolean
  creada_en: string
}

/**
 * Todas las plantillas (activas e inactivas), más antiguas primero — mismo
 * orden que usa el selector de WhatsApp del detalle de lead, para que el
 * admin vea aquí el orden real en el que aparecen al asesor.
 */
export async function listaPlantillas(): Promise<PlantillaItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('plantillas_mensajes')
    .select('id, nombre, texto, activa, creada_en')
    .order('creada_en', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar las plantillas: ${error.message}`)

  return (data ?? []) as PlantillaItem[]
}
