'use server'

/**
 * Server Actions del CRUD de plantillas de WhatsApp (Task 19).
 *
 * Cliente de SESIÓN en todas: RLS (0002_rls.sql) ya restringe insert/update/
 * delete de `plantillas_mensajes` a admins, así que requireAdmin() + la
 * policy son dos capas de la misma regla, no una duplicada inútil.
 */

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'

export type ResultadoAccionPlantilla = { ok: true } | { error: string }

const MAX_NOMBRE = 100
const MAX_TEXTO = 1000

/** Valida nombre/texto ya recortados; null si son válidos. */
function validar(nombre: string, texto: string): string | null {
  if (!nombre) return 'El nombre es obligatorio'
  if (nombre.length > MAX_NOMBRE) return `El nombre no puede superar los ${MAX_NOMBRE} caracteres`
  if (!texto) return 'El texto es obligatorio'
  if (texto.length > MAX_TEXTO) return `El texto no puede superar los ${MAX_TEXTO} caracteres`
  return null
}

/** Crea una plantilla para la agencia del admin en sesión. */
export async function crearPlantilla(
  nombre: string,
  texto: string
): Promise<ResultadoAccionPlantilla> {
  const usuario = await requireAdmin()

  const nombreLimpio = nombre.trim()
  const textoLimpio = texto.trim()
  const errorValidacion = validar(nombreLimpio, textoLimpio)
  if (errorValidacion) return { error: errorValidacion }

  const supabase = await createClient()

  const { error } = await supabase.from('plantillas_mensajes').insert({
    agencia_id: usuario.agencia_id,
    nombre: nombreLimpio,
    texto: textoLimpio,
  })

  if (error) return { error: `No se pudo crear la plantilla: ${error.message}` }

  revalidatePath('/admin/ajustes')
  return { ok: true }
}

/** Edita nombre y texto de una plantilla existente. */
export async function editarPlantilla(
  id: string,
  nombre: string,
  texto: string
): Promise<ResultadoAccionPlantilla> {
  await requireAdmin()

  const nombreLimpio = nombre.trim()
  const textoLimpio = texto.trim()
  const errorValidacion = validar(nombreLimpio, textoLimpio)
  if (errorValidacion) return { error: errorValidacion }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('plantillas_mensajes')
    .update({ nombre: nombreLimpio, texto: textoLimpio })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    return { error: 'No se pudo actualizar la plantilla' }
  }

  revalidatePath('/admin/ajustes')
  return { ok: true }
}

/** Activa o desactiva una plantilla (las inactivas no aparecen en el selector de WhatsApp). */
export async function alternarActiva(
  id: string,
  activa: boolean
): Promise<ResultadoAccionPlantilla> {
  await requireAdmin()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('plantillas_mensajes')
    .update({ activa })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    return { error: 'No se pudo actualizar la plantilla' }
  }

  revalidatePath('/admin/ajustes')
  return { ok: true }
}

/** Elimina una plantilla. */
export async function eliminarPlantilla(id: string): Promise<ResultadoAccionPlantilla> {
  await requireAdmin()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('plantillas_mensajes')
    .delete()
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    return { error: 'No se pudo eliminar la plantilla' }
  }

  revalidatePath('/admin/ajustes')
  return { ok: true }
}
