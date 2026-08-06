/**
 * Cifrado de refresh tokens de Google (Google Calendar OAuth) — Task 5.
 *
 * Un refresh token da acceso al calendario de un asesor real: nunca puede
 * guardarse en claro en `google_conexiones.refresh_token_cifrado`. Usamos
 * AES-256-GCM vía `node:crypto` (no WebCrypto, no Supabase Vault/pgsodium —
 * pgsodium está en deprecación y Vault no está pensado para un secreto por
 * fila). Ver skill `google-calendar` §Cifrado.
 *
 * Formato almacenado: `v1.` + base64(iv(12) || ciphertext || tag(16)).
 * El prefijo de versión existe para poder rotar la clave en el futuro (una
 * `v2` conviviendo con `v1`): `descifrarToken` elige la clave según el
 * prefijo y falla con un error legible ante una versión desconocida.
 *
 * El AAD (additional authenticated data) es el `userId`: liga el ciphertext
 * a su fila, de modo que un token copiado a la fila de otro asesor no
 * descifra aunque la clave sea la correcta.
 *
 * IMPORTANTE para quien use este módulo (Task 6/7): un fallo de
 * `descifrarToken` (tag inválido, AAD distinto, payload corrupto o
 * truncado, versión desconocida) significa que el token se perdió de forma
 * permanente — NO es un error transitorio para reintentar. La conexión debe
 * marcarse para que el asesor reconecte su cuenta. Ningún mensaje de error
 * de este módulo incluye el token en claro ni la clave.
 *
 * Sin 'server-only': `node:crypto` no existe en el bundle de cliente (el
 * build de Next fallaría al intentar resolverlo desde un componente de
 * cliente), y este módulo no lee `process.env` al importarse — solo al
 * invocar las funciones y solo si no se inyecta una clave explícita — así
 * que no hay necesidad de la guarda adicional para que los tests (que no
 * dependen de variables de entorno) sigan funcionando sin mockear el paquete.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITMO = 'aes-256-gcm'
const VERSION_ACTUAL = 'v1'
const LONGITUD_IV = 12
const LONGITUD_TAG = 16
const LONGITUD_CLAVE = 32

/**
 * Cifra un texto (el refresh token) con AES-256-GCM, atado a `userId` vía AAD.
 *
 * @param texto Refresh token en claro. Nunca se incluye en errores ni logs.
 * @param userId Id del asesor dueño del token; se usa como AAD.
 * @param claveBase64 Clave de 32 bytes en base64. Por defecto
 *   `process.env.GOOGLE_TOKEN_SECRET` — parámetro opcional para poder
 *   inyectar una clave de prueba en los tests.
 * @returns Cadena con el prefijo de versión, p. ej. `v1.AbC...`.
 */
export function cifrarToken(
  texto: string,
  userId: string,
  claveBase64: string | undefined = process.env.GOOGLE_TOKEN_SECRET,
): string {
  const clave = decodificarClave(claveBase64)
  const iv = randomBytes(LONGITUD_IV)
  const cipher = createCipheriv(ALGORITMO, clave, iv, { authTagLength: LONGITUD_TAG })
  cipher.setAAD(Buffer.from(userId, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, ciphertext, tag])
  return `${VERSION_ACTUAL}.${payload.toString('base64')}`
}

/**
 * Descifra un valor producido por `cifrarToken`.
 *
 * Ver el aviso de "fallo = token perdido" en el JSDoc del módulo: quien
 * llame a esta función NO debe reintentar ante un throw, debe marcar la
 * conexión para reconexión.
 *
 * @param valor Cadena con el prefijo de versión (`v1.<base64>`).
 * @param userId Debe ser el mismo usado al cifrar (AAD).
 * @param claveBase64 Clave de 32 bytes en base64. Por defecto
 *   `process.env.GOOGLE_TOKEN_SECRET`.
 * @returns El texto en claro original.
 */
export function descifrarToken(
  valor: string,
  userId: string,
  claveBase64: string | undefined = process.env.GOOGLE_TOKEN_SECRET,
): string {
  const separador = valor.indexOf('.')
  if (separador === -1) {
    throw new Error('Token cifrado con formato inválido: falta el prefijo de versión')
  }

  const version = valor.slice(0, separador)
  if (version !== VERSION_ACTUAL) {
    throw new Error(`Versión de cifrado desconocida: "${version}"`)
  }

  const clave = decodificarClave(claveBase64)
  const payload = Buffer.from(valor.slice(separador + 1), 'base64')

  if (payload.length < LONGITUD_IV + LONGITUD_TAG) {
    throw new Error('Token cifrado corrupto o truncado: longitud insuficiente')
  }

  const iv = payload.subarray(0, LONGITUD_IV)
  const tag = payload.subarray(payload.length - LONGITUD_TAG)
  const ciphertext = payload.subarray(LONGITUD_IV, payload.length - LONGITUD_TAG)

  try {
    const decipher = createDecipheriv(ALGORITMO, clave, iv, { authTagLength: LONGITUD_TAG })
    decipher.setAAD(Buffer.from(userId, 'utf8'))
    decipher.setAuthTag(tag)
    const texto = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return texto.toString('utf8')
  } catch {
    // Nunca reenviar el error original: puede traer fragmentos del buffer.
    throw new Error(
      'No se pudo descifrar el token (perdido o corrupto): hace falta reconectar la cuenta de Google',
    )
  }
}

/** Decodifica y valida la clave de cifrado, sin exponerla en el mensaje de error. */
function decodificarClave(claveBase64: string | undefined): Buffer {
  if (!claveBase64) {
    throw new Error('Falta la clave de cifrado (GOOGLE_TOKEN_SECRET)')
  }
  const clave = Buffer.from(claveBase64, 'base64')
  if (clave.length !== LONGITUD_CLAVE) {
    throw new Error(
      `La clave de cifrado debe medir ${LONGITUD_CLAVE} bytes en base64, mide ${clave.length}`,
    )
  }
  return clave
}
