/**
 * Callback OAuth de Google Calendar (Task 7): recibe `code`/`state` (o
 * `error` si el asesor canceló el consentimiento), valida el state, guarda
 * la conexión y redirige de vuelta al dashboard del asesor.
 *
 * `request.nextUrl.searchParams` en vez de un `params`/`searchParams` de
 * página: en un Route Handler de Next 16 es la forma correcta y síncrona de
 * leer la query string (ver AGENTS.md de la Task 7 — los docs locales en
 * node_modules/next/dist/docs/ mandan).
 *
 * El `userId` que se guarda viene del `state` firmado, NO de la sesión
 * vigente en este request: `validarState` ya lo autentica (HMAC + TTL de 10
 * min), así que no hace falta (ni conviene) volver a exigir sesión aquí —
 * evita que un desajuste de sesión entre el /start y el callback (logout a
 * medias, etc.) rompa el flujo en silencio.
 *
 * Ningún mensaje logueado incluye el token, el `code` ni el `client_secret`
 * — los errores de `oauth.ts`/`estado.ts`/`cifrado.ts` ya están escritos
 * para no filtrarlos, y aquí solo se propaga `error.message`.
 *
 * Nota de proxy (`src/proxy.ts`): esta ruta SÍ pasa por el proxy (su
 * matcher solo excluye `api/cron`), pero `esProtegida()` solo cubre
 * `/admin` y `/asesor` — `/api/google/oauth/callback` no matchea ninguno de
 * los dos, así que el proxy NO redirige este request; solo corre
 * `getClaims()` de paso (refresca cookies de sesión si aplica) y deja
 * pasar. Verificado leyendo `src/proxy.ts` antes de escribir esta ruta.
 */
import { NextResponse, type NextRequest } from 'next/server'

import { guardarConexion } from '@/lib/google/conexiones'
import { validarState } from '@/lib/google/estado'
import { intercambiarCodigo } from '@/lib/google/oauth'

function redirigirADashboard(origin: string, gcal: 'conectado' | 'cancelado' | 'error') {
  return NextResponse.redirect(new URL(`/asesor?gcal=${gcal}`, origin))
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const errorGoogle = searchParams.get('error')
  if (errorGoogle) {
    // p. ej. access_denied: el asesor canceló el consentimiento. El valor
    // de `error` lo define Google (nunca trae el token/code), es seguro
    // loguearlo.
    console.warn('[google/oauth/callback] Google devolvió error:', errorGoogle)
    return redirigirADashboard(origin, 'cancelado')
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !state) {
    return redirigirADashboard(origin, 'error')
  }

  let userId: string
  try {
    userId = validarState(state)
  } catch (error) {
    console.warn(
      '[google/oauth/callback] state inválido o expirado:',
      error instanceof Error ? error.message : error
    )
    return redirigirADashboard(origin, 'error')
  }

  try {
    const { refreshToken, email } = await intercambiarCodigo(code, fetch)
    await guardarConexion({ userId, email, refreshToken })
  } catch (error) {
    console.error(
      '[google/oauth/callback] no se pudo completar la conexión:',
      error instanceof Error ? error.message : error
    )
    return redirigirADashboard(origin, 'error')
  }

  return redirigirADashboard(origin, 'conectado')
}
