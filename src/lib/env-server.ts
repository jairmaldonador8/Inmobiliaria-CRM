/**
 * Accesores de variables de entorno solo de servidor. El import de
 * 'server-only' rompe el build si este módulo se importa desde código
 * de cliente.
 */
import 'server-only'

function requerida(valor: string | undefined, nombre: string): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`)
  }
  return valor
}

export function supabaseSecretKey(): string {
  return requerida(process.env.SUPABASE_SECRET_KEY, 'SUPABASE_SECRET_KEY')
}

export function vapidPrivateKey(): string {
  return requerida(process.env.VAPID_PRIVATE_KEY, 'VAPID_PRIVATE_KEY')
}

export function vapidSubject(): string {
  return requerida(process.env.VAPID_SUBJECT, 'VAPID_SUBJECT')
}
