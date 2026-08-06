import 'server-only'

/**
 * Disponibilidad de un asesor para un rango de tiempo (Task 9): combina dos
 * fuentes de ocupación —
 *
 *  1. **Google free/busy** (`POST /freeBusy`), solo si el asesor tiene una
 *     conexión activa (Task 7). Devuelve bloques `{start, end}` SIN títulos
 *     ni detalle del evento — es lo único que expone el endpoint de Google
 *     por diseño (privacidad), y es también lo único que este módulo
 *     necesita: nunca se debe mostrar el contenido de la agenda personal del
 *     asesor a quien agenda una visita.
 *  2. **Visitas ya agendadas en el CRM** (`estado = 'agendada'`), calculando
 *     el fin de cada una con `duracion_min`.
 *
 * Regla de producto explícita y NO negociable (spec de la Task 9): esta
 * función solo AVISA, nunca bloquea. Por eso el contrato es "falla abierta":
 * si Google no responde, da error, el token está revocado, o cualquier otra
 * cosa sale mal del lado de Google, la función devuelve igual los bloques
 * del CRM (la fuente que sí controlamos) con `advertenciaParcial: true` —
 * JAMÁS lanza. Quien llame (la ruta, y más adelante el self-scheduling de
 * leads) puede confiar en que esperar la respuesta nunca va a tumbar el
 * flujo de agendado.
 *
 * Mismo patrón de inyección de dependencias que `src/lib/google/espejo.ts`
 * (`fetchFn`, cliente de Calendar inyectable) para que los tests cubran cada
 * rama sin tocar la red ni el SDK real.
 *
 * ⚠️ Limitación conocida y verificada (ver skill `google-calendar`): los
 * eventos de DÍA COMPLETO creados desde la UI de Google Calendar casi
 * siempre se marcan como «disponible» (`transparency: transparent`), así que
 * `freebusy.query` normalmente NO los reporta como ocupados. Un asesor de
 * vacaciones con un evento de día completo puede seguir apareciendo
 * "libre" — no asumir que la ausencia de bloques de Google significa que el
 * asesor está realmente disponible.
 */

import { auth, calendar, type calendar_v3 } from '@googleapis/calendar'

import { createAdminClient } from '@/lib/supabase/admin'
import { marcarRevocada, obtenerConexion, obtenerRefreshTokenDescifrado } from '@/lib/google/conexiones'
import { ErrorGrantInvalido, refrescarAccessToken, type FetchFn } from '@/lib/google/oauth'
import { ZONA_HORARIA } from '@/lib/fechas/monterrey'
import { DURACION_MIN_MAXIMO } from '@/lib/visitas/validacion'

/**
 * Ventana máxima razonable de consulta, en días. Una ventana corta mantiene
 * la respuesta de `freebusy.query` acotada y barata; quien necesite ver más
 * adelante debe pedirlo en varias llamadas. `route.ts` usa esta misma
 * constante para validar `desde`/`hasta` antes de llamar a esta función.
 */
export const RANGO_MAXIMO_DIAS_DISPONIBILIDAD = 7

// ---------------------------------------------------------------------------
// tipos
// ---------------------------------------------------------------------------

/** Bloque de tiempo ocupado — solo el rango, nunca título ni detalle del evento. */
export interface BloqueOcupado {
  /** ISO 8601 con offset (UTC). */
  inicio: string
  /** ISO 8601 con offset (UTC). */
  fin: string
}

export interface RangoConsulta {
  /** ISO 8601 con offset (UTC). */
  desde: string
  /** ISO 8601 con offset (UTC). */
  hasta: string
}

export interface ResultadoDisponibilidad {
  /** Bloques ocupados (CRM + Google si aplica), ordenados por inicio. */
  ocupado: BloqueOcupado[]
  /**
   * `true` cuando Google debía consultarse (hay conexión activa) pero la
   * consulta falló por cualquier razón — la respuesta solo refleja al CRM.
   * `false` tanto si Google respondió bien como si el asesor simplemente no
   * tiene conexión (ese caso no es una falla, es la ausencia esperada de esa
   * fuente).
   */
  advertenciaParcial: boolean
}

/** Subconjunto de `calendar_v3.Calendar` que este módulo necesita — permite inyectar un fake en tests sin el SDK real. */
export interface ClienteFreeBusyMinimo {
  freebusy: {
    query(params: {
      requestBody: {
        timeMin: string
        timeMax: string
        timeZone: string
        items: { id: string }[]
      }
    }): Promise<{ data: calendar_v3.Schema$FreeBusyResponse }>
  }
}

export type CrearClienteFreeBusy = (accessToken: string) => ClienteFreeBusyMinimo

export interface DependenciasDisponibilidad {
  /** Por defecto el `fetch` global — inyectable para tests. */
  fetchFn?: FetchFn
  /** Por defecto un cliente real del SDK — inyectable para tests. */
  crearClienteFreeBusy?: CrearClienteFreeBusy
  /**
   * Id de una visita a excluir de los bloques del CRM — para REAGENDAR: sin
   * esto, la propia visita (que sigue en `estado = 'agendada'` con su fecha
   * VIEJA hasta que se confirme el cambio) podría solaparse con la ventana
   * consultada y el asesor se vería una advertencia de conflicto consigo
   * mismo.
   */
  excluirVisitaId?: string
}

// ---------------------------------------------------------------------------
// solapamiento (pura, reutilizable por la UI para explicar la advertencia)
// ---------------------------------------------------------------------------

/**
 * Dos rangos se solapan si `inicioA < finB && inicioB < finA`. Bordes que se
 * TOCAN exactamente (el fin de uno es el inicio del otro) NO se solapan —
 * comparación estricta a propósito.
 */
export function seSolapan(a: BloqueOcupado, b: BloqueOcupado): boolean {
  const inicioA = new Date(a.inicio).getTime()
  const finA = new Date(a.fin).getTime()
  const inicioB = new Date(b.inicio).getTime()
  const finB = new Date(b.fin).getTime()
  return inicioA < finB && inicioB < finA
}

// ---------------------------------------------------------------------------
// bloques del CRM
// ---------------------------------------------------------------------------

async function bloquesDeVisitasCRM(
  asesorId: string,
  rango: RangoConsulta,
  excluirVisitaId?: string
): Promise<BloqueOcupado[]> {
  try {
    const supabase = createAdminClient()

    // Filtro de BD deliberadamente amplio (superset): una visita larga (hasta
    // DURACION_MIN_MAXIMO, el tope validado por `validarDatosVisita`) que
    // empezó antes de `desde` puede seguir ocupando cuando arranca el rango.
    // El solapamiento EXACTO se calcula después con `seSolapan`.
    const bufferInicio = new Date(
      new Date(rango.desde).getTime() - DURACION_MIN_MAXIMO * 60_000
    ).toISOString()

    let consulta = supabase
      .from('visitas')
      .select('id, fecha, duracion_min')
      .eq('asesor_id', asesorId)
      .eq('estado', 'agendada')
      .gte('fecha', bufferInicio)
      .lt('fecha', rango.hasta)

    if (excluirVisitaId) {
      consulta = consulta.neq('id', excluirVisitaId)
    }

    const { data, error } = await consulta
    if (error || !data) return []

    const rangoComoBloque: BloqueOcupado = { inicio: rango.desde, fin: rango.hasta }

    return (data as { id: string; fecha: string; duracion_min: number }[])
      .map((visita) => ({
        inicio: visita.fecha,
        fin: new Date(new Date(visita.fecha).getTime() + visita.duracion_min * 60_000).toISOString(),
      }))
      .filter((bloque) => seSolapan(bloque, rangoComoBloque))
  } catch (error) {
    console.error('obtenerDisponibilidad: no se pudieron leer las visitas del CRM', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// bloques de Google free/busy
// ---------------------------------------------------------------------------

/** Cliente real: un `OAuth2Client` con el access token ya vigente (recién refrescado) como credencial — mismo patrón que `espejo.ts`. */
function crearClienteFreeBusyPorDefecto(accessToken: string): ClienteFreeBusyMinimo {
  const clienteOAuth = new auth.OAuth2()
  clienteOAuth.setCredentials({ access_token: accessToken })
  return calendar({ version: 'v3', auth: clienteOAuth }) as unknown as ClienteFreeBusyMinimo
}

async function bloquesDeGoogle(
  asesorId: string,
  rango: RangoConsulta,
  dependencias: DependenciasDisponibilidad
): Promise<{ bloques: BloqueOcupado[]; advertenciaParcial: boolean }> {
  const fetchFn = dependencias.fetchFn ?? fetch
  const crearCliente = dependencias.crearClienteFreeBusy ?? crearClienteFreeBusyPorDefecto

  const conexion = await obtenerConexion(asesorId)
  if (!conexion || conexion.estado !== 'activa') {
    // Sin conexión: no es una falla, simplemente no hay Google que consultar.
    return { bloques: [], advertenciaParcial: false }
  }

  try {
    const refreshToken = await obtenerRefreshTokenDescifrado(asesorId)
    if (!refreshToken) {
      return { bloques: [], advertenciaParcial: false }
    }

    const accessToken = await refrescarAccessToken(refreshToken, fetchFn)
    const cliente = crearCliente(accessToken)

    const respuesta = await cliente.freebusy.query({
      requestBody: {
        timeMin: rango.desde,
        timeMax: rango.hasta,
        timeZone: ZONA_HORARIA,
        items: [{ id: 'primary' }],
      },
    })

    const busy = respuesta.data.calendars?.primary?.busy ?? []
    const bloques = busy
      .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
      .map((b) => ({ inicio: b.start, fin: b.end }))

    return { bloques, advertenciaParcial: false }
  } catch (error) {
    if (error instanceof ErrorGrantInvalido) {
      // Terminal, igual que en `espejo.ts`: se marca revocada (best-effort,
      // nunca relanza) para que la card del dashboard le pida al asesor
      // reconectar. Esta consulta de lectura NUNCA debe fallar por esto.
      try {
        await marcarRevocada(asesorId)
      } catch (errorMarcar) {
        console.error('obtenerDisponibilidad: no se pudo marcar la conexión como revocada', errorMarcar)
      }
    } else {
      console.error('obtenerDisponibilidad: falló la consulta a Google free/busy', error)
    }
    return { bloques: [], advertenciaParcial: true }
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Disponibilidad de un asesor en `rango`: bloques ocupados combinando Google
 * free/busy (si aplica) y las visitas ya agendadas en el CRM.
 *
 * Diseñada para reutilizarse tal cual desde el self-scheduling de leads
 * (proyecto futuro): no depende de sesión ni de request/response de Next,
 * solo de `asesorId` + rango — la autorización (quién puede pedir la
 * disponibilidad de quién) vive en `route.ts`, no aquí.
 *
 * Garantía de contrato: NUNCA lanza. En el peor caso devuelve solo los
 * bloques del CRM con `advertenciaParcial: true`.
 */
export async function obtenerDisponibilidad(
  asesorId: string,
  rango: RangoConsulta,
  dependencias: DependenciasDisponibilidad = {}
): Promise<ResultadoDisponibilidad> {
  const [bloquesCRM, resultadoGoogle] = await Promise.all([
    bloquesDeVisitasCRM(asesorId, rango, dependencias.excluirVisitaId),
    bloquesDeGoogle(asesorId, rango, dependencias),
  ])

  const ocupado = [...bloquesCRM, ...resultadoGoogle.bloques].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
  )

  return { ocupado, advertenciaParcial: resultadoGoogle.advertenciaParcial }
}
