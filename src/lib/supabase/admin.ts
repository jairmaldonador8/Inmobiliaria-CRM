/**
 * Cliente admin de Supabase (service role): usa SUPABASE_SECRET_KEY y
 * OMITE Row Level Security.
 *
 * SOLO para uso en servidor (Server Actions, Route Handlers). NUNCA
 * importar desde componentes de cliente — el import de 'server-only'
 * rompe el build si sucede.
 */
import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { supabaseUrl } from '@/lib/env'
import { supabaseSecretKey } from '@/lib/env-server'

export function createAdminClient() {
  return createClient(
    supabaseUrl(),
    supabaseSecretKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}
