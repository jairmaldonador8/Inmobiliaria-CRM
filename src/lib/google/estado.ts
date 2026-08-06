/**
 * `state` firmado para el flujo OAuth de Google Calendar (Task 6) — protección
 * CSRF del callback: liga la redirección de vuelta de Google a la sesión que
 * la inició, cargando el `userId` del asesor y una expiración corta.
 *
 * Formato: `<payload-base64url>.<firma-base64url>`, donde
 * `payload = "<userId>.<expiraEnMs>"` y `firma = HMAC-SHA256(subclave, payload)`.
 *
 * Separación de claves: NO se usa `GOOGLE_TOKEN_SECRET` crudo como clave del
 * HMAC. Esa clave ya cifra los refresh tokens con AES-GCM (ver
 * `src/lib/google/cifrado.ts`); reutilizar el mismo material de clave para
 * dos primitivas criptográficas distintas (cifrado simétrico vs. MAC) es mala
 * práctica — un problema en un uso puede filtrarse al otro. En vez de eso se
 * deriva una subclave determinista: `subclave = HMAC-SHA256(GOOGLE_TOKEN_SECRET,
 * 'klo-ser:oauth-state')`. Es determinista (mismo secreto → misma subclave
 * siempre, sin necesidad de guardar nada extra) y evita administrar una
 * variable de entorno adicional solo para el HMAC del state.
 *
 * La comparación de la firma se hace con `crypto.timingSafeEqual` (nunca
 * `===`) para no filtrar por tiempo de respuesta cuántos bytes de la firma
 * coinciden.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Vigencia del state: 10 minutos, suficiente para completar el consentimiento en Google. */
const TTL_MS = 10 * 60 * 1000

/** Info de dominio para la derivación de subclave (ver JSDoc del módulo). */
const INFO_SUBCLAVE = 'klo-ser:oauth-state'

function leerSecreto(secretoBase64: string | undefined): string {
  if (!secretoBase64) {
    throw new Error('Falta la variable de entorno GOOGLE_TOKEN_SECRET')
  }
  return secretoBase64
}

/** Deriva la subclave de HMAC a partir del secreto de cifrado de tokens. */
function derivarSubclave(secretoBase64: string): Buffer {
  return createHmac('sha256', Buffer.from(secretoBase64, 'base64')).update(INFO_SUBCLAVE).digest()
}

function firmar(payload: string, subclave: Buffer): string {
  return createHmac('sha256', subclave).update(payload, 'utf8').digest('base64url')
}

/**
 * Crea un `state` firmado que carga `userId` y expira en 10 minutos.
 *
 * @param userId Id del asesor que inicia el flujo OAuth.
 * @param secretoBase64 Mismo secreto usado en `cifrarToken`/`descifrarToken`
 *   (`GOOGLE_TOKEN_SECRET`, 32 bytes en base64). Por defecto
 *   `process.env.GOOGLE_TOKEN_SECRET`; parámetro inyectable para tests.
 * @param ahora Reloj inyectable para tests (por defecto `new Date()`).
 */
export function crearState(
  userId: string,
  secretoBase64: string | undefined = process.env.GOOGLE_TOKEN_SECRET,
  ahora: Date = new Date()
): string {
  const secreto = leerSecreto(secretoBase64)
  const expiraEnMs = ahora.getTime() + TTL_MS
  const payload = Buffer.from(`${userId}.${expiraEnMs}`, 'utf8').toString('base64url')
  const firma = firmar(payload, derivarSubclave(secreto))
  return `${payload}.${firma}`
}

/**
 * Valida un `state` producido por `crearState` y devuelve el `userId` que
 * carga. Lanza si el formato es inválido, la firma no coincide (state
 * manipulado o firmado con otro secreto) o si ya expiró.
 *
 * @param ahora Reloj inyectable para tests (por defecto `new Date()`).
 */
export function validarState(
  state: string,
  secretoBase64: string | undefined = process.env.GOOGLE_TOKEN_SECRET,
  ahora: Date = new Date()
): string {
  const secreto = leerSecreto(secretoBase64)

  const partes = state.split('.')
  if (partes.length !== 2) {
    throw new Error('state con formato inválido')
  }
  const [payload, firma] = partes
  if (!payload || !firma) {
    throw new Error('state con formato inválido')
  }

  const firmaEsperada = firmar(payload, derivarSubclave(secreto))
  const bufRecibido = Buffer.from(firma)
  const bufEsperado = Buffer.from(firmaEsperada)
  if (bufRecibido.length !== bufEsperado.length || !timingSafeEqual(bufRecibido, bufEsperado)) {
    throw new Error('state con firma inválida')
  }

  let decodificado: string
  try {
    decodificado = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    throw new Error('state con formato inválido')
  }

  const separador = decodificado.lastIndexOf('.')
  if (separador === -1) {
    throw new Error('state con formato inválido')
  }
  const userId = decodificado.slice(0, separador)
  const expiraEnMs = Number(decodificado.slice(separador + 1))
  if (!userId || !Number.isFinite(expiraEnMs)) {
    throw new Error('state con formato inválido')
  }

  if (ahora.getTime() > expiraEnMs) {
    throw new Error('state expirado: hay que reiniciar el flujo de conexión con Google')
  }

  return userId
}
