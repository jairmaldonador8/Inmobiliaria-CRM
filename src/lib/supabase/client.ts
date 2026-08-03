import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente de Supabase para componentes de cliente (navegador).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // worker: los heartbeats de Realtime siguen vivos en pestañas de fondo
    // (sin él, el navegador acelera los timers y la conexión se cae en silencio).
    { realtime: { worker: true } }
  )
}
