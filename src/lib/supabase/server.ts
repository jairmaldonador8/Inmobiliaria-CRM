import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { supabasePublishableKey, supabaseUrl } from '@/lib/env'

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Crear un cliente nuevo por petición — nunca un singleton a
 * nivel de módulo.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // Se puede ignorar si el proxy refresca las sesiones.
          }
        },
      },
    }
  )
}
