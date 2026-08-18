'use server'

/**
 * Server Actions de recordatorios de follow-up (ronda 2).
 *
 * Cliente de SESIÓN siempre: la RLS de 0025 garantiza que solo se crean
 * recordatorios propios sobre leads propios, y que solo el dueño los
 * reprograma o resuelve. Si un insert/update falla por policy, el lead no
 * es del asesor — no se verifica ownership a mano (patrón seguimientos).
 */

import { revalidatePath } from 'next/cache'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { MAX_NOTA_RECORDATORIO } from '@/lib/recordatorios/formato'

export type ResultadoRecordatorio = { ok: true } | { error: string }

/** Margen para relojes desfasados: una fecha hasta 1 min en el pasado pasa. */
const MARGEN_PASADO_MS = 60 * 1000

function revalidarVistas(leadId: string) {
  revalidatePath('/asesor')
  revalidatePath('/asesor/leads')
  revalidatePath(`/asesor/leads/${leadId}`)
  revalidatePath(`/admin/leads/${leadId}`)
}

export async function crearRecordatorio(
  leadId: string,
  datos: { fechaIso: string; nota: string }
): Promise<ResultadoRecordatorio> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const fecha = new Date(datos.fechaIso)
  if (Number.isNaN(fecha.getTime())) {
    return { error: 'La fecha del recordatorio no es válida' }
  }
  if (fecha.getTime() < Date.now() - MARGEN_PASADO_MS) {
    return { error: 'El recordatorio debe ser a futuro' }
  }

  const nota = datos.nota?.trim() ?? ''
  if (nota.length > MAX_NOTA_RECORDATORIO) {
    return { error: `La nota no puede exceder ${MAX_NOTA_RECORDATORIO} caracteres` }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('recordatorios').insert({
    lead_id: leadId,
    asesor_id: usuario.user_id,
    fecha_hora: fecha.toISOString(),
    nota,
  })

  // Error de policy = el lead no es del asesor (o está archivado).
  if (error) return { error: 'No se pudo guardar el recordatorio' }

  revalidarVistas(leadId)
  return { ok: true }
}

/**
 * Resuelve un recordatorio a mano: `hecho` («ya lo atendí») o `cancelado`
 * («ya no aplica»). El paso natural a `hecho` es automático al registrar
 * actividad real en el lead (ver resolver.ts) — esto es la salida manual.
 */
export async function marcarRecordatorio(
  id: string,
  leadId: string,
  estado: 'hecho' | 'cancelado'
): Promise<ResultadoRecordatorio> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  if (estado !== 'hecho' && estado !== 'cancelado') {
    return { error: 'El estado no es válido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recordatorios')
    .update({ estado })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('id')

  if (error) return { error: 'No se pudo actualizar el recordatorio' }
  if (!data || data.length === 0) return { error: 'Este recordatorio ya fue resuelto' }

  revalidarVistas(leadId)
  return { ok: true }
}
