/**
 * Consultas de leads para las vistas admin (bandeja y tabla global).
 *
 * Usan el cliente admin (service-role): las páginas que las llaman ya
 * verificaron la sesión con requireAdmin().
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ETAPAS_LEAD, FUENTES_LEAD } from '@/lib/leads/formato'
import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'

export type LeadBandeja = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  fuente: string
  fuente_detalle: string | null
  zona_interes: string | null
  creado_en: string
  clasificacion_eb: ClasificacionLeadEB | null
  propiedad: { titulo: string } | null
}

export type LeadGlobal = {
  id: string
  nombre: string
  telefono: string | null
  fuente: string
  fuente_detalle: string | null
  etapa: string
  archivado: boolean
  creado_en: string
  asesor: { nombre: string } | null
  propiedad: { titulo: string } | null
}

export type FiltrosLeads = {
  asesor?: string
  etapa?: string
  fuente?: string
  q?: string
}

/**
 * Filtro `.or()` de PostgREST para búsqueda por nombre/teléfono.
 * Misma sanitización que propiedades/consultas: se eliminan caracteres con
 * significado en la sintaxis de filtros (comas, paréntesis) y comodines LIKE.
 */
export function filtroBusquedaLeads(q: string | undefined): string | null {
  const termino = (q ?? '').replace(/[,()%\\]/g, ' ').trim()
  if (!termino) return null
  return `nombre.ilike.%${termino}%,telefono.ilike.%${termino}%`
}

/**
 * Leads en bandeja (sin asesor, no archivados), más RECIENTES primero:
 * pedido de Renata en el Live test 2026-08-17 — el que acaba de llegar va
 * hasta arriba y los que llevan más tiempo van bajando. La urgencia de los
 * viejos no se pierde: la señalan las bandas/badges de espera, no el orden.
 */
export async function leadsBandeja(): Promise<LeadBandeja[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, nombre, telefono, email, fuente, fuente_detalle, zona_interes, creado_en, clasificacion_eb, propiedad:propiedades(titulo)'
    )
    .is('asesor_id', null)
    .eq('archivado', false)
    .order('creado_en', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los leads de la bandeja: ${error.message}`)
  return (data ?? []) as unknown as LeadBandeja[]
}

/** Conteo de leads pendientes en bandeja (para el encabezado). */
export async function conteoBandeja(): Promise<number> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .is('asesor_id', null)
    .eq('archivado', false)

  if (error) throw new Error(`No se pudo contar la bandeja: ${error.message}`)
  return count ?? 0
}

/**
 * Tabla global de leads (todos, no archivados) con filtros opcionales.
 * asesor: 'bandeja' filtra sin asesor; un uuid filtra por ese asesor.
 * Los valores de etapa/fuente se validan contra el vocabulario conocido
 * para no romper el cast de enums en Postgres.
 */
export async function leadsGlobal(filtros: FiltrosLeads): Promise<LeadGlobal[]> {
  const supabase = createAdminClient()

  let consulta = supabase
    .from('leads')
    .select(
      'id, nombre, telefono, fuente, fuente_detalle, etapa, archivado, creado_en, asesor:usuarios(nombre), propiedad:propiedades(titulo)'
    )
    .eq('archivado', false)
    .order('creado_en', { ascending: false })

  if (filtros.asesor === 'bandeja') {
    consulta = consulta.is('asesor_id', null)
  } else if (filtros.asesor) {
    consulta = consulta.eq('asesor_id', filtros.asesor)
  }
  if (filtros.etapa && (ETAPAS_LEAD as readonly string[]).includes(filtros.etapa)) {
    consulta = consulta.eq('etapa', filtros.etapa)
  }
  if (filtros.fuente && (FUENTES_LEAD as readonly string[]).includes(filtros.fuente)) {
    consulta = consulta.eq('fuente', filtros.fuente)
  }
  const busqueda = filtroBusquedaLeads(filtros.q)
  if (busqueda) {
    consulta = consulta.or(busqueda)
  }

  const { data, error } = await consulta

  if (error) throw new Error(`No se pudieron cargar los leads: ${error.message}`)
  return (data ?? []) as unknown as LeadGlobal[]
}

/**
 * Etapas que cuentan como «en conversación»: ya hubo primer contacto y el
 * lead sigue vivo. 'nuevo' queda fuera (aún no se le habla) y los cerrados
 * también (la conversación terminó).
 */
export const ETAPAS_EN_CONVERSACION = [
  'contactado',
  'cita_agendada',
  'visita_realizada',
  'negociacion',
  'apartado',
] as const

export type LeadEnConversacion = {
  id: string
  nombre: string
  telefono: string | null
  etapa: string
  creado_en: string
  asesor: { nombre: string } | null
  propiedad: { titulo: string } | null
  /** Último toque de salida (WhatsApp/llamada) y cómo terminó. */
  ultimoContacto: {
    canal: string
    resultado: string
    creado_en: string
    autorNombre: string | null
  } | null
  /** Última nota humana (se excluyen las de sistema: no son conversación). */
  ultimoSeguimiento: {
    tipo: string
    nota: string
    creado_en: string
    autorNombre: string | null
  } | null
  /** La más reciente entre contacto y seguimiento; ordena la vista. */
  ultimaActividad: string | null
}

/**
 * Vista «En conversación» del admin (pedido de Jair 2026-08-17): con quién
 * ya se habló y cómo va el tema, ordenado por la conversación más reciente.
 *
 * Tres consultas y la fusión en JS: PostgREST no trae «la última fila por
 * lead» en un solo select, y el volumen (decenas de leads activos) no
 * justifica una RPC.
 */
export async function leadsEnConversacion(): Promise<LeadEnConversacion[]> {
  const supabase = createAdminClient()

  const { data: leads, error } = await supabase
    .from('leads')
    .select(
      'id, nombre, telefono, etapa, creado_en, asesor:usuarios(nombre), propiedad:propiedades(titulo)'
    )
    .in('etapa', ETAPAS_EN_CONVERSACION as unknown as string[])
    .eq('archivado', false)

  if (error) throw new Error(`No se pudieron cargar los leads en conversación: ${error.message}`)
  if (!leads || leads.length === 0) return []

  const ids = leads.map((l) => l.id)

  const [{ data: contactos }, { data: seguimientos }] = await Promise.all([
    supabase
      .from('contactos')
      .select('lead_id, canal, resultado, creado_en, autor:usuarios(nombre)')
      .in('lead_id', ids)
      .order('creado_en', { ascending: false }),
    supabase
      .from('seguimientos')
      .select('lead_id, tipo, nota, creado_en, autor:usuarios(nombre)')
      .in('lead_id', ids)
      .neq('tipo', 'sistema')
      .order('creado_en', { ascending: false }),
  ])

  // Vienen ordenados del más nuevo al más viejo: el primero por lead gana.
  type FilaContacto = {
    lead_id: string
    canal: string
    resultado: string
    creado_en: string
    autor: { nombre: string } | null
  }
  type FilaSeguimiento = {
    lead_id: string
    tipo: string
    nota: string
    creado_en: string
    autor: { nombre: string } | null
  }
  const contactoPorLead = new Map<string, FilaContacto>()
  for (const c of (contactos ?? []) as unknown as FilaContacto[]) {
    if (!contactoPorLead.has(c.lead_id)) contactoPorLead.set(c.lead_id, c)
  }
  const seguimientoPorLead = new Map<string, FilaSeguimiento>()
  for (const s of (seguimientos ?? []) as unknown as FilaSeguimiento[]) {
    if (!seguimientoPorLead.has(s.lead_id)) seguimientoPorLead.set(s.lead_id, s)
  }

  const filas = (leads as unknown as Omit<
    LeadEnConversacion,
    'ultimoContacto' | 'ultimoSeguimiento' | 'ultimaActividad'
  >[]).map((lead) => {
    const c = contactoPorLead.get(lead.id)
    const s = seguimientoPorLead.get(lead.id)
    const ultimaActividad =
      [c?.creado_en, s?.creado_en].filter((f): f is string => Boolean(f)).sort().at(-1) ?? null
    return {
      ...lead,
      ultimoContacto: c
        ? {
            canal: c.canal,
            resultado: c.resultado,
            creado_en: c.creado_en,
            autorNombre: c.autor?.nombre ?? null,
          }
        : null,
      ultimoSeguimiento: s
        ? {
            tipo: s.tipo,
            nota: s.nota,
            creado_en: s.creado_en,
            autorNombre: s.autor?.nombre ?? null,
          }
        : null,
      ultimaActividad,
    }
  })

  // Conversación más reciente primero; sin actividad registrada, al final
  // (más viejos al fondo).
  return filas.sort((a, b) => {
    const fa = a.ultimaActividad ?? a.creado_en
    const fb = b.ultimaActividad ?? b.creado_en
    if (a.ultimaActividad && !b.ultimaActividad) return -1
    if (!a.ultimaActividad && b.ultimaActividad) return 1
    return fb.localeCompare(fa)
  })
}

export type LeadArchivado = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  fuente: string
  fuente_detalle: string | null
  etapa: string
  creado_en: string
  /** Cuándo se mandó a la papelera. null = archivado antes de que existiera. */
  archivado_en: string | null
  asesor: { nombre: string } | null
  propiedad: { titulo: string } | null
  /** true = tiene operación cerrada: no se puede borrar de la base. */
  tieneOperacion: boolean
}

/**
 * Papelera del admin: lo último que se tiró, arriba.
 *
 * Los leads sin `archivado_en` (archivados antes de 0027 — en producción
 * eran 107, entre fixtures TEST-SYNC viejos y leads reales que se sacaron de
 * circulación a mano) caen al final: son historia, no lo que acabas de
 * eliminar.
 *
 * Trae además si el lead tiene una operación registrada, para que la vista
 * no ofrezca «Eliminar definitivamente» en algo que la migración 0027 va a
 * rechazar de todos modos (las comisiones apuntan al lead).
 */
export async function leadsArchivados(): Promise<LeadArchivado[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, nombre, telefono, email, fuente, fuente_detalle, etapa, creado_en, archivado_en, asesor:usuarios(nombre), propiedad:propiedades(titulo)'
    )
    .eq('archivado', true)
    .order('archivado_en', { ascending: false, nullsFirst: false })
    .order('creado_en', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los leads archivados: ${error.message}`)
  const leads = (data ?? []) as unknown as Omit<LeadArchivado, 'tieneOperacion'>[]
  if (leads.length === 0) return []

  const { data: operaciones, error: errorOperaciones } = await supabase
    .from('operaciones')
    .select('lead_id')
    .in(
      'lead_id',
      leads.map((l) => l.id)
    )

  if (errorOperaciones) {
    throw new Error(`No se pudieron cargar las operaciones: ${errorOperaciones.message}`)
  }
  const conOperacion = new Set((operaciones ?? []).map((o) => o.lead_id as string))

  return leads.map((lead) => ({ ...lead, tieneOperacion: conOperacion.has(lead.id) }))
}

/** Cuántos leads hay en la papelera (para la píldora de la pestaña). */
export async function conteoArchivados(): Promise<number> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('archivado', true)

  if (error) throw new Error(`No se pudo contar la papelera: ${error.message}`)
  return count ?? 0
}
