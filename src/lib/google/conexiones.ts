import 'server-only'

/**
 * CRUD de `google_conexiones` (Task 7) — SIEMPRE con el cliente admin
 * (service-role): la tabla no tiene policy de insert/update para
 * `authenticated` (ver migración 0008) y la 0010 cerró el grant de tabla
 * correspondiente, así que escribir esta tabla es responsabilidad exclusiva
 * del servidor.
 *
 * Diseño deliberado para que el refresh token no se filtre por accidente:
 * `obtenerConexion` (para la UI) NUNCA toca `refresh_token_cifrado` ni en el
 * select ni en el tipo de retorno. Quien necesite el token en claro debe
 * llamar explícitamente a `obtenerRefreshTokenDescifrado` — nombre elegido
 * a propósito para que no se use por error donde se quería el estado de la
 * conexión.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { cifrarToken, descifrarToken } from '@/lib/google/cifrado'
import { revocarToken } from '@/lib/google/oauth'

export type EstadoConexionGoogle = 'activa' | 'revocada'

export type ConexionGoogle = {
  googleEmail: string
  estado: EstadoConexionGoogle
  creadaEn: string
  actualizadaEn: string
}

export type GuardarConexionInput = {
  userId: string
  email: string
  /**
   * Ausente cuando Google no reenvía el refresh token (reconexión sin que
   * `prompt=consent` haya sido efectivo del lado de Google) — ver
   * `ResultadoIntercambio` en `src/lib/google/oauth.ts`. En ese caso se
   * conserva el token cifrado ya guardado; NUNCA se sobrescribe con null
   * (la columna es `not null`).
   */
  refreshToken: string | undefined
}

/**
 * Guarda (o actualiza) la conexión de Google de un asesor.
 *
 * Si `refreshToken` viene undefined (reconexión sin nuevo grant), se lee y
 * conserva el `refresh_token_cifrado` existente. Si no hay conexión previa
 * que conservar en ese caso, falla explícitamente — no hay token válido que
 * guardar y la columna no admite null.
 */
export async function guardarConexion({
  userId,
  email,
  refreshToken,
}: GuardarConexionInput): Promise<void> {
  const supabase = createAdminClient()

  let refreshTokenCifrado: string
  if (refreshToken) {
    refreshTokenCifrado = cifrarToken(refreshToken, userId)
  } else {
    const { data: existente, error: errorExistente } = await supabase
      .from('google_conexiones')
      .select('refresh_token_cifrado')
      .eq('user_id', userId)
      .maybeSingle()

    if (errorExistente || !existente) {
      throw new Error(
        'Google no devolvió refresh_token y no hay una conexión previa que conservar: hace falta reconectar desde cero'
      )
    }
    refreshTokenCifrado = existente.refresh_token_cifrado
  }

  const { error } = await supabase.from('google_conexiones').upsert(
    {
      user_id: userId,
      google_email: email,
      refresh_token_cifrado: refreshTokenCifrado,
      estado: 'activa' satisfies EstadoConexionGoogle,
      actualizada_en: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    throw new Error(`No se pudo guardar la conexión de Google: ${error.message}`)
  }
}

/**
 * Estado de la conexión para mostrar en la UI (card del dashboard del
 * asesor). Nunca incluye el refresh token, ni cifrado ni en claro.
 */
export async function obtenerConexion(userId: string): Promise<ConexionGoogle | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('google_conexiones')
    .select('google_email, estado, creada_en, actualizada_en')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    googleEmail: data.google_email,
    estado: data.estado as EstadoConexionGoogle,
    creadaEn: data.creada_en,
    actualizadaEn: data.actualizada_en,
  }
}

/**
 * Refresh token en TEXTO CLARO. Uso exclusivo de servidor (Task 8: refrescar
 * el access token, llamar a la Calendar API). Jamás pasar el resultado a un
 * componente de cliente, incluirlo en un mensaje de error o loguearlo.
 *
 * Devuelve null si no hay conexión activa. Si el descifrado falla (token
 * perdido o corrupto — ver JSDoc de `descifrarToken`), esta función NO lo
 * atrapa: relanza, y quien llame debe capturarlo y marcar la conexión con
 * `marcarRevocada` para pedirle al asesor que reconecte.
 */
export async function obtenerRefreshTokenDescifrado(userId: string): Promise<string | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('google_conexiones')
    .select('refresh_token_cifrado')
    .eq('user_id', userId)
    .eq('estado', 'activa' satisfies EstadoConexionGoogle)
    .maybeSingle()

  if (error || !data) return null

  return descifrarToken(data.refresh_token_cifrado, userId)
}

/**
 * Marca la conexión como revocada (p. ej. tras un `ErrorGrantInvalido` al
 * refrescar el access token). No borra la fila — solo cambia el estado, para
 * que la card del dashboard pueda mostrar «reconecta tu cuenta» conservando
 * el email previamente conectado.
 */
export async function marcarRevocada(userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('google_conexiones')
    .update({
      estado: 'revocada' satisfies EstadoConexionGoogle,
      actualizada_en: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    throw new Error(`No se pudo marcar la conexión de Google como revocada: ${error.message}`)
  }
}

/**
 * Desconecta la cuenta de Google de un asesor: revoca el token contra Google
 * (best-effort) y SIEMPRE borra la fila, aunque la revocación falle (red
 * caída, Google ya lo había revocado del otro lado, token ya corrupto). El
 * asesor pidió desconectar — que Google no coopere no debe dejar la fila
 * huérfana en el CRM.
 */
export async function desconectar(userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: fila } = await supabase
    .from('google_conexiones')
    .select('refresh_token_cifrado')
    .eq('user_id', userId)
    .maybeSingle()

  if (fila?.refresh_token_cifrado) {
    try {
      const token = descifrarToken(fila.refresh_token_cifrado, userId)
      await revocarToken(token, fetch)
    } catch (error) {
      console.error(
        'No se pudo revocar el token de Google (se borra la conexión de todas formas):',
        error instanceof Error ? error.message : error
      )
    }
  }

  const { error } = await supabase.from('google_conexiones').delete().eq('user_id', userId)
  if (error) {
    throw new Error(`No se pudo eliminar la conexión de Google: ${error.message}`)
  }
}
