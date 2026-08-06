/**
 * Cliente de OAuth 2.0 de Google Calendar (Task 6) — solo el intercambio de
 * tokens, sin rutas HTTP ni UI (eso es la Task 7).
 *
 * Decisión ya tomada: fetch directo al REST de Google (3 endpoints), sin el
 * SDK `googleapis`/`@googleapis/calendar` — ese paquete se instala recién en
 * la Task 8, solo para leer/escribir eventos. Ver skill `google-calendar`.
 *
 * `fetch` se recibe como parámetro (`fetchFn`) en cada función que hace red:
 * así los tests lo mockean sin tocar la red, y quien llame desde una ruta o
 * un cron puede pasar el `fetch` global sin que este módulo dependa de él
 * directamente.
 *
 * Ningún error de este módulo incluye el refresh token, el access token ni
 * el `client_secret` en su mensaje.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

/**
 * Scopes mínimos: eventos que el asesor mismo crea (no todo el calendario) y
 * consulta de disponibilidad (freebusy). Nada más — ver skill `google-calendar`.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.freebusy',
]

/** Redirect URI de producción: el dominio lleva `www` (el apex hace 308 a www). */
const REDIRECT_URI_PROD = 'https://www.klo-ser.com/api/google/oauth/callback'
const REDIRECT_URI_DEV = 'http://localhost:3000/api/google/oauth/callback'

export interface ConfigOAuth {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Firma mínima de `fetch` que este módulo necesita, para poder inyectarlo en tests. */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

function redirectUriPorDefecto(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    (process.env.NODE_ENV === 'production' ? REDIRECT_URI_PROD : REDIRECT_URI_DEV)
  )
}

/**
 * Arma la configuración de OAuth desde `process.env`, permitiendo inyectar
 * cualquier campo (los tests inyectan los tres para no depender del entorno).
 */
function leerConfig(override?: Partial<ConfigOAuth>): ConfigOAuth {
  const clientId = override?.clientId ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = override?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = override?.redirectUri ?? redirectUriPorDefecto()

  if (!clientId) {
    throw new Error('Falta la variable de entorno GOOGLE_CLIENT_ID')
  }
  if (!clientSecret) {
    throw new Error('Falta la variable de entorno GOOGLE_CLIENT_SECRET')
  }

  return { clientId, clientSecret, redirectUri }
}

/**
 * Error terminal: el refresh token ya no sirve (revocado por el usuario,
 * expirado por estar en modo Testing, contraseña de Google cambiada, etc.).
 * Quien la reciba NO debe reintentar — debe marcar la conexión como
 * `revocada` y pedirle al asesor que reconecte su cuenta.
 */
export class ErrorGrantInvalido extends Error {
  constructor() {
    super(
      'Google rechazó el refresh token (invalid_grant): la conexión quedó revocada, hace falta reconectar la cuenta'
    )
    this.name = 'ErrorGrantInvalido'
  }
}

/**
 * Construye la URL de consentimiento de Google para iniciar el flujo OAuth.
 *
 * `access_type=offline` + `prompt=consent` son ambos obligatorios: sin
 * `prompt=consent`, Google solo manda el `refresh_token` la primera vez que
 * el usuario autoriza la app — en una reconexión posterior (p. ej. tras
 * revocar y volver a conectar) el campo viene ausente y perderíamos la
 * posibilidad de refrescar el access token sin intervención del asesor.
 *
 * @param state Token firmado de `crearState` (protección CSRF del callback).
 * @param configOverride Config inyectable para tests; por defecto lee de `process.env`.
 */
export function urlAutorizacion(state: string, configOverride?: Partial<ConfigOAuth>): string {
  const cfg = leerConfig(configOverride)
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/** Decodifica el payload de un JWT sin verificar su firma (ver JSDoc de `intercambiarCodigo`). */
function decodificarEmailDeIdToken(idToken: string): string {
  const partes = idToken.split('.')
  if (partes.length !== 3) {
    throw new Error('id_token de Google con formato inválido')
  }

  let payload: { email?: unknown }
  try {
    payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  } catch {
    throw new Error('id_token de Google con payload ilegible')
  }

  if (typeof payload.email !== 'string' || !payload.email) {
    throw new Error('id_token de Google sin campo email')
  }
  return payload.email
}

export interface ResultadoIntercambio {
  /** Ausente si Google no lo reenvía (reconexión sin `prompt=consent` efectivo, etc.). */
  refreshToken: string | undefined
  email: string
}

/**
 * Intercambia el `code` de autorización por tokens.
 *
 * El email del asesor sale del `id_token` (JWT) que Google incluye en la
 * respuesta: se decodifica su payload base64url SIN verificar la firma
 * criptográfica. Es seguro hacerlo así porque el `id_token` llega directo de
 * Google sobre TLS, como respuesta a una petición que nosotros mismos
 * autenticamos con el `client_secret` — no es un token que un tercero nos
 * esté pasando para que lo aceptemos a ciegas. Verificar la firma (JWKS de
 * Google, rotación de llaves, etc.) sería trabajo extra sin beneficio de
 * seguridad real en este flujo servidor-a-servidor.
 */
export async function intercambiarCodigo(
  codigo: string,
  fetchFn: FetchFn,
  configOverride?: Partial<ConfigOAuth>
): Promise<ResultadoIntercambio> {
  const cfg = leerConfig(configOverride)
  const cuerpo = new URLSearchParams({
    code: codigo,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  })

  const respuesta = await fetchFn(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString(),
  })

  if (!respuesta.ok) {
    throw new Error(`Google respondió ${respuesta.status} al intercambiar el código de autorización`)
  }

  const datos = (await respuesta.json()) as { refresh_token?: string; id_token?: string }

  if (!datos.id_token) {
    throw new Error('La respuesta de Google no trae id_token: no se pudo obtener el email del asesor')
  }

  return {
    refreshToken: datos.refresh_token,
    email: decodificarEmailDeIdToken(datos.id_token),
  }
}

/**
 * Refresca el access token a partir del refresh token guardado.
 *
 * Distingue dos clases de falla:
 * - `invalid_grant` (HTTP 400): terminal, lanza `ErrorGrantInvalido` — no
 *   reintentar, hay que marcar la conexión como revocada.
 * - Cualquier otra cosa (5xx, fallo de red): transitoria, se puede reintentar
 *   (p. ej. desde el cron `gcal-retry` con backoff).
 */
export async function refrescarAccessToken(
  refreshToken: string,
  fetchFn: FetchFn,
  configOverride?: Partial<ConfigOAuth>
): Promise<string> {
  const cfg = leerConfig(configOverride)
  const cuerpo = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  })

  let respuesta: Response
  try {
    respuesta = await fetchFn(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
    })
  } catch (error) {
    // Fallo de red: transitorio, no ErrorGrantInvalido.
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new Error(`Fallo de red al refrescar el access token de Google: ${mensaje}`)
  }

  if (!respuesta.ok) {
    if (respuesta.status === 400) {
      const cuerpoError = (await respuesta.json().catch(() => null)) as { error?: string } | null
      if (cuerpoError?.error === 'invalid_grant') {
        throw new ErrorGrantInvalido()
      }
    }
    // 5xx u otro 4xx no reconocido: transitorio o al menos no confirmado como terminal.
    throw new Error(`Google respondió ${respuesta.status} al refrescar el access token`)
  }

  const datos = (await respuesta.json()) as { access_token?: string }
  if (!datos.access_token) {
    throw new Error('La respuesta de Google no trae access_token')
  }
  return datos.access_token
}

/**
 * Revoca un token (access o refresh) para desconectar la cuenta del asesor.
 *
 * Idempotente por diseño: si Google responde 400 `invalid_token` (el token ya
 * estaba revocado) se trata como éxito — desconectar debe poder repetirse sin
 * fallar. No requiere `client_id`/`client_secret`: el endpoint de revoke de
 * Google solo necesita el token.
 */
export async function revocarToken(token: string, fetchFn: FetchFn): Promise<void> {
  const cuerpo = new URLSearchParams({ token })

  const respuesta = await fetchFn(REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString(),
  })

  if (respuesta.ok) {
    return
  }

  if (respuesta.status === 400) {
    const cuerpoError = (await respuesta.json().catch(() => null)) as { error?: string } | null
    if (cuerpoError?.error === 'invalid_token') {
      return
    }
  }

  throw new Error(`Google respondió ${respuesta.status} al revocar el token`)
}
