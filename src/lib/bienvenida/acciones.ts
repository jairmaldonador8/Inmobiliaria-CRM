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
import { createClient } from '@/lib/supabase/server'

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
 * Paso «Tu perfil» de la bienvenida: nombre propio, foto (URL del bucket
 * 'perfiles', la sube el navegador) y, si la manda, su contraseña personal
 * en lugar de la temporal que le dio el admin. La contraseña se cambia con
 * el cliente de SESIÓN (auth.updateUser exige al dueño de la cuenta).
 */
export async function actualizarPerfilBienvenida(datos: {
  nombre: string
  foto: string | null
  password: string | null
}): Promise<ResultadoBienvenida> {
  const usuario = await requireAsesor()

  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim().slice(0, 120) : ''
  if (nombre.length < 2) return { error: 'Escribe tu nombre como quieres aparecer.' }

  if (datos.password) {
    if (datos.password.length < 8) {
      return { error: 'La contraseña nueva debe tener al menos 8 caracteres.' }
    }
    const sesion = await createClient()
    const { error } = await sesion.auth.updateUser({ password: datos.password })
    if (error) return { error: `No se pudo cambiar la contraseña: ${error.message}` }
  }

  const cambios: { nombre: string; foto?: string } = { nombre }
  if (typeof datos.foto === 'string' && datos.foto.startsWith('http')) {
    cambios.foto = datos.foto
  }
  const { error } = await createAdminClient()
    .from('usuarios')
    .update(cambios)
    .eq('user_id', usuario.user_id)
  if (error) return { error: `No se pudo guardar tu perfil: ${error.message}` }

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
