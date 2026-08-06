/**
 * Reintento con backoff del espejo de visitas a Google Calendar (Task 10).
 *
 * La Task 8 (`src/lib/google/espejo.ts`) deja una visita en
 * `gcal_sync_estado = 'pendiente'` cuando Google falla de forma transitoria,
 * con `gcal_proximo_intento` apuntando a cuándo reintentar — pero nadie la
 * reintentaba. Este módulo es ese "alguien": lo llama el cron
 * `src/app/api/cron/gcal-retry/route.ts` cada 5 min.
 *
 * Sin `server-only`: al igual que `src/lib/easybroker/sync.ts`, el
 * `SupabaseClient` se recibe por PARÁMETRO (el route pasa el admin client
 * real; los tests pasan un fake) para poder testear con vitest sin mockear
 * media librería de Supabase. `sincronizarVisita` (que sí es `server-only` y
 * SIEMPRE usa su propio admin client internamente — ver su JSDoc) se recibe
 * también inyectada, por la misma razón: los tests de este módulo no deben
 * disparar la red real de Google ni un segundo cliente admin.
 *
 * Claim atómico por fila: antes de tocar una visita, este módulo hace un
 * UPDATE condicional (`gcal_sync_estado = 'pendiente' AND gcal_proximo_intento
 * <= ahora`) y solo continúa si el UPDATE afectó una fila. Dos ticks del cron
 * traslapados (o una invocación duplicada) sobre la MISMA visita: el primero
 * en llegar gana el row lock de Postgres, adelanta `gcal_proximo_intento` al
 * futuro y commitea; el segundo evalúa su mismo `WHERE ... <= ahora` (el
 * `ahora` de SU propia corrida) contra el valor YA adelantado por el primero
 * y no matchea → 0 filas afectadas → se salta esa visita sin llamar a
 * Google. No hace falta `SELECT ... FOR UPDATE SKIP LOCKED` a este volumen
 * (lote acotado a 20 cada 5 min).
 *
 * Backoff: `ahora + 1 min * 2^gcal_intentos` (intentos ANTES de incrementar,
 * mismo criterio que la fórmula documentada en el skill `google-calendar`
 * para el UPDATE en SQL crudo — en una sola sentencia SQL con múltiples
 * asignaciones, el lado derecho de cada una lee la fila ANTES del UPDATE, así
 * que ese es el comportamiento a replicar aquí en JS). Secuencia: 1, 2, 4, 8,
 * 16, 32 minutos para los intentos 1..6.
 *
 * Tope de intentos: `TOPE_INTENTOS` (6). Cuando la visita ya acumuló ese
 * número de intentos fallidos y el cron la vuelve a encontrar `pendiente`,
 * NO se llama a Google de nuevo — se reclama con un UPDATE distinto que la
 * manda directo a `gcal_sync_estado = 'error'` (dead letter, visible en
 * `gcal_ultimo_error` para diagnóstico manual).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  sincronizarVisita as sincronizarVisitaPorDefecto,
  type DependenciasSincronizacion,
} from '@/lib/google/espejo'

/** Tamaño máximo del lote por corrida del cron. */
export const LOTE_MAXIMO = 20

/** Después de este número de intentos fallidos, la visita se da por perdida (dead letter). */
export const TOPE_INTENTOS = 6

/** Base del backoff exponencial: 1 minuto. */
const BASE_BACKOFF_MS = 60_000

const MENSAJE_TOPE_AGOTADO =
  'Se agotaron los intentos de sincronización con Google Calendar (tope de reintentos alcanzado); revisar manualmente.'

/**
 * Próximo intento tras un fallo, con backoff exponencial: `ahora + 1min *
 * 2^intentosPrevios`. `intentosPrevios` es el conteo ANTES de este intento
 * (0 en el primer reintento → backoff de 1 min).
 */
export function calcularProximoIntento(ahora: Date, intentosPrevios: number): Date {
  return new Date(ahora.getTime() + BASE_BACKOFF_MS * Math.pow(2, intentosPrevios))
}

export interface ResumenRetry {
  /** Visitas cuyo claim tuvo éxito (se les hizo algo esta corrida). */
  procesadas: number
  /** Terminaron `sincronizada` o `sin_conexion` (ya no necesitan reintento). */
  sincronizadas: number
  /** Siguen `pendiente` (falló de nuevo; se reintentará más tarde). */
  pendientes: number
  /** Terminaron `error` (dead letter, tope de intentos agotado). */
  errores: number
}

export interface DependenciasRetry {
  /** Por defecto `sincronizarVisita` real — inyectable para tests. */
  sincronizarVisita?: (visitaId: string, deps?: DependenciasSincronizacion) => Promise<void>
  /** Por defecto `new Date()` — inyectable para fijar el reloj en tests. */
  ahora?: Date
  /** Por defecto `LOTE_MAXIMO` — inyectable para tests que quieren un lote más chico. */
  loteMaximo?: number
}

type CandidatoPendiente = {
  id: string
  gcal_intentos: number
}

/**
 * Procesa un lote acotado de visitas `pendiente` cuyo `gcal_proximo_intento`
 * ya venció, de la más atrasada a la menos atrasada. Nunca lanza: cualquier
 * error de lectura del lote deja el resumen en ceros (el próximo tick del
 * cron, 5 min después, lo vuelve a intentar).
 */
export async function procesarPendientes(
  supabase: SupabaseClient,
  dependencias: DependenciasRetry = {}
): Promise<ResumenRetry> {
  const sincronizarVisita = dependencias.sincronizarVisita ?? sincronizarVisitaPorDefecto
  const ahora = dependencias.ahora ?? new Date()
  const ahoraISO = ahora.toISOString()
  const loteMaximo = dependencias.loteMaximo ?? LOTE_MAXIMO

  const resumen: ResumenRetry = { procesadas: 0, sincronizadas: 0, pendientes: 0, errores: 0 }

  const { data: candidatos, error } = await supabase
    .from('visitas')
    .select('id, gcal_intentos')
    .eq('gcal_sync_estado', 'pendiente')
    .lte('gcal_proximo_intento', ahoraISO)
    .order('gcal_proximo_intento', { ascending: true })
    .limit(loteMaximo)

  if (error || !candidatos) return resumen

  for (const candidato of candidatos as CandidatoPendiente[]) {
    const intentosPrevios = candidato.gcal_intentos
    const nuevosIntentos = intentosPrevios + 1

    if (nuevosIntentos > TOPE_INTENTOS) {
      const reclamada = await reclamarComoAgotada(supabase, candidato.id, ahoraISO)
      if (!reclamada) continue // otro tick ya la tomó
      resumen.procesadas += 1
      resumen.errores += 1
      continue
    }

    const proximoIntento = calcularProximoIntento(ahora, intentosPrevios)
    const reclamada = await reclamarParaReintento(
      supabase,
      candidato.id,
      ahoraISO,
      nuevosIntentos,
      proximoIntento
    )
    if (!reclamada) continue // otro tick ya la tomó, o ya no calificaba

    resumen.procesadas += 1

    try {
      await sincronizarVisita(candidato.id)
    } catch (err) {
      // sincronizarVisita nunca debería lanzar (atrapa sus propios errores
      // por diseño — ver su JSDoc), pero si algo se escapa no debe tumbar el
      // resto del lote.
      console.error('[gcal-retry] sincronizarVisita lanzó de forma inesperada', candidato.id, err)
    }

    const estadoFinal = await leerEstadoFinal(supabase, candidato.id)
    if (estadoFinal === 'error') resumen.errores += 1
    else if (estadoFinal === 'pendiente') resumen.pendientes += 1
    else resumen.sincronizadas += 1 // 'sincronizada' o 'sin_conexion': ya no necesita reintento
  }

  return resumen
}

/** Claim atómico: incrementa intentos y agenda el próximo con backoff. `true` si el UPDATE afectó la fila. */
async function reclamarParaReintento(
  supabase: SupabaseClient,
  visitaId: string,
  ahoraISO: string,
  nuevosIntentos: number,
  proximoIntento: Date
): Promise<boolean> {
  const { data, error } = await supabase
    .from('visitas')
    .update({ gcal_intentos: nuevosIntentos, gcal_proximo_intento: proximoIntento.toISOString() })
    .eq('id', visitaId)
    .eq('gcal_sync_estado', 'pendiente')
    .lte('gcal_proximo_intento', ahoraISO)
    .select('id')

  return !error && (data ?? []).length > 0
}

/** Claim atómico directo a dead letter (tope de intentos agotado): no llama a Google. */
async function reclamarComoAgotada(
  supabase: SupabaseClient,
  visitaId: string,
  ahoraISO: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('visitas')
    .update({ gcal_sync_estado: 'error', gcal_ultimo_error: MENSAJE_TOPE_AGOTADO })
    .eq('id', visitaId)
    .eq('gcal_sync_estado', 'pendiente')
    .lte('gcal_proximo_intento', ahoraISO)
    .select('id')

  return !error && (data ?? []).length > 0
}

async function leerEstadoFinal(supabase: SupabaseClient, visitaId: string): Promise<string | undefined> {
  const { data } = await supabase.from('visitas').select('gcal_sync_estado').eq('id', visitaId).maybeSingle()
  return data?.gcal_sync_estado
}
