'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarEasyBroker, type ResultadoSync } from '@/lib/easybroker/sync'

/**
 * Server Action para el boton "Sincronizar ahora" (UI en Task 13, pagina
 * /admin/propiedades). Corre el mismo sincronizarEasyBroker() que usa el
 * cron; si una corrida del cron esta en curso, esta llamada regresa con
 * `omitido: true` (lease compartido en sync_estado) en vez de correr en
 * paralelo.
 *
 * Solo admins: requireAdmin() redirige si no hay sesion de admin valida.
 */
export async function sincronizarAhora(): Promise<ResultadoSync> {
  await requireAdmin()

  const supabase = createAdminClient()
  const resultado = await sincronizarEasyBroker(supabase)

  revalidatePath('/admin/propiedades')
  revalidatePath('/admin/bandeja')

  return resultado
}
