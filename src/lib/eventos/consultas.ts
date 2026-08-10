/**
 * Consulta del timeline «Historia del lead» (lead_eventos). Cliente por
 * parámetro (DI, mismo patrón que src/lib/dashboard/consultas.ts): cada
 * página de detalle pasa SU cliente de sesión — la RLS de lead_eventos ya
 * acota al asesor a sus leads y le oculta los tipos de supervisión, así que
 * aquí no se filtra nada de eso.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { etiquetaEvento } from '@/lib/eventos/formato'
import { etiquetaTipoSeguimiento } from '@/lib/seguimientos/formato'

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
  /** Texto de la nota, solo en los ítems que vienen de `seguimientos`. */
  nota?: string
}

const LIMITE_EVENTOS = 50

/** Ventana del colapso tomado_de_bandeja ↔ lead_asignado ("mismo minuto"). */
const VENTANA_COLAPSO_MS = 60_000

/**
 * Descarta el gemelo de asignación de un `tomado_de_bandeja` (tomar un lead
 * dispara AMBOS: la acción emite `tomado_de_bandeja` y el trigger de leads
 * anota el cambio de asesor_id — un solo hecho, dos filas).
 *
 * El gemelo real de producción es `lead_reasignado`, NO `lead_asignado`:
 * `tomarLead` (src/lib/leads/acciones.ts) toma leads en escalamiento
 * abierto, donde asesor_id SIEMPRE es no-null (el CAS hace
 * `.eq('asesor_id', …)`), así que el trigger 0016 cae en la rama
 * `lead_reasignado`. Se colapsan ambos tipos por si algún camino futuro
 * tomara desde bandeja (asesor_id null → `lead_asignado`).
 *
 * OJO: NO se compara por igualdad de actor — `tomarLead` corre con el
 * cliente admin, así que el gemelo del trigger llega con actor_id NULL
 * mientras el `tomado_de_bandeja` trae el uid del asesor. La regla es:
 * mismo lead (la consulta ya es de un solo lead) + mismo minuto, con
 * cross-check `payload.a === actor del tomado` cuando ambos existen.
 */
export function colapsarEventos(eventos: FilaEventoLead[]): FilaEventoLead[] {
  const tomados = eventos.filter((e) => e.tipo === 'tomado_de_bandeja')
  if (tomados.length === 0) return eventos

  return eventos.filter((evento) => {
    if (evento.tipo !== 'lead_asignado' && evento.tipo !== 'lead_reasignado') return true
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
    // payload.a/de solo son uuids en los eventos de asignación —
    // `etapa_cambiada` lleva NOMBRES DE ETAPA en esas mismas claves, y
    // colarlos al `.in('user_id', …)` revienta la consulta con 22P02 y deja
    // TODO el timeline sin nombres (el best-effort de abajo se lo traga).
    if (evento.tipo !== 'lead_asignado' && evento.tipo !== 'lead_reasignado') continue
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

/** Fila de `seguimientos` tal como la piden las páginas de detalle. */
type FilaSeguimiento = {
  id: string
  tipo: string
  nota: string
  creado_en: string
  autor: { nombre: string } | null
}

/**
 * Historia completa del lead: los eventos de `lead_eventos` MÁS las notas de
 * `seguimientos`, en una sola línea de tiempo.
 *
 * Por qué se mezclan aquí y no en la base: el evento `seguimiento_registrado`
 * dice que hubo una nota pero no QUÉ decía, así que se descarta y en su lugar
 * entra la fila real de `seguimientos`, que sí trae el texto. Resultado: una
 * sola lista sin repeticiones, donde cada nota se lee completa.
 *
 * Las notas conservan su icono por clase de contacto vía el tipo `seg:<tipo>`
 * (ver ICONOS_EVENTO en formato.ts).
 */
export function fusionarHistoria(
  eventos: EventoTimeline[],
  seguimientos: FilaSeguimiento[]
): EventoTimeline[] {
  const sinNotas = eventos.filter((evento) => evento.tipo !== 'seguimiento_registrado')

  const notas: EventoTimeline[] = seguimientos.map((seguimiento) => {
    // Las notas de sistema («Etapa movida a…», «Visita agendada para…») ya
    // se explican solas: poner «Sistema» en negritas encima solo repite. El
    // texto pasa a ser el titular y no se duplica abajo.
    const esDeSistema = seguimiento.tipo === 'sistema'
    return {
      id: `seg-${seguimiento.id}`,
      tipo: `seg:${seguimiento.tipo}`,
      etiqueta: esDeSistema ? seguimiento.nota : etiquetaTipoSeguimiento(seguimiento.tipo),
      actor_nombre: seguimiento.autor?.nombre ?? null,
      ocurrido_en: seguimiento.creado_en,
      nota: esDeSistema ? undefined : seguimiento.nota,
    }
  })

  return [...sinNotas, ...notas]
    .sort((a, b) => new Date(b.ocurrido_en).getTime() - new Date(a.ocurrido_en).getTime())
    .slice(0, LIMITE_EVENTOS)
}
