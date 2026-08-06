/**
 * Inicia el flujo OAuth de Google Calendar del asesor (Task 7).
 *
 * `requireAsesor()` exige sesión de asesor (mismo helper que usan las
 * páginas) y redirige a /login si no hay una — internamente llama a
 * `redirect()` de `next/navigation`, que lanza `NEXT_REDIRECT`. Por eso NO
 * se envuelve en try/catch (ver AGENTS.md de la Task 7: Next.js 16, ese
 * throw debe propagar sin que nada lo atrape).
 *
 * `crearState` liga el flujo al asesor actual (protección CSRF, expira a
 * los 10 min) y `urlAutorizacion` ya fuerza `prompt=consent` — necesario
 * para que Google reenvíe el refresh_token incluso en una reconexión.
 *
 * Ruta SÍ pasa por `src/proxy.ts` (su matcher solo excluye `api/cron`): eso
 * está bien aquí, es justo lo que refresca la sesión antes de que
 * `requireAsesor()` la valide.
 */
import { NextResponse } from 'next/server'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { crearState } from '@/lib/google/estado'
import { urlAutorizacion } from '@/lib/google/oauth'

export async function GET() {
  const asesor = await requireAsesor()

  const state = crearState(asesor.user_id)
  return NextResponse.redirect(urlAutorizacion(state))
}
