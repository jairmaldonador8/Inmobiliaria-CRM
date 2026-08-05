/**
 * Accesores de variables de entorno validadas, seguras para código de
 * cliente (navegador): solo exponen variables `NEXT_PUBLIC_*`.
 *
 * Para variables solo de servidor (p. ej. `SUPABASE_SECRET_KEY`), usar
 * `src/lib/env-server.ts` — ese módulo no puede importarse desde
 * componentes de cliente.
 */

function requerida(valor: string | undefined, nombre: string): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`)
  }
  return valor
}

export function supabaseUrl(): string {
  return requerida(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
}

export function supabasePublishableKey(): string {
  return requerida(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  )
}

export function vapidPublicKey(): string {
  return requerida(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY')
}
