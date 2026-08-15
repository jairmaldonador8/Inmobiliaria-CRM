'use server'

/**
 * Acciones de la bienvenida y del tema PLUMA.
 *
 * Usan el admin client (service role) pero SOLO sobre la fila del usuario
 * autenticado (requireAsesor deja pasar asesor y admin): no hay forma de
 * tocar el tema de otro. La cookie `tema` la maneja el cliente; aquí se
 * guarda la verdad que sigue al usuario entre dispositivos.
 */
import { revalidatePath } from 'next/cache'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'

export type ResultadoBienvenida = { ok: true } | { error: string }

export type TemaPluma = 'blanco' | 'negro'

function temaValido(tema: unknown): tema is TemaPluma {
  return tema === 'blanco' || tema === 'negro'
}

/** Persiste el tema del usuario actual (lo llama el switch de la luna). */
export async function guardarTema(tema: TemaPluma): Promise<ResultadoBienvenida> {
  const usuario = await requireAsesor()
  if (!temaValido(tema)) return { error: 'Tema no válido' }

  const { error } = await createAdminClient()
    .from('usuarios')
    .update({ tema })
    .eq('user_id', usuario.user_id)
  if (error) return { error: `No se pudo guardar el tema: ${error.message}` }
  return { ok: true }
}

/**
 * Cierra la bienvenida: fija el tema elegido y baja la bandera para que el
 * layout deje de redirigir. Idempotente.
 */
export async function completarBienvenida(tema: TemaPluma): Promise<ResultadoBienvenida> {
  const usuario = await requireAsesor()
  if (!temaValido(tema)) return { error: 'Tema no válido' }

  const { error } = await createAdminClient()
    .from('usuarios')
    .update({ tema, bienvenida_completada: true })
    .eq('user_id', usuario.user_id)
  if (error) return { error: `No se pudo completar la bienvenida: ${error.message}` }

  revalidatePath('/asesor')
  return { ok: true }
}
