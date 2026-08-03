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

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}
