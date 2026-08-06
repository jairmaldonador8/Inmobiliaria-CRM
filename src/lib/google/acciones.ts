'use server'

/**
 * Server Action de desconexión de Google Calendar (Task 7).
 *
 * `requireAsesor()` primera línea (mismo patrón que
 * `src/lib/leads/acciones-asesor.ts`): un asesor solo puede desconectar SU
 * PROPIA conexión — `desconectar` recibe `asesor.user_id`, nunca un id que
 * llegue del cliente.
 */

import { revalidatePath } from 'next/cache'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { desconectar } from '@/lib/google/conexiones'

export type ResultadoAccionGoogle = { ok: true } | { error: string }

const RUTA_DASHBOARD_ASESOR = '/asesor'

/** Desconecta la cuenta de Google del asesor de la sesión actual. */
export async function desconectarGoogle(): Promise<ResultadoAccionGoogle> {
  const asesor = await requireAsesor()

  try {
    await desconectar(asesor.user_id)
  } catch (error) {
    console.error(
      'No se pudo desconectar Google Calendar:',
      error instanceof Error ? error.message : error
    )
    return { error: 'No se pudo desconectar tu cuenta de Google' }
  }

  revalidatePath(RUTA_DASHBOARD_ASESOR)
  return { ok: true }
}
