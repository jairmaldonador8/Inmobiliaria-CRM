import { createBrowserClient } from '@supabase/ssr'

import { supabasePublishableKey, supabaseUrl } from '@/lib/env'

/**
 * Cliente de Supabase para componentes de cliente (navegador).
 */
export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    supabasePublishableKey(),
    // worker: los heartbeats de Realtime siguen vivos en pestañas de fondo
    // (sin él, el navegador acelera los timers y la conexión se cae en silencio).
    { realtime: { worker: true } }
  )
}
