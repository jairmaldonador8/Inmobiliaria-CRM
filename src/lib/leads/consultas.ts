/**
 * Consultas de leads para las vistas admin (bandeja y tabla global).
 *
 * Usan el cliente admin (service-role): las páginas que las llaman ya
 * verificaron la sesión con requireAdmin().
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ETAPAS_LEAD, FUENTES_LEAD } from '@/lib/leads/formato'

export type LeadBandeja = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  fuente: string
  fuente_detalle: string | null
  zona_interes: string | null
  creado_en: string
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
 * Leads en bandeja (sin asesor, no archivados), más antiguos PRIMERO:
 * el que más lleva esperando es el más urgente de atender.
 */
export async function leadsBandeja(): Promise<LeadBandeja[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, nombre, telefono, email, fuente, fuente_detalle, zona_interes, creado_en, propiedad:propiedades(titulo)'
    )
    .is('asesor_id', null)
    .eq('archivado', false)
    .order('creado_en', { ascending: true })

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
