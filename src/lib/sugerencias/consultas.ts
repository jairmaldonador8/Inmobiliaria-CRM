import 'server-only'

/**
 * Consultas de sugerencias internas para el panel admin.
 *
 * Cliente de SESIÓN: RLS ya limita `sugerencias` a "autor o admin"
 * (0002_rls.sql) — un admin ve todas, así que no hace falta filtrar a mano.
 */

import { createClient } from '@/lib/supabase/server'

export type SugerenciaItem = {
  id: string
  pantalla: string
  texto: string
  estado: string
  creada_en: string
  autor_nombre: string | null
}

type FilaSugerencia = {
  id: string
  pantalla: string
  texto: string
  estado: string
  creada_en: string
  autor: { nombre: string } | null
}

/** Todas las sugerencias, más recientes primero, con el nombre del autor. */
export async function listaSugerencias(): Promise<SugerenciaItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sugerencias')
    .select('id, pantalla, texto, estado, creada_en, autor:usuarios!autor_id(nombre)')
    .order('creada_en', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar las sugerencias: ${error.message}`)

  return ((data ?? []) as unknown as FilaSugerencia[]).map((fila) => ({
    id: fila.id,
    pantalla: fila.pantalla,
    texto: fila.texto,
    estado: fila.estado,
    creada_en: fila.creada_en,
    autor_nombre: fila.autor?.nombre ?? null,
  }))
}
