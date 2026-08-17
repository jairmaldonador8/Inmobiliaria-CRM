'use server'

/**
 * Server Actions del módulo de sugerencias internas (Task 18).
 *
 * Cliente de SESIÓN en ambas acciones, nunca service-role: RLS es quien
 * garantiza que `crearSugerencia` solo pueda insertar con autor_id =
 * auth.uid() (0002_rls.sql) y que `cambiarEstadoSugerencia` solo la pueda
 * ejecutar un admin (el update también está restringido por policy).
 */

import { revalidatePath } from 'next/cache'

import { requireAdmin, usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificarDesarrollador } from '@/lib/notificaciones/crear'

export type ResultadoAccionSugerencia = { ok: true } | { error: string }

/** Debe coincidir con el enum estado_sugerencia de 0001_schema.sql. */
const ESTADOS_SUGERENCIA = ['nueva', 'revisada', 'implementada'] as const
type EstadoSugerencia = (typeof ESTADOS_SUGERENCIA)[number]

const MAX_TEXTO = 2000

/**
 * Registra una sugerencia del usuario en sesión (admin o asesor, cualquiera
 * puede sugerir mejoras del sistema). `pantalla` la captura el propio botón
 * flotante con usePathname(), no la escribe el usuario.
 */
export async function crearSugerencia(
  pantalla: string,
  texto: string
): Promise<ResultadoAccionSugerencia> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'No autorizado' }

  const textoLimpio = texto.trim()
  if (!textoLimpio) return { error: 'Escribe tu sugerencia antes de enviarla' }
  if (textoLimpio.length > MAX_TEXTO) {
    return { error: `La sugerencia no puede superar los ${MAX_TEXTO} caracteres` }
  }

  const pantallaLimpia = pantalla.trim() || 'desconocida'

  const supabase = await createClient()

  const { error } = await supabase.from('sugerencias').insert({
    autor_id: usuario.user_id,
    pantalla: pantallaLimpia,
    texto: textoLimpio,
  })

  if (error) return { error: 'No se pudo registrar la sugerencia' }

  // Aviso al DESARROLLADOR (campanita + push): el feedback del chat de Klo
  // es material de desarrollo, no de operación — los demás admins no deben
  // recibirlo (pedido de Jair 2026-08-17, primer testeo real). Best-effort
  // con cliente admin (la notificación es PARA otro usuario; la RLS de
  // sesión no deja insertársela) — la sugerencia ya quedó guardada y eso es
  // lo que importa.
  try {
    const recorte =
      textoLimpio.length > 120 ? `${textoLimpio.slice(0, 120)}…` : textoLimpio
    await notificarDesarrollador(createAdminClient(), {
      tipo: 'sugerencia',
      texto: `💡 ${usuario.nombre}: «${recorte}»`,
      url: '/admin/sugerencias',
    })
  } catch (err) {
    console.error('crearSugerencia: falló el aviso al desarrollador, se omite', err)
  }

  revalidatePath('/admin/sugerencias')
  return { ok: true }
}

/** Cambia el estado de una sugerencia. Solo admin. */
export async function cambiarEstadoSugerencia(
  id: string,
  estado: string
): Promise<ResultadoAccionSugerencia> {
  await requireAdmin()

  if (!(ESTADOS_SUGERENCIA as readonly string[]).includes(estado)) {
    return { error: 'El estado no es válido' }
  }
  const estadoTipado = estado as EstadoSugerencia

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sugerencias')
    .update({ estado: estadoTipado })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    return { error: 'No se pudo actualizar el estado' }
  }

  revalidatePath('/admin/sugerencias')
  return { ok: true }
}
