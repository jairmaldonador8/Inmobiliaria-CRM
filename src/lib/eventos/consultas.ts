/**
 * Consulta del timeline «Historia del lead» (lead_eventos). Cliente por
 * parámetro (DI, mismo patrón que src/lib/dashboard/consultas.ts): cada
 * página de detalle pasa SU cliente de sesión — la RLS de lead_eventos ya
 * acota al asesor a sus leads y le oculta los tipos de supervisión, así que
 * aquí no se filtra nada de eso.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { etiquetaEvento } from '@/lib/eventos/formato'

/** Fila cruda de lead_eventos tal como la devuelve la consulta. */
export type FilaEventoLead = {
  id: string
  tipo: string
  actor_id: string | null
  payload: Record<string, unknown>
  ocurrido_en: string
}

/** Evento ya listo para pintarse en el timeline. */
export type EventoTimeline = {
  id: string
  tipo: string
  /** Texto en español ya resuelto (etiquetaEvento + nombres). */
  etiqueta: string
  /** Nombre del actor; null = sistema (o nombre no legible por RLS). */
  actor_nombre: string | null
  ocurrido_en: string
}

const LIMITE_EVENTOS = 50

/** Ventana del colapso tomado_de_bandeja ↔ lead_asignado ("mismo minuto"). */
const VENTANA_COLAPSO_MS = 60_000

/**
 * Descarta el `lead_asignado` gemelo de un `tomado_de_bandeja` (tomar un
 * lead de la bandeja dispara AMBOS: la acción emite `tomado_de_bandeja` y el
 * trigger de leads anota `lead_asignado` — un solo hecho, dos filas).
 *
 * OJO: NO se compara por igualdad de actor — `tomarLead` corre con el
 * cliente admin, así que el `lead_asignado` del trigger llega con actor_id
 * NULL mientras el `tomado_de_bandeja` trae el uid del asesor. La regla es:
 * mismo lead (la consulta ya es de un solo lead) + mismo minuto, con
 * cross-check `payload.a === actor del tomado` cuando ambos existen.
 */
export function colapsarEventos(eventos: FilaEventoLead[]): FilaEventoLead[] {
  const tomados = eventos.filter((e) => e.tipo === 'tomado_de_bandeja')
  if (tomados.length === 0) return eventos

  return eventos.filter((evento) => {
    if (evento.tipo !== 'lead_asignado') return true
    const instante = new Date(evento.ocurrido_en).getTime()
    const destino = typeof evento.payload?.a === 'string' ? evento.payload.a : null
    return !tomados.some((tomado) => {
      const delta = Math.abs(new Date(tomado.ocurrido_en).getTime() - instante)
      if (delta > VENTANA_COLAPSO_MS) return false
      // Si ambos lados traen uuid, deben coincidir; si alguno falta, el
      // criterio temporal basta (caso real: trigger con actor NULL).
      return destino === null || tomado.actor_id === null || destino === tomado.actor_id
    })
  })
}

/**
 * Últimos 50 eventos del lead (más reciente primero), con el colapso
 * aplicado y las etiquetas ya resueltas contra los nombres de `usuarios`
 * (actor_id ∪ payload.a/de). Un nombre que la RLS no deje leer simplemente
 * no resuelve → la etiqueta cae a su fallback y el actor se pinta «Sistema».
 */
export async function eventosDeLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<EventoTimeline[]> {
  const { data, error } = await supabase
    .from('lead_eventos')
    .select('id, tipo, actor_id, payload, ocurrido_en')
    .eq('lead_id', leadId)
    .order('ocurrido_en', { ascending: false })
    .limit(LIMITE_EVENTOS)

  if (error) {
    throw new Error(`No se pudo obtener la historia del lead: ${error.message}`)
  }

  const eventos = colapsarEventos((data ?? []) as FilaEventoLead[])

  const ids = new Set<string>()
  for (const evento of eventos) {
    if (evento.actor_id) ids.add(evento.actor_id)
    for (const clave of ['a', 'de'] as const) {
      const valor = evento.payload?.[clave]
      if (typeof valor === 'string' && valor.length > 0) ids.add(valor)
    }
  }

  const nombres = new Map<string, string>()
  if (ids.size > 0) {
    // Best-effort: si falla (o la RLS oculta filas), las etiquetas caen a
    // su fallback en vez de tumbar el detalle del lead.
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('user_id, nombre')
      .in('user_id', [...ids])
    for (const usuario of usuarios ?? []) {
      nombres.set(usuario.user_id as string, usuario.nombre as string)
    }
  }

  return eventos.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    etiqueta: etiquetaEvento(evento.tipo, evento.payload ?? {}, nombres),
    actor_nombre: (evento.actor_id && nombres.get(evento.actor_id)) || null,
    ocurrido_en: evento.ocurrido_en,
  }))
}
