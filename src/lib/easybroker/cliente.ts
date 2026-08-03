/**
 * Cliente HTTP para la API de EasyBroker. Solo servidor (la key jamás debe
 * llegar al navegador); se usa desde cron jobs y tests de integración.
 *
 * - Auth: header X-Authorization (NO Bearer).
 * - Envelope de listados: { pagination: {...}, content: [...] }.
 * - limit máximo 50; rate limit 20 req/s (throttle propio a ≤10 req/s).
 */

export interface PaginacionEB {
  limit: number
  page: number
  total: number
  /** URL completa de la siguiente página, o null al final. */
  next_page: string | null
}

export interface PaginaEB<T> {
  pagination: PaginacionEB
  content: T[]
}

export class EasyBrokerError extends Error {
  readonly status: number
  readonly cuerpo: string

  constructor(status: number, cuerpo: string, url: string) {
    super(`EasyBroker respondió ${status} en ${url}: ${cuerpo.slice(0, 300)}`)
    this.name = 'EasyBrokerError'
    this.status = status
    this.cuerpo = cuerpo
  }
}

const LIMITE_MAXIMO = 50
const PAUSA_ENTRE_PAGINAS_MS = 100 // ≈ ≤10 req/s, bajo el límite de 20 req/s
const TIMEOUT_MS = 15_000 // por request; cron/tests no deben colgarse si EB no responde

function baseUrl(): string {
  const base = process.env.EASYBROKER_BASE_URL
  if (!base) throw new Error('Falta la variable de entorno EASYBROKER_BASE_URL')
  return base.replace(/\/+$/, '')
}

function apiKey(): string {
  const key = process.env.EASYBROKER_API_KEY
  if (!key) throw new Error('Falta la variable de entorno EASYBROKER_API_KEY')
  return key
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type ParamsEB = Record<string, string | number | boolean | undefined>

/**
 * GET tipado contra la API de EasyBroker. `path` es relativo (p. ej.
 * '/v1/properties') o una URL absoluta (p. ej. pagination.next_page).
 *
 * Nota: se mantiene el nombre `ebFetch` (en vez de renombrar a español) para
 * no generar churn en `src/test/easybroker-mapeo.test.ts`, que lo importa.
 */
export async function ebFetch<T>(path: string, params?: ParamsEB): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${baseUrl()}${path}`)
  for (const [clave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined) url.searchParams.set(clave, String(valor))
  }

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      headers: {
        'X-Authorization': apiKey(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // Falla de red o timeout (AbortSignal.timeout aborta a los 15s): no hay
    // respuesta HTTP, así que se reporta con status 0.
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new EasyBrokerError(0, `error de red: ${mensaje}`, url.toString())
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => '')
    throw new EasyBrokerError(respuesta.status, cuerpo, url.toString())
  }

  try {
    return (await respuesta.json()) as T
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new EasyBrokerError(respuesta.status, `respuesta no-JSON: ${mensaje}`, url.toString())
  }
}

/**
 * Recorre un endpoint paginado siguiendo pagination.next_page y devuelve el
 * contenido acumulado. Respeta limit máximo 50 y pausa 100ms entre páginas.
 */
export async function obtenerPaginado<T>(
  path: string,
  params: ParamsEB = {},
  maxPaginas: number = Infinity
): Promise<T[]> {
  const limite = Math.min(Number(params.limit ?? LIMITE_MAXIMO), LIMITE_MAXIMO)
  const contenido: T[] = []

  let pagina = await ebFetch<PaginaEB<T>>(path, { ...params, limit: limite })
  contenido.push(...pagina.content)
  let paginasLeidas = 1

  while (pagina.pagination.next_page && paginasLeidas < maxPaginas) {
    await pausa(PAUSA_ENTRE_PAGINAS_MS)
    // next_page es una URL completa; se sigue tal cual (ya trae limit y page)
    pagina = await ebFetch<PaginaEB<T>>(pagina.pagination.next_page)
    contenido.push(...pagina.content)
    paginasLeidas += 1
  }

  return contenido
}
