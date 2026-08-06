import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { supabasePublishableKey, supabaseUrl } from '@/lib/env'

type Rol = 'admin' | 'asesor'

/** Área raíz de cada rol. */
const AREA_POR_ROL: Record<Rol, string> = {
  admin: '/admin',
  asesor: '/asesor',
}

/** Extrae el rol del claim `user_role` (inyectado por el auth hook). */
function rolDesdeClaims(claims: Record<string, unknown> | undefined): Rol | null {
  const rol = claims?.user_role
  return rol === 'admin' || rol === 'asesor' ? rol : null
}

/** Cada rol solo puede acceder a su propia área. */
function rolPuedeAcceder(rol: Rol, path: string): boolean {
  const propia = AREA_POR_ROL[rol]
  const ajenas = Object.values(AREA_POR_ROL).filter((area) => area !== propia)
  return !ajenas.some((area) => path === area || path.startsWith(`${area}/`))
}

/** ¿La ruta pertenece a un área protegida (/admin/*, /asesor/*)? */
function esProtegida(path: string): boolean {
  return Object.values(AREA_POR_ROL).some(
    (area) => path === area || path.startsWith(`${area}/`)
  )
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: sin lógica entre createServerClient y getClaims —
  // getClaims refresca el token; interponer código causa cierres de
  // sesión aleatorios.
  const { data, error: getClaimsError } = await supabase.auth.getClaims()

  if (getClaimsError) {
    console.warn('[proxy] getClaims error:', getClaimsError.message)
  }

  const claims = data?.claims
  const rol = rolDesdeClaims(claims)
  const path = request.nextUrl.pathname

  const redirigir = (destino: string) => {
    const response = NextResponse.redirect(new URL(destino, request.url))
    // Conservar las cookies de sesión refrescadas.
    supabaseResponse.cookies
      .getAll()
      .forEach(({ name, value, ...options }) =>
        response.cookies.set(name, value, options)
      )
    return response
  }

  // Sin sesión: las áreas protegidas redirigen al login (la landing
  // pública vive en /).
  if (!claims && esProtegida(path)) {
    return redirigir('/login')
  }

  // Sesión autenticada sin rol válido: sesión inválida. Cerrarla y
  // enviar a /login (evita el ping-pong /admin ↔ /asesor y el bucle
  // autenticado-sin-rol).
  if (claims && !rol) {
    // scope 'local': invalida solo la sesión de este navegador; no
    // cierra las sesiones del usuario en otros dispositivos.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    const response =
      path === '/' || path === '/login' ? supabaseResponse : redirigir('/login')

    if (signOutError) {
      console.error('[proxy] signOut falló:', signOutError.message)
      // El signOut remoto falló: expirar las cookies de sesión
      // directamente en la respuesta para garantizar que la sesión
      // muere del lado del cliente de todas formas.
      request.cookies.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) {
          response.cookies.set(name, '', { maxAge: 0 })
        }
      })
    }

    return response
  }

  if (rol) {
    // Con sesión válida en la landing o el login: enviar a su área.
    if (path === '/' || path === '/login') {
      return redirigir(AREA_POR_ROL[rol])
    }

    // Guarda de áreas: cada rol solo accede a su propia área.
    if (!rolPuedeAcceder(rol, path)) {
      return redirigir(AREA_POR_ROL[rol])
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico y manifest.webmanifest (el navegador pide el manifest
     *   SIN cookies: si pasara por el proxy, redirigiría a / y la
     *   instalación como app fallaría)
     * - imágenes y estáticos (svg, png, jpg, jpeg, gif, webp, ico)
     * - api/cron (el cron de Vercel manda `Authorization: Bearer
     *   <CRON_SECRET>` sin cookies de sesión; el propio route handler
     *   valida ese secreto. Vercel cron NO sigue redirects, así que si
     *   esta ruta pasara por el proxy moriría en un 307 silencioso a /)
     * - sw.js (el service worker se re-descarga en cada registro,
     *   `updateViaCache: 'none'`; pasarlo por el proxy gasta un
     *   getClaims() en cada fetch y un redirect rompería la registración)
     *
     * El resto de /api SÍ pasa por el proxy; cualquier route handler
     * nuevo que no deba llevar sesión (p. ej. otro webhook público) hay
     * que agregarlo explícitamente aquí.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
